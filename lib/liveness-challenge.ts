// ============================================================================
// 🆕 [PHASE C — LIVENESS, ÉTAPE 2/5] ÉMISSION ET VÉRIFICATION DU CHALLENGE
// ============================================================================
// Pourquoi ce fichier existe : la capture caméra de l'étape 1 prouve qu'une
// image vient d'un appareil photo, pas qu'un ÊTRE HUMAIN était devant. Brandir
// une photo imprimée ou un téléphone affichant le visage de la victime suffit à
// la tromper — on capture alors une photo d'une photo, et la comparaison
// faciale valide consciencieusement l'usurpation.
//
// 💡 LA PARADE : demander des actions. Une photo imprimée ne tourne pas la tête,
// un écran ne bouge pas tout seul. C'est le principe du "challenge-response"
// utilisé par tous les acteurs du secteur.
//
// ============================================================================
// 🆕 POURQUOI DEUX ACTIONS ET NON UNE SEULE
// ============================================================================
// ⚠️ LE TROU QUE ÇA FERME : avec une action unique, un fraudeur qui possède la
// bonne photo de sa victime peut passer. S'il détient un profil gauche et que le
// tirage demande "tournez la tête à gauche", il brandit l'image et c'est réussi.
// Avec quatre actions possibles, il a une chance sur quatre — ce qui est
// beaucoup trop, d'autant qu'il peut relancer la séquence jusqu'à tomber dessus.
//
// ✅ AVEC DEUX ACTIONS DISTINCTES, il lui faut posséder LA BONNE COMBINAISON, et
// il ne la découvre qu'au moment où elle s'affiche. Le nombre de possibilités
// passe de 4 à 12 (4 × 3, les deux actions étant forcément différentes), et
// surtout il devrait produire deux images cohérentes du même visage dans deux
// poses précises, à quelques secondes d'intervalle, devant l'objectif.
//
// 💡 C'est exactement ce que font les vrais acteurs : ils enchaînent deux ou
// trois actions, jamais une seule.
//
// ============================================================================
// POURQUOI UN JETON SIGNÉ PLUTÔT QU'UNE LIGNE EN BASE
// ============================================================================
// Le serveur doit se souvenir des actions qu'il a demandées : sans ça, au moment
// de vérifier, le client pourrait affirmer "les actions demandées étaient : ne
// rien faire". Deux façons de s'en souvenir :
//
//   ❌ STOCKER EN BASE — une table de challenges, une ligne par tentative, une
//      purge à écrire. Coûteux pour une donnée qui vit deux minutes, et ça
//      ajoute deux allers-retours base par vérification.
//
//   ✅ UN JETON SIGNÉ — le serveur met les actions dans un jeton, le signe avec
//      une clé secrète, et le confie au client. Le client le renvoie avec ses
//      images. Le serveur recalcule la signature : si UN SEUL caractère du jeton
//      a été modifié, elle ne correspond plus.
//
// 💡 LE POINT CLÉ, ET IL EST CONTRE-INTUITIF : le jeton n'est pas chiffré. Le
// client peut parfaitement le lire — il DOIT le lire, puisqu'il faut afficher
// les instructions à l'écran. Ce qu'il ne peut pas faire, c'est le MODIFIER sans
// invalider la signature. On ne cherche pas à cacher les actions, seulement à
// empêcher qu'on les change après coup.
//
// 💡 Et ça reste sans état ("stateless"), ce qui compte sur du serverless : une
// requête peut être traitée par une instance qui n'a aucun souvenir de la
// précédente. Un jeton autoportant traverse ça sans difficulté.
import crypto from "crypto";

