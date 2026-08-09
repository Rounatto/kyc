// ============================================================================
// 📊 CRON HEBDOMADAIRE — RAPPORTS DE COMPLIANCE PAR EMAIL + MAINTENANCE
// ============================================================================
// Planifié dans vercel.json (`0 8 * * 1` = tous les lundis 8h). Pas de file
// d'attente/job asynchrone : la route boucle simplement sur tous les abonnés
// et envoie les emails de façon séquentielle dans le temps d'exécution de la
// requête HTTP — acceptable au volume actuel, mais à surveiller si le nombre
// d'entreprises abonnées grandit (risque de timeout serverless).
//
// 🆕 [PHASE B] CETTE ROUTE FAIT MAINTENANT DEUX CHOSES : elle purge d'abord les
// artefacts d'authentification expirés (voir lib/cleanup.ts), puis elle envoie
// les rapports.
//
// 💡 POURQUOI GREFFER LA PURGE ICI PLUTÔT QUE CRÉER /api/cron/cleanup : le plan
// gratuit de Vercel plafonne le nombre de tâches planifiées. Consommer un slot
// pour supprimer quelques lignes par semaine serait un mauvais arbitrage.
// Bénéfice secondaire non négligeable : la purge hérite du contrôle
// CRON_SECRET ci-dessous, donc du test Playwright qui vérifie déjà qu'un appel
// non authentifié est rejeté — aucune protection à réécrire.
//
// 🆕 [FIX] LES MÉTRIQUES MESURAIENT LA MAUVAISE CHOSE.
// Les compteurs "approuvé" et "rejeté" filtraient sur `submittedAt`, c'est-à-dire
// la date de DÉPÔT du dossier. Le rapport répondait donc à la question "parmi
// les dossiers reçus cette semaine, combien sont approuvés aujourd'hui ?" au
// lieu de "qu'a fait mon équipe cette semaine ?".
//
// Conséquence concrète : un agent traitant lundi 50 dossiers déposés le mois
// précédent voyait "Successfully Approved: 0" — tout son travail invisible.
// Et l'écart entre le total et la somme approuvé+rejeté (les dossiers encore
// en attente) n'était expliqué nulle part, ce qui donnait l'impression de
// chiffres faux.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendWeeklyReportEmail } from "@/lib/mail";
// 🆕 [PHASE B] Purge des OtpCode et PasswordResetToken expirés.
import { purgeExpiredAuthArtifacts, type CleanupResult } from "@/lib/cleanup";

