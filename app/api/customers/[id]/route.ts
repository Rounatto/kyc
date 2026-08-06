// ============================================================================
// 📂 DOSSIER KYC INDIVIDUEL — DÉTAIL (GET) + DÉCISION AGENT (PATCH)
// ============================================================================
// GET renvoie un dossier avec tout son historique d'audit (pour l'écran de
// détail). PATCH est LA route où un agent humain rend sa décision finale
// (approuver/rejeter) après avoir revu le score automatique du moteur KYC —
// c'est le point de contrôle humain du pipeline (human-in-the-loop), et
// chaque décision déclenche en cascade : ligne d'audit, notification interne
// dashboard, email aux agents abonnés, email au client final.
//
// 🆕 [PHASE B] GET est devenu le SEUL point d'accès aux documents KYC. Les
// fichiers vivent dans un bucket Supabase privé et ne sont plus atteignables
// par une URL publique : cette route fabrique, à chaque appel, des liens
// signés à durée de vie très courte — et seulement après avoir vérifié que le
// demandeur appartient bien à l'entreprise propriétaire du dossier.
//
// 🆕 [CONFORMITÉ] PATCH reçoit désormais DEUX textes pour un rejet : le motif
// interne (piste d'audit) et le message client (email). Voir le bloc dédié
// plus bas — c'est une obligation légale, pas un raffinement.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendKYCEmail, sendAgentNotificationEmail } from "@/lib/mail";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
// 🆕 [PHASE B] Signature groupée des URLs de consultation.
import { createSignedDocumentUrls } from "@/lib/storage";

// 🆕 [PHASE B] Durée de vie des liens de consultation.
// 5 minutes : assez pour qu'un agent ouvre la fiche et examine les documents
// (y compris en zoom plein écran), assez court pour qu'un lien copié par
// mégarde — dans un historique de navigateur, un log de proxy, une capture
// d'écran — soit déjà périmé quand quelqu'un tombe dessus.
const DOCUMENT_URL_TTL_SECONDS = 5 * 60;

// ============================================================================
// 🆕 [CONFORMITÉ] MESSAGE DE REPLI ENVOYÉ AU CLIENT
// ============================================================================
// Utilisé quand aucun `customerMessage` n'accompagne la requête.
//
// ⚠️ CE REPLI EST VOLONTAIREMENT GÉNÉRIQUE, ET C'EST LE POINT LE PLUS IMPORTANT
// DE CE FICHIER. La tentation serait d'écrire `customerMessage ?? rejectionReason` —
// après tout, autant envoyer quelque chose d'utile plutôt qu'un texte vague.
// Ce serait ROUVRIR LA FAILLE : il suffirait qu'un navigateur serve une version
// en cache de la page de détail, ou qu'un appel API direct omette le champ,
// pour que le motif interne reparte au client. Un garde-fou qui cède au premier
// cas limite ne protège rien.
//
// Un message générique est moins informatif, mais il n'expose jamais rien.
// Face à un risque pénal, c'est le bon compromis.
const GENERIC_CUSTOMER_MESSAGE =
    "We are unable to complete your verification at this time. Please contact our support team for assistance.";

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        // 🔒 LE CONTRÔLE D'ACCÈS AUX DOCUMENTS SE JOUE ICI, ET NULLE PART AILLEURS.
        // Le filtre `companyId` de cette requête est ce qui garantit qu'un agent
        // de l'entreprise A ne peut pas obtenir le dossier — donc les documents —
        // de l'entreprise B : la requête renvoie simplement `null`, et on répond
        // 404 juste en dessous. Aucune URL signée n'est fabriquée si on n'arrive
        // pas jusqu'ici.
        //
        // 💡 C'est aussi la raison pour laquelle il n'existe pas de route
        // séparée dédiée aux documents : elle devrait refaire exactement cette
        // vérification, et deux copies d'un même contrôle de sécurité finissent
        // toujours par diverger.
        const customer = await prisma.verificationRequest.findUnique({
            where: { 
                id: customerId,
                companyId: companyId!
            },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' },
                    include: { agent: { select: { fullName: true } } }
                }
            }
        });

        if (!customer) {
            return NextResponse.json({ message: "Customer not found or unauthorized access." }, { status: 404 });
        }

        // ====================================================================
        // 🆕 [PHASE B] FABRICATION DES LIENS D'AFFICHAGE
        // ====================================================================
        // `idCardPath` n'est PAS affichable : c'est une coordonnée interne au
        // bucket privé ("cmp_a1b2/9f8e-idcard.jpg"), sans domaine ni protocole.
        // La coller dans un navigateur ne donne rien. Il faut demander à Supabase
        // de la transformer en adresse signée temporaire.
        //
        // 💡 On expose le résultat sous de NOUVEAUX noms (`idCardDisplayUrl`)
        // plutôt que d'écraser `idCardUrl`. Le frontend aurait certes moins
        // changé, mais le nom aurait menti : quelqu'un lisant `idCardUrl`
        // croirait tenir une adresse durable et pourrait la mettre en cache ou
        // la stocker. "Display" annonce la couleur — c'est un lien pour afficher
        // maintenant, et il périme.
        let idCardDisplayUrl: string | null = null;
        let selfieDisplayUrl: string | null = null;

        try {
            // On rassemble les chemins réellement présents avant de signer.
            // Un dossier peut n'avoir qu'un seul document, et les dossiers
            // antérieurs à cette migration n'en ont aucun.
            const pathsToSign: string[] = [];
            if (customer.idCardPath) pathsToSign.push(customer.idCardPath);
            if (customer.selfiePath) pathsToSign.push(customer.selfiePath);

            if (pathsToSign.length > 0) {
                // 💡 Signature GROUPÉE : un seul aller-retour vers Supabase pour
                // les deux documents, au lieu de deux appels successifs.
                const signedUrls = await createSignedDocumentUrls(
                    pathsToSign,
                    DOCUMENT_URL_TTL_SECONDS
                );

                if (customer.idCardPath) {
                    idCardDisplayUrl = signedUrls[customer.idCardPath] ?? null;
                }
                if (customer.selfiePath) {
                    selfieDisplayUrl = signedUrls[customer.selfiePath] ?? null;
                }
            }
        } catch (storageError) {
            // 🔒 ÉCHEC NON BLOQUANT, ET C'EST DÉLIBÉRÉ.
            // Si Supabase est injoignable ou si un fichier a disparu du bucket,
            // on ne fait PAS échouer toute la requête : l'agent doit pouvoir
            // continuer à consulter le dossier, son score, son historique
            // d'audit et rendre sa décision. Les documents s'afficheront comme
            // indisponibles, ce qui est un dégradé acceptable — bien préférable
            // à un écran d'erreur qui bloquerait tout le travail de conformité.
            console.error("[DOCUMENTS] Échec de signature des URLs :", storageError);
        }

        
        // On renvoie le dossier complet, augmenté des deux liens d'affichage.
        // 💡 Les champs `idCardPath`/`selfiePath` restent présents dans la
        // réponse : ce n'est pas une fuite (un chemin n'ouvre aucun accès), et
        // ça évite au frontend de devoir deviner si un dossier utilise l'ancien
        // ou le nouveau stockage.
        return NextResponse.json({
            ...customer,
            idCardDisplayUrl,
            selfieDisplayUrl,
        });
    } catch (error: any) {
        console.error("GET Error:", error);
        return NextResponse.json({ message: "Internal server error." }, { status: 500 });
    }
}

