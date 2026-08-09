// ============================================================================
// ✅ INSCRIPTION — ÉTAPE 2/2 : VÉRIFICATION OTP + CRÉATION DU WORKSPACE
// ============================================================================
// Fonctionne en tandem avec app/api/register (étape 1) : register génère un
// code à 6 chiffres et l'envoie par email, SANS créer aucun compte. Ce n'est
// qu'ICI, une fois le bon code fourni, que l'entreprise (Company) et son
// administrateur (User, role=COMPANY_ADMIN) sont réellement créés. Cette
// séparation empêche de créer des comptes avec des emails qu'on ne possède pas.
//
// ✅ [PHASE B — RÉSOLU] Le brute-force de l'OTP est désormais bloqué par TROIS
// protections complémentaires. Avant ces correctifs, rien ne comptait les
// tentatives : un script pouvait parcourir les 1 000 000 de combinaisons
// pendant les 10 minutes de validité du code.
//   1. Rate limiting par adresse IP    (item 3 — lib/ratelimit.ts)
//   2. Rate limiting par email         (item 3 — lib/ratelimit.ts)
//   3. Compteur lié AU CODE lui-même   (item 4 — ce fichier + OtpCode.attempts)
//
// 💡 Les deux premières bornent un ÉMETTEUR sur une fenêtre de temps ; la
// troisième borne le nombre de fois qu'un SECRET peut être deviné, sans notion
// de temps ni d'origine. Voir le commentaire de `OtpCode.attempts` dans
// prisma/schema.prisma pour le scénario précis que le rate limiting seul
// laissait passer.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
// 🆕 [PHASE B] Comparaison en temps constant (module Node natif).
import crypto from "crypto";
// 🆕 [PHASE B] Limitation du nombre de requêtes (Upstash Redis).
import {
    enforceRateLimit,
    getClientIp,
    otpVerifyByIpLimiter,
    otpVerifyByEmailLimiter,
} from "@/lib/ratelimit";

// ----------------------------------------------------------------------------
// 🆕 [PHASE B — item 4] PLAFOND DE TENTATIVES PAR CODE
// ----------------------------------------------------------------------------
// 5 essais. Le chiffre est un compromis :
//   • Assez large pour un humain — le code fait 6 chiffres, il est copié depuis
//     un email ; se tromper une ou deux fois (mauvais code, ancien email encore
//     ouvert dans un onglet) est banal.
//   • Assez étroit pour un attaquant — 5 essais sur 1 000 000 de combinaisons,
//     c'est 0,0005 % de chances de tomber juste. Même en enchaînant les 3 codes
//     autorisés par heure (plafond de /api/register), le débit plafonne à 15
//     essais/heure, soit ~131 000 par an : il faudrait en moyenne près de
//     4 ANS d'attaque ininterrompue pour un seul compte — et l'inondation
//     d'emails que ça produirait serait visible bien avant.
const MAX_OTP_ATTEMPTS = 5;

// ----------------------------------------------------------------------------
// 🆕 [PHASE B] COMPARAISON EN TEMPS CONSTANT
// ----------------------------------------------------------------------------
// Pourquoi ne pas simplement écrire `a !== b` : l'opérateur `!==` de JavaScript
// s'arrête au PREMIER caractère qui diffère. Comparer "123456" à "999999" est
// donc mesurablement plus rapide que le comparer à "123459". Cet écart de durée
// — quelques nanosecondes — fuite de l'information : un attaquant qui chronomètre
// les réponses peut deviner le code chiffre par chiffre (6 × 10 essais = 60
// mesures) au lieu de le chercher parmi un million. C'est une « attaque par
// canal auxiliaire temporel ».
//
// ⚠️ HONNÊTEMENT : sur une route serverless traversant Internet, la gigue réseau
// (des millisecondes) noie largement ce signal — l'attaque est ici plus théorique
// que praticable. On l'applique quand même parce que c'est deux lignes, que le
// coût est nul, et que c'est le réflexe correct pour toute comparaison de secret.
//
// `timingSafeEqual` compare TOUJOURS l'intégralité des octets, quelle que soit
// la position de la première différence. Il exige des Buffers de longueur
// identique (il lève une exception sinon) : le test de longueur en amont n'est
// donc pas une optimisation, il est obligatoire. Il ne fuite rien de sensible —
// la longueur d'un OTP est publique, elle est écrite dans l'email.
function isOtpMatch(submitted: string, stored: string): boolean {
    const a = Buffer.from(submitted, "utf8");
    const b = Buffer.from(stored, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Schéma Zod qui inclut maintenant l'OTP
const verifyRegisterSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    password: z.string().min(12, "Le mot de passe doit faire au moins 12 caractères"),
    fullName: z.string().min(2, "Le nom doit faire au moins 2 caractères").trim(),
    companyName: z.string().min(2, "Le nom de l'entreprise doit faire au moins 2 caractères").trim(),
    otpCode: z.string().length(6, "Le code de vérification doit contenir exactement 6 chiffres"),
});