// Cette route est appelée par le robot Vercel CRON, pas par un utilisateur depuis le navigateur.
export async function GET(req: Request) {
    // 🔒 Vercel Cron auth: reject any caller that doesn't present the shared secret,
    // BEFORE touching the database. Vercel sends "Authorization: Bearer <CRON_SECRET>".
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ========================================================================
    // 🆕 [PHASE B] ÉTAPE 0 — MAINTENANCE, AVANT TOUT LE RESTE
    // ========================================================================
    // ⚠️ LA POSITION N'EST PAS ARBITRAIRE, ELLE EST LE CŒUR DU CORRECTIF.
    //
    // 1. AVANT LA BOUCLE D'EMAILS. Le commentaire en tête de ce fichier signale
    //    que les envois sont séquentiels et qu'un nombre croissant d'abonnés
    //    risque de faire dépasser la limite de temps serverless. Placée après,
    //    la purge serait la PREMIÈRE chose sacrifiée par ce timeout — et elle
    //    cesserait de tourner silencieusement, exactement au moment où la base
    //    grossit et où elle devient utile.
    //
    // 2. AVANT LE `return` "aucun abonné" plus bas. Ce retour anticipé existait
    //    déjà ; une purge placée après lui ne s'exécuterait jamais tant que
    //    personne n'a activé le rapport hebdomadaire — c'est-à-dire dans l'état
    //    actuel du projet.
    //
    // 🔒 ÉCHEC NON BLOQUANT. Si la purge échoue (incident base, timeout de
    // requête), on journalise et on continue vers les rapports. Une opération
    // de ménage ne doit jamais empêcher la fonction MÉTIER de cette route de
    // s'exécuter — la prochaine exécution hebdomadaire rattrapera les lignes
    // manquées, elles ne coûtent rien en attendant.
    let cleanup: CleanupResult | null = null;
    try {
        cleanup = await purgeExpiredAuthArtifacts();
        // On ne journalise que si quelque chose a réellement été supprimé :
        // une ligne "0 supprimé" chaque semaine noierait les exécutions
        // intéressantes dans le bruit des logs Vercel.
        if (cleanup.otpCodes > 0 || cleanup.passwordResetTokens > 0) {
            console.log(
                `🧹 [CLEANUP] ${cleanup.otpCodes} code(s) OTP et ${cleanup.passwordResetTokens} jeton(s) de réinitialisation supprimés.`
            );
        }
    } catch (cleanupError) {
        console.error("🧹 [CLEANUP] Échec de la purge (non bloquant) :", cleanupError);
    }

    try {
        // 1. Trouver tous les utilisateurs qui ont activé l'option Weekly Report
        const subscribers = await prisma.user.findMany({
            where: { emailNotifWeekly: true },
            include: { company: true } // On a besoin de connaître leur entreprise
        });

        if (subscribers.length === 0) {
            // 🆕 [PHASE B] Le résultat de la purge remonte aussi dans ce retour
            // anticipé. Sans ça, une exécution sans abonné répondrait "rien à
            // faire" alors qu'un vrai nettoyage vient d'avoir lieu — et on
            // croirait la maintenance inactive en relisant les logs.
            return NextResponse.json({
                message: "No active subscribers for weekly reports.",
                cleanup
            });
        }

        // 2. Définir la fenêtre de temps (Les 7 derniers jours)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 3. Boucler sur chaque abonné pour compiler son rapport
        for (const sub of subscribers) {
            if (!sub.companyId) continue;

            // ================================================================
            // 🆕 [FIX] DEUX FENÊTRES TEMPORELLES DISTINCTES
            // ================================================================
            // Le rapport mélangeait deux questions sans le dire :
            //
            //   • CE QUI EST ARRIVÉ  → date de dépôt (`submittedAt`)
            //   • CE QUI A ÉTÉ FAIT  → date de décision (`updatedAt`)
            //
            // Ce sont deux mesures légitimes, mais elles ne répondent pas à la
            // même chose. Un rapport d'activité hebdomadaire doit refléter le
            // TRAVAIL ACCOMPLI, sinon il ne sert à rien à un responsable qui
            // veut savoir ce que son équipe a produit.
            //
            // 💡 `updatedAt` est mis à jour automatiquement par Prisma
            // (@updatedAt dans le schéma) à chaque modification. Pour un dossier
            // passé en "verified" ou "rejected", c'est donc bien la date de la
            // DÉCISION de l'agent — exactement ce qu'on cherche.
            const [submitted, pending, approved, rejected, highRisk] = await Promise.all([
                // ── FENÊTRE "ARRIVÉE" : dossiers déposés cette semaine ──
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, submittedAt: { gte: sevenDaysAgo } } 
                }),

                // 🆕 EN ATTENTE — la ligne qui manquait et rendait le rapport
                // incompréhensible. Sans elle, l'écart entre le total et la somme
                // approuvé+rejeté donnait l'impression que des dossiers avaient
                // disparu. C'est aussi la métrique la plus actionnable du rapport :
                // elle dit à un responsable ce qu'il reste à traiter.
                //
                // ⚠️ Pas de filtre de date ici, et c'est VOULU : un dossier déposé
                // il y a trois semaines et toujours en attente est justement le
                // plus préoccupant. Le limiter aux 7 derniers jours masquerait
                // précisément les retards qu'on veut faire remonter.
                prisma.verificationRequest.count({
                    where: { companyId: sub.companyId, status: "pending" }
                }),

                // ── FENÊTRE "ACTIVITÉ" : décisions prises cette semaine ──
                // 🆕 `updatedAt` au lieu de `submittedAt`.
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, status: "verified", updatedAt: { gte: sevenDaysAgo } } 
                }),
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, status: "rejected", updatedAt: { gte: sevenDaysAgo } } 
                }),

                // 🆕 HAUT RISQUE : reste sur `submittedAt`, et c'est délibéré.
                // Le niveau de risque est calculé par le moteur AU MOMENT DE LA
                // CRÉATION du dossier et ne change plus ensuite. Compter sur
                // `updatedAt` ferait donc réapparaître dans le rapport un vieux
                // dossier à haut risque simplement parce qu'un agent l'a rouvert
                // — un signalement trompeur.
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, riskLevel: "High", submittedAt: { gte: sevenDaysAgo } } 
                })
            ]);

            // 🆕 Condition d'envoi élargie. Avant, on ne testait que `total` :
            // une semaine sans nouveau dépôt mais avec 40 anciens dossiers
            // traités ne déclenchait AUCUN rapport, alors que c'est précisément
            // la semaine où l'équipe a le plus travaillé.
            const hasActivity = submitted > 0 || approved > 0 || rejected > 0;
            if (!hasActivity) continue;

            // 4. Envoi de l'e-mail compilé
            await sendWeeklyReportEmail(sub.email, sub.fullName, {
                submitted,
                pending,
                approved,
                rejected,
                highRisk
            });
        }

        // 🆕 [PHASE B] `cleanup` ajouté à la réponse : c'est ce qui rend la purge
        // observable dans les logs Vercel sans avoir à interroger la base.
        return NextResponse.json({ success: true, processedUsers: subscribers.length, cleanup });

    } catch (error) {
        console.error("❌ CRON JOB ERROR:", error);
        return NextResponse.json({ error: "Failed to generate weekly reports" }, { status: 500 });
    }
}