export async function PATCH(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: serverAgentId } = guard;
        const serverAgentName = session?.user?.name || "Unknown Agent";

        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        const existingCustomer = await prisma.verificationRequest.findUnique({
            where: { id: customerId, companyId: companyId! }
        });

        if (!existingCustomer) {
            return NextResponse.json({ message: "Customer not found or unauthorized." }, { status: 404 });
        }

        const body = await req.json();

        // --- LOGIQUE DE FLAG MANUEL (AUDIT) ---
        // Un agent peut signaler un dossier pour revue interne SANS changer
        // son statut KYC (ex: doute sur un dossier déjà "verified"). Ça ne
        // fait qu'ajouter une ligne d'audit + alerter les abonnés "Alerts".
        if (body.action === "FLAG_AUDIT") {
            const flaggedCustomer = await prisma.verificationRequest.update({
                where: { id: customerId },
                data: {
                    auditLogs: {
                        create: {
                            action: "FLAGGED",
                            details: `Profile manually flagged for internal security audit by ${serverAgentName}. Immediate attention required.`,
                            agentId: serverAgentId!,
                            companyId: companyId!
                        }
                    }
                }
            });

            // 💡 NOTIFICATION PAR EMAIL (Routage selon Settings: emailNotifAlerts)
            const alertSubscribers = await prisma.user.findMany({
                where: { companyId: companyId!, emailNotifAlerts: true }
            });
            for (const admin of alertSubscribers) {
                sendAgentNotificationEmail(admin.email, "ALERT", existingCustomer.customerName, serverAgentName).catch(console.error);
            }

            return NextResponse.json(flaggedCustomer);
        }

        // --- DÉCISION FINALE DE L'AGENT (le vrai changement de statut KYC) ---
        //
        // 🆕 [CONFORMITÉ] Deux textes distincts au lieu d'un seul :
        //   `rejectionReason`  → motif INTERNE, alimente la piste d'audit
        //   `customerMessage`  → le seul texte que le client verra par email
        //
        // ⚠️ POURQUOI CETTE SÉPARATION EST OBLIGATOIRE : pour un rejet lié à des
        // sanctions financières ou à une suspicion de blanchiment, la plupart
        // des juridictions INTERDISENT de révéler la raison à la personne
        // concernée — c'est le "tipping off", un délit pénal en Tunisie comme
        // dans l'UE. Jusqu'ici, le motif sélectionné par l'agent partait tel
        // quel dans l'email : choisir "correspondance sur liste de sanctions"
        // mettait l'entreprise cliente en infraction sans que personne ne le
        // remarque.
        const { status, rejectionReason, customerMessage } = body;

        if (!status || !["verified", "rejected", "pending"].includes(status)) {
            return NextResponse.json({ message: "Invalid status value." }, { status: 400 });
        }

        let actionName = "UPDATED";
        let logDetails = `Status changed to ${status} by ${serverAgentName}.`;

        if (status === "verified") {
            actionName = "APPROVED";
            logDetails = `KYC Profile manually approved by ${serverAgentName}.`;
        } else if (status === "rejected") {
            actionName = "REJECTED";
            // 💡 C'est bien `rejectionReason` — le motif PRÉCIS — qui est
            // consigné ici. La piste d'audit doit dire exactement pourquoi la
            // décision a été prise ; c'est sa raison d'être, et elle n'est
            // consultable que par les agents de l'entreprise.
            logDetails = `KYC Profile rejected by ${serverAgentName}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        }
        
        const updatedCustomer = await prisma.verificationRequest.update({
            where: { id: customerId },
            data: { 
                status,
                auditLogs: {
                    create: {
                        action: actionName,
                        details: logDetails,
                        agentId: serverAgentId!,
                        companyId: companyId!
                    }
                }
            },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' } 
                }
            }
        });

        // 💡 NOTIFICATIONS TEMPS RÉEL SUR LE DASHBOARD
        // 💡 Notifications INTERNES : elles restent volontairement sobres et ne
        // reprennent pas le motif. La cloche du dashboard sert à alerter qu'une
        // décision a été prise ; le détail se lit dans l'audit trail du dossier.
        if (status === "verified") {
            await prisma.notification.create({
                data: {
                    type: "SUCCESS",
                    title: "KYC Profile Approved",
                    message: `The profile for ${existingCustomer.customerName} was manually verified and approved by ${serverAgentName}.`,
                    companyId: companyId!
                }
            });
        } else if (status === "rejected") {
            await prisma.notification.create({
                data: {
                    type: "SYSTEM",
                    title: "KYC Profile Rejected",
                    message: `The profile for ${existingCustomer.customerName} was rejected by ${serverAgentName}.`,
                    companyId: companyId!
                }
            });
        }

        // 💡 NOTIFICATION PAR EMAIL (Pour les Agents, basé sur les Settings)
        try {
            const subscribers = await prisma.user.findMany({
                where: { 
                    companyId: companyId!, 
                    OR: [
                        { emailNotifSuccess: status === "verified" },
                        { emailNotifAlerts: status === "rejected" }
                    ]
                }
            });

            const emailType = status === "verified" ? "SUCCESS" : "ALERT";
            
            // On envoie à tous les agents abonnés de manière asynchrone pour ne pas ralentir le serveur
            for (const sub of subscribers) {
                sendAgentNotificationEmail(sub.email, emailType, existingCustomer.customerName, serverAgentName).catch(console.error);
            }
        } catch (subError) {
            console.error("Failed to query notification subscribers:", subError);
        }

        // 💡 EMAIL EXTERNE (Pour le Client final)
        // ✅ `customerName` et le message sont échappés dans le template (voir
        // escapeHtml dans lib/mail.ts) — plus de risque d'injection HTML dans
        // l'email envoyé depuis notre domaine.
        //
        // 🆕 CORRECTION D'UN PIÈGE JS : `sendKYCEmail(...)` n'était pas "await"é,
        // donc le try/catch qui l'entourait ne captait RIEN — le bloc était déjà
        // sorti quand la promesse se résolvait. Une erreur SMTP devenait une
        // "unhandled promise rejection" silencieuse, invisible dans les logs.
        // On garde volontairement l'envoi NON bloquant (l'agent ne doit pas
        // attendre le serveur mail pour voir sa décision prise), mais avec un
        // `.catch()` attaché — le même motif que pour les emails d'agents
        // ci-dessus, qui lui était déjà correct.
        if (status === "verified" || status === "rejected") {
            // 🆕 [CONFORMITÉ] C'EST LA LIGNE QUI FERME LA FAILLE : on envoie
            // `customerMessage`, jamais `rejectionReason`. Le motif interne
            // reste confiné à la piste d'audit (voir logDetails plus haut),
            // consultable uniquement par les agents de l'entreprise.
            //
            // ⚠️ Le repli est GÉNÉRIQUE, pas `?? rejectionReason` — voir la
            // note sur GENERIC_CUSTOMER_MESSAGE en haut de ce fichier.
            const safeCustomerMessage = customerMessage || GENERIC_CUSTOMER_MESSAGE;

            sendKYCEmail(
                updatedCustomer.email, 
                status, 
                updatedCustomer.customerName, 
                // 💡 Pour une approbation, ce paramètre est ignoré par le
                // template (voir lib/mail.ts) : on le passe quand même, la
                // fonction gère les deux statuts avec la même signature.
                safeCustomerMessage
            ).catch((emailError) => {
                console.error("Async Email Dispatch Failure:", emailError);
            });
        }

        return NextResponse.json(updatedCustomer);
    } catch (error: any) {
        console.error("PATCH Error:", error);
        return NextResponse.json({ message: "Failed to update customer status." }, { status: 500 });
    }
}