// ----------------------------------------------------------------------------
// LES ACTIONS POSSIBLES
// ----------------------------------------------------------------------------
// ⚠️ POURQUOI PAS "CLIGNER DES YEUX", alors que c'est l'action la plus citée
// dans la littérature sur le liveness : un clignement dure environ 300
// millisecondes. Nos images sont capturées à plusieurs secondes d'intervalle —
// on le raterait presque à chaque fois, et on rejetterait donc des clients
// parfaitement légitimes. Le clignement n'a de sens qu'avec une analyse vidéo
// image par image, ce qu'on ne fait pas ici.
//
// 💡 LE CRITÈRE DE SÉLECTION : l'action doit être TENABLE (le client garde la
// pose, on ne court pas après un mouvement fugace), VISIBLE (détectable par un
// modèle de vision sur une image fixe), et SANS AMBIGUÏTÉ.
//
// ⚠️ LE MOT "HOLD" DANS CHAQUE INSTRUCTION N'EST PAS DÉCORATIF. Il porte toute
// la logique du contrôle : on ne capture pas un MOUVEMENT — qui serait terminé
// depuis longtemps le temps que le client lise et comprenne — mais un ÉTAT FINAL
// IMMOBILE. C'est ce qui permet de laisser au client tout le temps qu'il veut
// pour lire sans que la capture en souffre.
//
// `expectedChange` est la description transmise au modèle de vision au moment de
// la vérification. Elle décrit ce qui doit AVOIR CHANGÉ par rapport à l'image de
// référence — pas l'instruction elle-même.
export const LIVENESS_ACTIONS = {
    turn_left: {
        instruction: "Turn your head to your LEFT and HOLD that position",
        expectedChange:
            "the head is rotated toward the person's left (appearing on the right side of the frame) compared to the reference frame, showing more of the right cheek and ear",
    },
    turn_right: {
        instruction: "Turn your head to your RIGHT and HOLD that position",
        expectedChange:
            "the head is rotated toward the person's right (appearing on the left side of the frame) compared to the reference frame, showing more of the left cheek and ear",
    },
    look_up: {
        instruction: "Tilt your head UP toward the ceiling and HOLD it there",
        expectedChange:
            "the head is tilted upward compared to the reference frame, showing more of the chin and underside of the jaw",
    },
    open_mouth: {
        instruction: "Open your mouth wide and KEEP it open",
        expectedChange:
            "the mouth is clearly open compared to the reference frame, where it was closed",
    },
} as const;

export type LivenessAction = keyof typeof LIVENESS_ACTIONS;

const ACTION_KEYS = Object.keys(LIVENESS_ACTIONS) as LivenessAction[];

// Durée de validité du challenge.
//
// 🆕 3 MINUTES (contre 2 avec une seule action) : la séquence est maintenant
// deux fois plus longue, et chaque phase de lecture peut durer jusqu'à dix
// secondes. Un délai trop serré ferait échouer des vérifications légitimes
// pendant que le client réfléchit.
//
// ⚠️ CE DÉLAI EST UNE PROTECTION ANTI-PRÉPARATION. Sans expiration, un fraudeur
// pourrait demander un challenge, découvrir les deux actions, prendre le temps
// de fabriquer les images correspondantes, puis revenir des heures plus tard.
// Trois minutes ne suffisent pas à produire deux contrefaçons cohérentes.
const CHALLENGE_TTL_MS = 3 * 60 * 1000;

// ----------------------------------------------------------------------------
// LA CLÉ DE SIGNATURE
// ----------------------------------------------------------------------------
// On réutilise NEXTAUTH_SECRET plutôt que d'imposer une variable de plus.
//
// 💡 POURQUOI C'EST ACCEPTABLE ICI : cette clé sert déjà à signer les jetons de
// session, elle est donc forcément présente et correctement protégée dans tout
// déploiement fonctionnel. Et le HMAC ci-dessous inclut un préfixe de domaine
// ("liveness:") qui rend structurellement impossible d'utiliser une signature de
// session comme signature de challenge, ou l'inverse.
//
// 🔒 FAIL-CLOSED : si la clé est absente, on lève. Signer avec une valeur par
// défaut reviendrait à ne pas signer du tout — n'importe qui pourrait fabriquer
// un jeton valide en connaissant le code source.
function getSigningKey(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        throw new Error(
            "NEXTAUTH_SECRET est requis pour signer les challenges de liveness."
        );
    }
    return secret;
}

function sign(payload: string): string {
    // Le préfixe "liveness:" est un séparateur de domaine : il garantit qu'une
    // signature produite ici ne peut pas être confondue avec une signature
    // produite ailleurs à partir de la même clé.
    return crypto
        .createHmac("sha256", getSigningKey())
        .update(`liveness:${payload}`)
        .digest("hex");
}

// 🆕 Les deux actions, dans l'ordre où elles seront demandées.
export type ChallengeStep = {
    action: LivenessAction;
    instruction: string;
};

export type IssuedChallenge = {
    steps: [ChallengeStep, ChallengeStep];
    // Le jeton signé, à renvoyer tel quel avec les images.
    token: string;
    // Horodatage d'expiration, en millisecondes.
    expiresAt: number;
};