export async function POST(req: Request) {
    try {
        // ====================================================================
        // 🆕 [PHASE B] BARRAGE 1/2 — LIMITE PAR ADRESSE IP
        // ====================================================================
        // Placé en TOUT PREMIER, avant même de lire le corps de la requête :
        // une requête bloquée ne doit consommer aucune ressource inutile (ni
        // parsing JSON, ni la moindre requête base de données).
        //
        // Cette limite arrête le cas le plus courant : un script qui martèle la
        // route depuis une seule machine.
        const clientIp = getClientIp(req);
        const ipLimited = await enforceRateLimit(otpVerifyByIpLimiter, clientIp);
        if (ipLimited) return ipLimited;

        const body = await req.json();

        // 1. Validation du payload
        const validationResult = verifyRegisterSchema.safeParse(body);
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues.map((err) => err.message).join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { email, password, fullName, companyName, otpCode } = validationResult.data;

        // ====================================================================
        // 🆕 [PHASE B] BARRAGE 2/2 — LIMITE PAR EMAIL
        // ====================================================================
        // Ne peut se faire qu'ICI : il fallait d'abord lire et valider le corps
        // de la requête pour connaître l'email visé.
        //
        // Pourquoi cette seconde limite alors qu'on filtre déjà par IP : un
        // attaquant disposant de nombreuses adresses IP (proxies, botnet) peut
        // rester sous le seuil sur CHAQUE IP tout en accumulant des milliers de
        // tentatives sur UN MÊME compte. La limite par IP ne verrait rien
        // passer ; celle-ci bloque l'attaque quelle que soit son origine.
        //
        // 💡 On utilise `email` (déjà normalisé en minuscules et détrimé par
        // Zod juste au-dessus) et non la valeur brute : sans ça, "A@Mail.com"
        // et "a@mail.com" compteraient dans deux compteurs distincts, ce qui
        // doublerait le quota réel d'un attaquant.
        const emailLimited = await enforceRateLimit(otpVerifyByEmailLimiter, email);
        if (emailLimited) return emailLimited;

        // ====================================================================
        // 🛡️ ÉTAPE CRITIQUE : VÉRIFICATION DE L'OTP
        // ====================================================================
        const otpRecord = await prisma.otpCode.findUnique({
            where: { email }
        });

        if (!otpRecord) {
            return NextResponse.json({ error: "Aucun code de vérification n'a été demandé pour cet email ou le code a expiré." }, { status: 400 });
        }

        // --------------------------------------------------------------------
        // 🆕 [PHASE B — item 4] CONTRÔLE 1/3 — EXPIRATION, AVANT TOUT LE RESTE
        // --------------------------------------------------------------------
        // ⚠️ L'ORDRE A CHANGÉ, ET CE N'EST PAS COSMÉTIQUE. Avant, la comparaison
        // du code passait AVANT ce test : un code expiré mais correct répondait
        // « expiré » (donc : « tu avais le bon code »), tandis qu'un code expiré
        // et faux répondait « incorrect ». Deux messages différents = un oracle
        // qui confirme à l'attaquant qu'il a trouvé la bonne valeur, même hors
        // délai. En testant l'expiration d'abord, la réponse est identique dans
        // les deux cas.
        //
        // 💡 Second bénéfice : un code périmé ne consomme plus de tentative. Sans
        // ça, un utilisateur revenant après le déjeuner brûlerait son quota sur
        // un code de toute façon mort.
        if (new Date() > otpRecord.expiresAt) {
            // Nettoyage du code expiré (emporte son compteur avec lui).
            //
            // 🆕 `deleteMany` et non `delete` : `delete` lève une exception si la
            // ligne a déjà disparu (P2025), ce qui arrive dès que deux requêtes du
            // même utilisateur se croisent — un double-clic suffit. Le 500 qui en
            // résulterait serait un faux problème : le nettoyage a bien eu lieu,
            // simplement par l'autre requête. `deleteMany` supprime 0 ou 1 ligne
            // sans jamais protester. Même raisonnement partout ailleurs dans ce
            // fichier, hors transaction.
            await prisma.otpCode.deleteMany({ where: { email } });
            return NextResponse.json({ error: "Ce code de vérification a expiré. Veuillez demander un nouveau code." }, { status: 400 });
        }

        // --------------------------------------------------------------------
        // 🆕 [PHASE B — item 4] CONTRÔLE 2/3 — INCRÉMENT DU COMPTEUR
        // --------------------------------------------------------------------
        // ⚠️ ON INCRÉMENTE AVANT DE COMPARER, JAMAIS APRÈS. Si on comptabilisait
        // la tentative seulement en cas d'échec, deux requêtes simultanées
        // pourraient lire `attempts = 4` en même temps, échouer toutes les deux,
        // et écrire chacune `5` — une tentative disparaîtrait. Répété en
        // parallèle, ce décompte fantôme rend le plafond contournable. En
        // incrémentant d'abord, chaque requête a déjà « payé » son essai avant
        // même de savoir si elle a raison.
        //
        // 💡 `{ increment: 1 }` délègue le calcul à PostgreSQL (`SET attempts =
        // attempts + 1`), qui verrouille la ligne le temps de l'opération. C'est
        // atomique par construction. Un `attempts: otpRecord.attempts + 1` en
        // JavaScript, lui, reposerait sur une valeur lue AVANT — exactement la
        // situation de concurrence qu'on veut éviter.
        //
        // Le code n'est pas supprimé ici en cas de succès : c'est la transaction
        // plus bas qui s'en charge, pour que la suppression et la création du
        // workspace réussissent ou échouent ensemble.
        //
        // ⚠️ Ce `update` peut échouer légitimement : entre le `findUnique`
        // ci-dessus et cette ligne, une requête concurrente a pu épuiser le quota
        // et supprimer la ligne. Prisma lève alors P2025 (« enregistrement
        // introuvable »). Sans ce filet, ce cas de course remonterait en 500 —
        // une erreur serveur alors que le système a en réalité fonctionné comme
        // prévu. On renvoie donc le même message que pour un code inexistant.
        const counter = await (prisma.otpCode as any)
            .update({
                where: { email },
                data: { attempts: { increment: 1 } },
                select: { attempts: true },
            } as any)
            .catch(() => null);

        if (!counter) {
            return NextResponse.json(
                { error: "Aucun code de vérification n'a été demandé pour cet email ou le code a expiré." },
                { status: 400 }
            );
        }

        const attempts = (counter as any).attempts as number;

        // Strictement supérieur : à `attempts === MAX_OTP_ATTEMPTS`, l'essai en
        // cours est le 5e — il a le droit d'être évalué. On ne bloque qu'à partir
        // du 6e, sinon on n'accorderait en réalité que 4 essais.
        //
        // 💡 EN THÉORIE CE BLOC NE SE DÉCLENCHE JAMAIS : la branche d'échec plus
        // bas détruit déjà le code au 5e essai raté, il ne peut donc pas y avoir
        // de 6e. On le garde comme filet — si une suppression échoue (incident
        // Postgres, transaction annulée), c'est la dernière chose qui empêche un
        // code d'être deviné indéfiniment. Une protection qui repose sur une
        // seule ligne de nettoyage n'en est pas vraiment une.
        if (attempts > MAX_OTP_ATTEMPTS) {
            // 🔒 Le code est DÉTRUIT, pas seulement refusé. Tant qu'il existe, il
            // reste devinable ; le supprimer met fin à l'attaque définitivement.
            // L'utilisateur légitime repasse par /api/register (3 envois/heure max).
            await prisma.otpCode.deleteMany({ where: { email } });

            // Pas de logSecurityEvent ici : AuditLog exige un `companyId`, or à ce
            // stade du parcours l'entreprise n'existe pas encore (elle est créée
            // plus bas). D'où un log applicatif — sans le code ni le contenu de la
            // tentative, qui n'ont rien à faire dans les journaux.
            console.warn(
                `[SECURITY] Code OTP invalidé après ${MAX_OTP_ATTEMPTS} échecs — email=${email} ip=${clientIp}`
            );

            return NextResponse.json(
                {
                    error: "Trop de tentatives incorrectes. Ce code a été désactivé, veuillez en demander un nouveau.",
                    code: "OTP_LOCKED",
                },
                { status: 400 }
            );
        }

        // --------------------------------------------------------------------
        // 🆕 [PHASE B — item 4] CONTRÔLE 3/3 — COMPARAISON DU CODE
        // --------------------------------------------------------------------
        if (!isOtpMatch(otpCode, otpRecord.code)) {
            const remaining = MAX_OTP_ATTEMPTS - attempts;

            // 💡 Quota épuisé PAR CET ÉCHEC : on détruit le code tout de suite
            // plutôt que d'attendre qu'une 6e requête vienne le faire. Laisser un
            // secret mort-vivant en base est inutile, et ça évite qu'une panne
            // Redis (le rate limiting est en « fail-open », voir lib/ratelimit.ts)
            // n'ouvre une fenêtre où il serait encore attaquable.
            if (remaining <= 0) {
                await prisma.otpCode.deleteMany({ where: { email } });
                console.warn(
                    `[SECURITY] Code OTP invalidé après ${MAX_OTP_ATTEMPTS} échecs — email=${email} ip=${clientIp}`
                );
            }

            // 💡 On annonce les tentatives restantes. Ça n'aide en rien un
            // attaquant — il sait déjà combien d'essais il a consommés — mais ça
            // évite à un utilisateur réel de voir son code se désactiver sans
            // prévenir, ce qui déclenche des tickets support et un renvoi d'email
            // (donc un envoi de plus sur son quota horaire).
            return NextResponse.json(
                {
                    error:
                        remaining > 0
                            ? `Code de vérification incorrect. Il vous reste ${remaining} tentative(s) avant que ce code ne soit désactivé.`
                            : "Code de vérification incorrect. Ce code est désormais désactivé, veuillez en demander un nouveau.",
                    remainingAttempts: remaining,
                    // Même drapeau que la branche ci-dessus : le frontend s'en sert
                    // pour libérer immédiatement le bouton « Renvoyer le code ».
                    ...(remaining <= 0 ? { code: "OTP_LOCKED" } : {}),
                },
                { status: 400 }
            );
        }

        // ====================================================================
        // 🏗️ CRÉATION SÉCURISÉE (Le code est bon !)
        // ====================================================================

        // Double vérification par sécurité (au cas où il y aurait eu des clics multiples)
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return NextResponse.json({ error: "Compte déjà existant." }, { status: 409 });

        // Hachage sécurisé du mot de passe
        const hashedPassword = await bcrypt.hash(password, 12); 

        // Transaction atomique B2B (Création Entreprise + Création Admin)
        const result = await prisma.$transaction(async (tx) => {
            // Création de l'entreprise
            const newCompany = await (tx as any).company.create({
                data: {
                    name: companyName,
                    plan: "trial"
                }
            });

            // Création de l'utilisateur Admin
            const newUser = await tx.user.create({
                data: {
                    email: email,
                    password: hashedPassword,
                    fullName: fullName,
                    companyName: companyName, 
                    companyId: newCompany.id,
                    role: "COMPANY_ADMIN"
                }
            });

            // 📜 AUDIT TRAIL : Tracabilité de la création du Workspace
            await (tx as any).auditLog.create({
                data: {
                    action: "WORKSPACE_CREATED",
                    details: `New company workspace created. Administrator identity verified via Email OTP.`,
                    companyId: newCompany.id,
                    agentId: newUser.id
                }
            });

            // 🧹 NETTOYAGE : Suppression du code OTP utilisé (à usage unique !)
            // `deleteMany` ici aussi : si une requête concurrente a déjà nettoyé
            // la ligne, `delete` ferait échouer TOUTE la transaction — donc
            // annulerait la création de l'entreprise et de l'administrateur alors
            // que le code fourni était le bon. Un faux échec très coûteux.
            await tx.otpCode.deleteMany({ where: { email } });

            return { user: newUser, company: newCompany };
        });

        return NextResponse.json({ 
            message: "Identité vérifiée. Espace de travail B2B et compte administrateur configurés avec succès.",
            companyId: result.company.id 
        }, { status: 201 });

    } catch (error) {
        console.error("🔒 [CRITICAL] Verify-Register API Failure:", error);
        return NextResponse.json({ error: "Une erreur interne est survenue lors de la création de votre espace." }, { status: 500 });
    }
}