// ============================================================================
// ÉMISSION
// ============================================================================
export function issueLivenessChallenge(): IssuedChallenge {
    // ⚠️ `crypto.randomInt` et NON `Math.random`. Même raisonnement que pour la
    // génération des codes OTP : Math.random est déterministe et son état interne
    // est reconstituable en observant assez de valeurs. Ici, un attaquant capable
    // de PRÉDIRE les prochaines actions pourrait préparer les images à l'avance —
    // ce qui viderait tout le dispositif de son sens.
    const first = ACTION_KEYS[crypto.randomInt(0, ACTION_KEYS.length)];

    // 🆕 LA SECONDE ACTION DOIT ÊTRE DIFFÉRENTE DE LA PREMIÈRE.
    //
    // 💡 On tire dans la liste PRIVÉE de la première plutôt que de retirer au
    // hasard jusqu'à tomber sur une autre valeur : cette seconde méthode peut
    // théoriquement boucler longtemps, et surtout elle biaise légèrement la
    // distribution. Ici, chaque action restante a exactement la même chance.
    //
    // ⚠️ Deux actions identiques ruineraient tout l'intérêt du changement : on
    // capturerait deux fois la même pose, et on retomberait sur le problème des
    // images redondantes.
    const remaining = ACTION_KEYS.filter((key) => key !== first);
    const second = remaining[crypto.randomInt(0, remaining.length)];

    const expiresAt = Date.now() + CHALLENGE_TTL_MS;

    // Un identifiant aléatoire par challenge. Il ne sert pas à la sécurité de la
    // signature (le HMAC s'en charge) mais rend chaque jeton unique, même émis
    // dans la même milliseconde — utile pour tracer un incident dans les journaux
    // sans confondre deux tentatives.
    const nonce = crypto.randomBytes(8).toString("hex");

    // 🆕 Format à cinq segments : action1.action2.expiration.nonce.signature
    const payload = `${first}.${second}.${expiresAt}.${nonce}`;
    const token = `${payload}.${sign(payload)}`;

    return {
        steps: [
            { action: first, instruction: LIVENESS_ACTIONS[first].instruction },
            { action: second, instruction: LIVENESS_ACTIONS[second].instruction },
        ],
        token,
        expiresAt,
    };
}

// ============================================================================
// VÉRIFICATION
// ============================================================================
// Appelée plus tard par /api/customers, au moment de valider les images.
//
// 🔒 Renvoie `null` dès que quoi que ce soit cloche — jeton malformé, signature
// invalide, délai dépassé. L'appelant traite ce `null` comme un échec de
// liveness, jamais comme une absence de contrôle.
export type VerifiedChallenge = {
    steps: [
        { action: LivenessAction; expectedChange: string },
        { action: LivenessAction; expectedChange: string }
    ];
};

export function verifyLivenessToken(token: string): VerifiedChallenge | null {
    if (typeof token !== "string" || token.length === 0) return null;

    // 🆕 Cinq segments désormais, contre quatre avec une action unique.
    const parts = token.split(".");
    if (parts.length !== 5) return null;

    const [first, second, expiresAtRaw, nonce, providedSignature] = parts;
    const payload = `${first}.${second}.${expiresAtRaw}.${nonce}`;

    // --- CONTRÔLE 1 : LA SIGNATURE ---
    // ⚠️ Comparaison en TEMPS CONSTANT, même raisonnement que pour l'OTP :
    // l'opérateur `!==` s'arrête au premier caractère qui diffère, ce qui laisse
    // fuiter par la durée de traitement combien de caractères initiaux sont
    // corrects. Un attaquant pourrait reconstituer la signature caractère par
    // caractère au lieu de la chercher parmi 2^256 valeurs.
    //
    // `timingSafeEqual` exige des tampons de longueur identique — d'où le test
    // préalable, qui est obligatoire et non une optimisation.
    let expectedSignature: string;
    try {
        expectedSignature = sign(payload);
    } catch (error) {
        // Clé absente : on refuse. Voir le fail-closed de getSigningKey.
        console.error("[LIVENESS] Impossible de vérifier le jeton :", error);
        return null;
    }

    const a = Buffer.from(providedSignature, "utf8");
    const b = Buffer.from(expectedSignature, "utf8");
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;

    // --- CONTRÔLE 2 : L'EXPIRATION ---
    // 💡 On vérifie la signature AVANT la date, et l'ordre compte : la date fait
    // partie du contenu signé. La lire avant de savoir si elle est authentique
    // reviendrait à faire confiance à une valeur potentiellement falsifiée.
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

    // --- CONTRÔLE 3 : LES ACTIONS SONT-ELLES CONNUES ? ---
    // Défense en profondeur : la signature garantit déjà qu'elles viennent de
    // nous. Mais si une action était un jour retirée de la liste alors que des
    // jetons émis avant circulent encore, on lirait `undefined` plus loin.
    const known = (key: string): key is LivenessAction =>
        Object.prototype.hasOwnProperty.call(LIVENESS_ACTIONS, key);

    if (!known(first) || !known(second)) return null;

    // 🆕 Deux actions identiques ne peuvent pas venir de `issueLivenessChallenge`
    // (qui les tire forcément distinctes). Un jeton qui en contiendrait deux
    // pareilles serait donc anormal — même signé correctement, on refuse.
    if (first === second) return null;

    return {
        steps: [
            { action: first, expectedChange: LIVENESS_ACTIONS[first].expectedChange },
            { action: second, expectedChange: LIVENESS_ACTIONS[second].expectedChange },
        ],
    };
}