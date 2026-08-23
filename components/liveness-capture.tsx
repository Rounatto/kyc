"use client";

// ============================================================================
// 🆕 [PHASE C — LIVENESS, ÉTAPES 1 À 3] CAPTURE, DOUBLE CHALLENGE, ENVOI
// ============================================================================
// Pourquoi ce composant existe : le "selfie" était un `<input type="file">`.
// N'importe qui pouvait uploader une photo de sa victime trouvée en ligne, et la
// comparaison faciale serveur confirmait consciencieusement que c'était bien
// elle. Le contrôle biométrique fonctionnait parfaitement — et validait une
// usurpation.
//
// ✅ ÉTAPE 1 : capture caméra en direct. Il faut désormais présenter quelque
// chose devant l'objectif au lieu d'envoyer un fichier.
//
// ✅ ÉTAPE 2 : le DOUBLE CHALLENGE. La capture seule reste contournable en
// brandissant une photo imprimée — on capture alors une photo d'une photo. On
// demande donc DEUX poses distinctes, tirées au hasard côté serveur.
//
// ✅ ÉTAPE 3 (ce lot) : L'ENVOI AU BUCKET PRIVÉ. Les trois images n'existaient
// que dans la mémoire du navigateur — elles disparaissaient au rechargement de
// la page, et le serveur n'avait rien à télécharger pour les vérifier. Elles
// partent maintenant dans Supabase, et le composant émet des CHEMINS.
//
// ⏳ ÉTAPES 4 ET 5 (à venir) : vérification serveur que les poses correspondent
// aux actions demandées, et fact `livenessFailed` dans le moteur de règles.
// ⚠️ TANT QUE L'ÉTAPE 4 N'EXISTE PAS, LES IMAGES NE SONT PAS VÉRIFIÉES. Le
// composant produit une preuve que personne ne contrôle encore.
//
// ============================================================================
// POURQUOI AUCUN REPLI PAR UPLOAD DE FICHIER
// ============================================================================
// Sumsub, Onfido et Veriff n'offrent PAS d'upload de selfie. Un repli par upload
// EST une porte de sortie : même lourdement pénalisé, il devient le chemin choisi
// par ceux qui veulent contourner le contrôle — c'est-à-dire exactement les
// personnes contre lesquelles on le construit.
//
// 💡 ET DANS CE PRODUIT PRÉCISÉMENT : ce n'est pas un KYC en libre-service. Un
// AGENT crée le dossier avec le client PHYSIQUEMENT DEVANT LUI. Si la personne
// est présente, il n'existe aucune raison légitime d'envoyer une photo prise
// ailleurs — la seule raison réelle d'uploader un fichier ici, c'est que la
// personne n'est pas là. Ce qui est le scénario de fraude à bloquer.
//
// ✅ CE QUI REMPLACE LE REPLI : un contournement TRACÉ. L'agent peut créer un
// dossier sans liveness, mais en écrivant une justification qui figurera dans la
// piste d'audit avec son nom.
import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, CameraOff, AlertTriangle, RefreshCw, ShieldAlert, CheckCircle2, UploadCloud } from "lucide-react";

// ----------------------------------------------------------------------------
// LES CAUSES D'ÉCHEC — TROIS PROBLÈMES DISTINCTS, TROIS ACTIONS DIFFÉRENTES
// ----------------------------------------------------------------------------
// ⚠️ Un message générique "Impossible d'accéder à la caméra" ne dit rien à
// l'agent : doit-il brancher une webcam, cliquer sur une autorisation, ou fermer
// Zoom ? Chaque cause appelle un geste différent.
//
// 💡 `insecure-context` mérite une mention : `getUserMedia` n'existe QUE en
// HTTPS ou sur localhost. En HTTP simple — typiquement en testant depuis une
// autre machine via http://192.168.1.x:3000 — l'API est carrément ABSENTE de
// l'objet navigator, et le code planterait sans explication.
type CameraErrorKind =
    | "insecure-context"
    | "not-supported"
    | "permission-denied"
    | "no-device"
    | "device-busy"
    | "upload-failed"
    | "unknown";

type CameraError = {
    kind: CameraErrorKind;
    title: string;
    message: string;
    recoverable: boolean;
};

// Les noms d'erreur sont normalisés par la spécification WebRTC : identiques sur
// Chrome, Firefox et Safari. Aucune détection de navigateur nécessaire.
function describeCameraError(error: unknown): CameraError {
    const name = (error as any)?.name ?? "";

    switch (name) {
        case "NotAllowedError":
        case "SecurityError":
            return {
                kind: "permission-denied",
                title: "Camera access blocked",
                message:
                    "Your browser is blocking camera access for this site. Click the camera icon in the address bar, allow access, then press Retry.",
                recoverable: true,
            };

        case "NotFoundError":
        case "OverconstrainedError":
            return {
                kind: "no-device",
                title: "No camera detected",
                message:
                    "No camera is connected to this computer. Plug in a webcam and press Retry, or use the option below to document why live capture is not possible.",
                recoverable: true,
            };

        case "NotReadableError":
        case "AbortError":
            return {
                kind: "device-busy",
                title: "Camera is in use",
                message:
                    "Another application is currently using the camera. Close it (video call, another browser tab) and press Retry.",
                recoverable: true,
            };

        default:
            return {
                kind: "unknown",
                title: "Camera could not be started",
                message:
                    "The camera could not be started for an unexpected reason. Press Retry, or document why live capture is not possible.",
                recoverable: true,
            };
    }
}

// ⚠️ `ideal` et non `exact` : avec `exact`, une caméra incapable de fournir
// cette résolution lève une OverconstrainedError et refuse de démarrer. Une
// webcam bas de gamme ne doit pas bloquer une vérification.
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
    },
    // Aucun micro : demander l'audio afficherait une seconde autorisation, plus
    // intrusive, pour rien.
    audio: false,
};

const MIN_SKIP_REASON_LENGTH = 15;

// ----------------------------------------------------------------------------
// LE MINUTAGE — LECTURE ET CAPTURE SÉPARÉES
// ----------------------------------------------------------------------------
// ⚠️ CE QUI N'ALLAIT PAS AVANT : un SEUL minuteur servait à deux choses
// incompatibles — laisser au client le temps de LIRE l'instruction, et déclencher
// la capture. Impossible de bien régler les deux avec un seul chiffre : allongé
// pour le confort de lecture, il capturait trop tard ; raccourci pour capturer au
// bon moment, il ne laissait pas le temps de lire.
//
// ✅ ON SÉPARE DONC, POUR CHACUNE DES DEUX ACTIONS :
//   • PHASE LECTURE — l'instruction s'affiche, sans aucune pression. L'agent
//     l'explique au client. Elle se termine au clic de l'agent, ou d'elle-même
//     au bout de READ_TIMEOUT_MS.
//   • PHASE CAPTURE — un décompte court, puis l'image.
//
// 💡 ET SURTOUT : LES INSTRUCTIONS DEMANDENT DE **TENIR** LA POSE (voir
// LIVENESS_ACTIONS dans lib/liveness-challenge.ts). C'est ce qui rend ce
// découpage possible. On ne capture plus un MOUVEMENT fugace — qui serait terminé
// depuis longtemps après dix secondes d'attente — mais un ÉTAT FINAL IMMOBILE.
// Que le client mette deux ou quinze secondes à tourner la tête n'a plus aucune
// importance, tant qu'il la garde tournée au moment de la capture.

// Temps laissé au client pour se placer avant l'image neutre.
// Trop court, on capture un visage flou en train de bouger, et la comparaison
// partirait d'une base inutilisable.
const REFERENCE_DELAY_MS = 1500;

// Durée MAXIMALE d'une phase de lecture. L'agent peut abréger à tout moment avec
// le bouton "We're ready".
// 💡 10 secondes : largement de quoi lire une phrase et la traduire au client en
// arabe ou en français si nécessaire. Personne n'ira jamais au bout — c'est un
// filet, pas une attente imposée.
const READ_TIMEOUT_MS = 10000;

// Décompte avant la capture, une fois la lecture terminée.
// 💡 3 secondes suffisent : le client a DÉJÀ lu l'instruction, il ne lui reste
// qu'à prendre la pose. C'est un "prêt, partez", pas un temps de compréhension.
const HOLD_COUNTDOWN_MS = 3000;

// Pause entre la capture de la première pose et l'affichage de la seconde
// instruction. Sans elle, la seconde consigne apparaîtrait à l'instant même où le
// client tient encore la première pose — désorientant.
const BETWEEN_ACTIONS_MS = 800;

// Les trois images produites. `reference` sert de point de comparaison : sans
// elle, impossible de dire qu'une pose a été prise — on ne saurait pas d'où le
// visage est parti.
export type LivenessFrameKind = "reference" | "action1" | "action2";

// 🆕 [ÉTAPE 3] Une image APRÈS envoi. Elle porte désormais un `path` — une
// coordonnée interne au bucket privé — en plus de son aperçu local.
//
// 💡 LE BLOB A DISPARU DE CE TYPE, et c'est délibéré : une fois l'image envoyée,
// la garder en mémoire n'a plus d'objet et pousserait le parent à croire qu'il
// peut la ré-envoyer. La seule chose qui compte ensuite, c'est le chemin.
export type LivenessFrame = {
    kind: LivenessFrameKind;
    // Coordonnée dans le bucket, ex: "cmp_a1b2/9f8e-liveness-action1.jpg".
    // ⚠️ Ce n'est PAS une URL : sans domaine ni protocole, et avec un bucket
    // privé, elle n'est pas adressable. Toute lecture exigera une URL signée
    // délivrée par le serveur après vérification du companyId.
    path: string;
    // Aperçu local, pour l'affichage dans le composant uniquement.
    previewUrl: string;
};

// Image AVANT envoi — usage interne au composant.
type PendingFrame = {
    kind: LivenessFrameKind;
    blob: Blob;
    previewUrl: string;
};

export type LivenessResult =
    | { status: "captured"; token: string; instructions: string[]; frames: LivenessFrame[] }
    | { status: "skipped"; reason: string };

type Props = {
    onResult: (result: LivenessResult | null) => void;
    disabled?: boolean;
};

// Les phases de la séquence. Le composant est une petite machine à états : à tout
// instant il se trouve dans exactement une de ces situations, ce qui évite les
// combinaisons impossibles.
//
// 💡 Les phases `instruction` et `hold` sont traversées DEUX FOIS, une par
// action. L'index courant est gardé dans `stepIndex`.
type Phase =
    | "idle"           // caméra éteinte
    | "starting"       // demande d'accès en cours
    | "ready"          // flux actif, en attente du lancement
    | "reference"      // capture de l'image neutre
    | "instruction"    // une instruction s'affiche, le client la lit et prend la pose
    | "hold"           // décompte court, puis capture
    | "uploading"      // 🆕 [ÉTAPE 3] envoi des trois images au bucket
    | "done"           // séquence terminée et images stockées
    | "error";

// 🆕 [ÉTAPE 3] Correspondance entre la nature interne d'une image et la valeur
// attendue par /api/kyc-documents/upload-url.
//
// ⚠️ Ces chaînes doivent correspondre EXACTEMENT à l'enum Zod de la route et au
// type `KycDocumentKind` de lib/storage.ts. Une faute de frappe ici produirait un
// 400 au moment de l'envoi, pas à la compilation — d'où cette table explicite
// plutôt qu'une concaténation `"liveness-" + kind` disséminée dans le code.
const UPLOAD_KIND: Record<LivenessFrameKind, string> = {
    reference: "liveness-reference",
    action1: "liveness-action1",
    action2: "liveness-action2",
};

export default function LivenessCapture({ onResult, disabled = false }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    // ⚠️ Le flux est gardé dans une `ref` et NON dans un state : un state
    // déclencherait un rendu à chaque changement, et la fonction de nettoyage
    // capturerait une valeur périmée — on arrêterait un ancien flux en laissant le
    // nouveau allumé.
    const streamRef = useRef<MediaStream | null>(null);

    // Les minuteries en attente, gardées pour pouvoir les annuler. Sans ça,
    // quitter la page en pleine séquence laisserait des fonctions programmées
    // s'exécuter sur un composant démonté.
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    // ⚠️ RAISON TECHNIQUE IMPORTANTE POUR CES TROIS REFS : une fonction confiée à
    // `setTimeout` fige les valeurs qu'elle voit au moment de sa création. Quand
    // elle s'exécutera trois secondes plus tard, elle lirait donc un state PÉRIMÉ
    // — les images déjà capturées apparaîtraient absentes. Une `ref`, elle,
    // pointe toujours vers la valeur actuelle.
    const capturedRef = useRef<PendingFrame[]>([]);
    const tokenRef = useRef<string | null>(null);
    const instructionsRef = useRef<string[]>([]);

    const [phase, setPhase] = useState<Phase>("idle");
    const [error, setError] = useState<CameraError | null>(null);

    const [instructions, setInstructions] = useState<string[]>([]);
    // Quelle action est en cours : 0 pour la première, 1 pour la seconde.
    const [stepIndex, setStepIndex] = useState(0);
    const [countdown, setCountdown] = useState(0);
    const [frames, setFrames] = useState<LivenessFrame[]>([]);

    const [showSkipForm, setShowSkipForm] = useState(false);
    const [skipReason, setSkipReason] = useState("");
    const [isSkipped, setIsSkipped] = useState(false);

    // ------------------------------------------------------------------------
    // ARRÊT DU FLUX — plus important qu'il n'y paraît
    // ------------------------------------------------------------------------
    // ⚠️ Un flux qu'on n'arrête pas explicitement continue de tourner : la LED
    // reste allumée, et le périphérique reste VERROUILLÉ pour les autres
    // applications. L'agent verrait sa caméra inutilisable dans Teams ou Zoom
    // après avoir simplement quitté cette page.
    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const clearTimers = useCallback(() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
    }, []);

    const schedule = useCallback((fn: () => void, delay: number) => {
        const id = setTimeout(fn, delay);
        timersRef.current.push(id);
    }, []);

    // ------------------------------------------------------------------------
    // CAPTURE D'UNE IMAGE — le passage par le canvas
    // ------------------------------------------------------------------------
    // On ne peut pas demander une image à une vidéo. Il faut un intermédiaire :
    //   1. créer un canvas (une feuille de dessin invisible) aux dimensions du flux
    //   2. y DESSINER l'instant présent de la vidéo — l'équivalent d'une capture
    //      d'écran à cette milliseconde précise
    //   3. convertir cette feuille en vrai fichier JPEG
    //
    // 💡 `videoWidth`/`videoHeight` et non les dimensions CSS : la vidéo est
    // affichée redimensionnée dans la page, mais on veut capturer la résolution
    // RÉELLE du flux. Utiliser la taille affichée produirait une image basse
    // définition, moins exploitable pour la reconnaissance faciale.
    const grabFrame = useCallback((kind: LivenessFrameKind): Promise<PendingFrame | null> => {
        return new Promise((resolve) => {
            const video = videoRef.current;
            if (!video || !streamRef.current) return resolve(null);

            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext("2d");
            if (!context) return resolve(null);

            // ⚠️ L'IMAGE EST À L'ENDROIT ICI. L'aperçu est affiché en miroir
            // (`scale-x-[-1]` plus bas) parce qu'un humain se reconnaît mal dans
            // une image non inversée — c'est ce que fait tout appareil photo
            // frontal. Mais le flux BRUT n'est pas inversé, donc on capture
            // directement l'image correcte.
            //
            // 💡 C'est DÉTERMINANT ici : le serveur devra vérifier que la tête a
            // tourné vers la GAUCHE. Si les images étaient en miroir, il verrait
            // une rotation vers la droite et rejetterait un client honnête.
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) return resolve(null);
                    resolve({ kind, blob, previewUrl: URL.createObjectURL(blob) });
                },
                "image/jpeg",
                0.92
            );
        });
    }, []);

    // ------------------------------------------------------------------------
    // 🆕 [ÉTAPE 3] ENVOI D'UNE IMAGE VERS LE BUCKET PRIVÉ — EN 2 TEMPS
    // ------------------------------------------------------------------------
    // Exactement le même mécanisme que pour la pièce d'identité (voir
    // `uploadDocument` dans le formulaire) :
    //
    //   TEMPS 1 — On demande une AUTORISATION à notre serveur. Il vérifie la
    //   session, calcule lui-même le chemin de destination à partir du companyId,
    //   et renvoie une URL d'écriture signée valable 15 minutes. Le navigateur ne
    //   choisit JAMAIS où le fichier atterrit : il est donc structurellement
    //   incapable d'écrire dans le dossier d'une autre entreprise.
    //
    //   TEMPS 2 — Le fichier part DIRECTEMENT du navigateur vers Supabase, sans
    //   jamais transiter par notre application.
    //
    // 💡 POURQUOI CE COMPOSANT ENVOIE LUI-MÊME SES IMAGES, plutôt que de remonter
    // les blobs au formulaire parent : les trois images n'existent qu'ici, et lui
    // seul sait quand la séquence est terminée. Les faire traverser deux fichiers
    // imposerait au parent de gérer un état intermédiaire, et casserait la page de
    // test. Le composant émet donc directement ce qui sera stocké en base : des
    // CHEMINS.
    const uploadFrame = useCallback(async (frame: PendingFrame): Promise<string> => {
        // --- TEMPS 1 : obtenir l'autorisation ---
        const authRes = await fetch("/api/kyc-documents/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                kind: UPLOAD_KIND[frame.kind],
                contentType: frame.blob.type,
            }),
        });

        if (!authRes.ok) {
            const data = await authRes.json().catch(() => ({} as any));
            // 💡 On remonte le message du serveur tel quel : il est déjà précis
            // (quota de demandes dépassé, session expirée, format refusé). En
            // inventer un ici masquerait la vraie cause à l'agent.
            throw new Error(data.error || "Upload authorisation refused.");
        }

        const { signedUrl, path } = await authRes.json();

        // --- TEMPS 2 : envoyer le fichier directement à Supabase ---
        // Aucune clé Supabase n'est nécessaire côté navigateur : la signature
        // contenue dans l'URL fait office d'autorisation, et elle ne vaut que pour
        // CE chemin précis, pendant 15 minutes.
        const uploadRes = await fetch(signedUrl, {
            method: "PUT",
            headers: { "Content-Type": frame.blob.type },
            body: frame.blob,
        });

        if (!uploadRes.ok) {
            console.error(
                "[LIVENESS] Échec du transfert :",
                uploadRes.status,
                await uploadRes.text().catch(() => "")
            );
            throw new Error("Image transfer failed.");
        }

        return path;
    }, []);

    // ------------------------------------------------------------------------
    // DÉMARRAGE DE LA CAMÉRA
    // ------------------------------------------------------------------------
    const startCamera = useCallback(async () => {
        setError(null);
        setPhase("starting");

        try {
            // ⚠️ CONTRÔLE PRÉALABLE. En contexte non sécurisé,
            // `navigator.mediaDevices` est `undefined` — lire `.getUserMedia`
            // dessus lèverait un TypeError parfaitement opaque. On teste donc
            // l'existence de l'objet plutôt que d'attraper une erreur qu'on ne
            // saurait pas expliquer.
            if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
                setError(
                    window.isSecureContext === false
                        ? {
                              kind: "insecure-context",
                              title: "Secure connection required",
                              message:
                                  "Browsers only allow camera access over HTTPS or on localhost. This page is served over plain HTTP, so live capture is unavailable here.",
                              recoverable: false,
                          }
                        : {
                              kind: "not-supported",
                              title: "Browser not supported",
                              message:
                                  "This browser does not support live camera capture. Use a recent version of Chrome, Edge, Firefox or Safari.",
                              recoverable: false,
                          }
                );
                setPhase("error");
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                // ⚠️ `play()` peut être REJETÉE si le composant est démonté pendant
                // le démarrage. Sans ce `.catch`, on obtiendrait une erreur non
                // gérée dans la console — sans conséquence réelle, mais bruyante et
                // trompeuse au moment de déboguer autre chose.
                await videoRef.current.play().catch(() => {});
            }

            setPhase("ready");
        } catch (err) {
            console.error("[LIVENESS] Démarrage de la caméra impossible :", err);
            setError(describeCameraError(err));
            stopStream();
            setPhase("error");
        }
    }, [stopStream]);

    // ------------------------------------------------------------------------
    // 🆕 [ÉTAPE 3] FIN DE SÉQUENCE — CAPTURE TERMINÉE, ENVOI EN COURS
    // ------------------------------------------------------------------------
    // ⚠️ POURQUOI L'ENVOI SE FAIT ICI, À LA FIN, ET NON AU FIL DE LA SÉQUENCE :
    // envoyer chaque image dès sa capture semblerait plus réactif, mais un
    // transfert lent bloquerait le passage à la pose suivante — le client
    // attendrait devant un écran figé, sans comprendre pourquoi. À la fin, les
    // trois partent ensemble et l'agent voit une seule attente clairement
    // annoncée.
    //
    // 💡 `Promise.all` : les trois envois sont indépendants, les enchaîner
    // triplerait l'attente pour rien.
    //
    // 🔒 SI UN SEUL ENVOI ÉCHOUE, TOUTE LA SÉQUENCE ÉCHOUE. `Promise.all` rejette
    // dès le premier échec — et c'est le comportement voulu : une séquence à deux
    // images sur trois ne prouve rien. Le serveur ne saurait pas quoi comparer, et
    // accepter une preuve partielle serait exactement le travers qu'on corrige
    // partout ailleurs dans ce projet.
    const finish = useCallback(async () => {
        const captured = capturedRef.current;

        // 💡 La caméra est coupée dès la capture terminée, AVANT l'envoi. Laisser
        // le flux tourner pendant le transfert maintiendrait la LED allumée devant
        // un client, ce qui donne l'impression d'être filmé en continu.
        stopStream();

        // ⚠️ Une séquence incomplète ne part même pas : inutile de consommer du
        // quota d'upload pour une preuve inexploitable.
        if (captured.length !== 3 || !tokenRef.current) {
            setError({
                kind: "unknown",
                title: "Incomplete sequence",
                message:
                    "One or more frames could not be captured. Restart the liveness check.",
                recoverable: true,
            });
            setPhase("error");
            return;
        }

        setPhase("uploading");

        try {
            const paths = await Promise.all(captured.map((frame) => uploadFrame(frame)));

            const stored: LivenessFrame[] = captured.map((frame, index) => ({
                kind: frame.kind,
                path: paths[index],
                previewUrl: frame.previewUrl,
            }));

            setFrames(stored);
            setPhase("done");

            onResult({
                status: "captured",
                token: tokenRef.current,
                instructions: instructionsRef.current,
                frames: stored,
            });
        } catch (err: any) {
            console.error("[LIVENESS] Envoi des images impossible :", err);
            setError({
                kind: "upload-failed",
                title: "Upload failed",
                message:
                    (err?.message ? `${err.message} ` : "") +
                    "The captured frames could not be stored. Check the connection and restart the liveness check.",
                recoverable: true,
            });
            setPhase("error");
        }
    }, [onResult, stopStream, uploadFrame]);

    // ------------------------------------------------------------------------
    // CAPTURE D'UNE POSE — appelée deux fois, une par action
    // ------------------------------------------------------------------------
    // ⚠️ `index` est passé en PARAMÈTRE et non lu depuis le state. Cette fonction
    // s'exécute plusieurs secondes après avoir été programmée : elle verrait un
    // `stepIndex` figé au moment de sa création, donc toujours 0 — et la seconde
    // pose écraserait la première.
    const beginHold = useCallback(
        (index: number) => {
            // ⚠️ On annule les minuteries en attente avant d'enchaîner. Sans ça, le
            // délai de lecture continuerait de courir après un clic sur "We're
            // ready" et déclencherait une SECONDE capture par-dessus la première —
            // deux séries d'images se chevauchant, et un résultat imprévisible.
            clearTimers();

            setPhase("hold");
            setCountdown(Math.ceil(HOLD_COUNTDOWN_MS / 1000));

            // Décompte purement visuel : il indique au client quand la photo part.
            for (let i = 1; i <= Math.ceil(HOLD_COUNTDOWN_MS / 1000); i++) {
                schedule(() => setCountdown((c) => Math.max(0, c - 1)), i * 1000);
            }

            schedule(async () => {
                const kind: LivenessFrameKind = index === 0 ? "action1" : "action2";
                const frame = await grabFrame(kind);

                if (frame) {
                    capturedRef.current = [...capturedRef.current, frame];
                }

                if (index === 0) {
                    // ON ENCHAÎNE SUR LA SECONDE ACTION.
                    // La courte pause laisse au client le temps de relâcher la
                    // première pose avant de découvrir la suivante.
                    schedule(() => {
                        setStepIndex(1);
                        setPhase("instruction");
                        // Filet de sécurité, comme pour la première action.
                        schedule(() => beginHold(1), READ_TIMEOUT_MS);
                    }, BETWEEN_ACTIONS_MS);
                } else {
                    // 🆕 [ÉTAPE 3] `finish` est désormais asynchrone (il envoie les
                    // images). On ne l'attend pas ici : il gère lui-même ses phases
                    // et ses erreurs, et cette fonction programmée n'a plus rien à
                    // faire ensuite.
                    void finish();
                }
            }, HOLD_COUNTDOWN_MS);
        },
        [clearTimers, finish, grabFrame, schedule]
    );

    // ------------------------------------------------------------------------
    // LA SÉQUENCE COMPLÈTE
    // ------------------------------------------------------------------------
    // 1. Demander un challenge au serveur (DEUX actions distinctes y sont tirées)
    // 2. Capturer l'image de RÉFÉRENCE — avant d'afficher la moindre instruction
    // 3. Première action : lecture, puis capture
    // 4. Seconde action : lecture, puis capture
    // 5. Envoi des trois images au bucket
    //
    // ⚠️ POURQUOI LA RÉFÉRENCE EST PRISE AVANT TOUTE INSTRUCTION : c'est le point
    // de comparaison neutre. Si le client voyait déjà "tournez la tête" au moment
    // où on la capture, il aurait pu commencer à bouger — et le serveur comparerait
    // deux images déjà en mouvement, incapable de conclure.
    const runSequence = useCallback(async () => {
        // Nettoyage d'une éventuelle tentative précédente.
        clearTimers();
        frames.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        capturedRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        setFrames([]);
        capturedRef.current = [];
        setStepIndex(0);
        onResult(null);

        // --- 1. LE CHALLENGE ---
        let issued: { token: string; instructions: string[] };
        try {
            const res = await fetch("/api/kyc-documents/liveness-challenge", { method: "POST" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            issued = {
                token: data.token,
                instructions: (data.steps ?? []).map((s: { instruction: string }) => s.instruction),
            };
            if (issued.instructions.length !== 2) throw new Error("Malformed challenge");
        } catch (err) {
            console.error("[LIVENESS] Challenge indisponible :", err);
            setError({
                kind: "unknown",
                title: "Liveness check unavailable",
                message:
                    "The server could not issue a liveness challenge. Press Retry, or document why live capture is not possible.",
                recoverable: true,
            });
            stopStream();
            setPhase("error");
            return;
        }

        // Le challenge est gardé À LA FOIS dans un state (pour l'affichage) et
        // dans une ref (pour être lu par les fonctions programmées, qui ne
        // verraient qu'une version périmée du state).
        setInstructions(issued.instructions);
        instructionsRef.current = issued.instructions;
        tokenRef.current = issued.token;

        // --- 2. IMAGE DE RÉFÉRENCE ---
        setPhase("reference");

        schedule(async () => {
            const reference = await grabFrame("reference");
            if (!reference) return;

            capturedRef.current = [reference];

            // --- 3. PREMIÈRE ACTION, PHASE LECTURE ---
            // Pas de décompte visible ici, volontairement : afficher un compte à
            // rebours pendant que quelqu'un essaie de comprendre une consigne crée
            // une pression inutile et pousse à bâcler la pose.
            setStepIndex(0);
            setPhase("instruction");

            // Filet de sécurité : si l'agent ne clique jamais, on enchaîne quand
            // même. Sans ça, une séquence pourrait rester bloquée indéfiniment.
            schedule(() => beginHold(0), READ_TIMEOUT_MS);
        }, REFERENCE_DELAY_MS);
    }, [beginHold, clearTimers, frames, grabFrame, onResult, schedule, stopStream]);

    // ------------------------------------------------------------------------
    // NETTOYAGE AU DÉMONTAGE
    // ------------------------------------------------------------------------
    // Deux ressources à libérer, et oublier l'une a des conséquences réelles :
    //   • les minuteries — sinon une capture se déclencherait sur un composant
    //     démonté, après le départ de l'utilisateur ;
    //   • le flux caméra — sinon la LED reste allumée et le périphérique
    //     verrouillé pour les autres applications.
    //
    // ⚠️ Ce useEffect n'a AUCUNE dépendance : il ne doit s'exécuter qu'au
    // démontage réel. Y mettre `frames` le ferait tourner à chaque capture,
    // révoquant des URLs encore affichées à l'écran.
    useEffect(() => {
        return () => {
            clearTimers();
            stopStream();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const restart = useCallback(() => {
        clearTimers();
        frames.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        capturedRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        setFrames([]);
        capturedRef.current = [];
        setInstructions([]);
        setStepIndex(0);
        onResult(null);
        startCamera();
    }, [clearTimers, frames, onResult, startCamera]);

    // ------------------------------------------------------------------------
    // CONTOURNEMENT TRACÉ
    // ------------------------------------------------------------------------
    // ⚠️ CE N'EST PAS UN REPLI, ET LA DISTINCTION EST TOUT L'ENJEU. Un repli offre
    // un autre chemin vers le même résultat. Ici, le dossier est créé SANS preuve
    // de présence, il est marqué comme tel, pénalisé, et le motif est inscrit dans
    // la piste d'audit avec le nom de l'agent.
    const confirmSkip = useCallback(() => {
        const reason = skipReason.trim();
        if (reason.length < MIN_SKIP_REASON_LENGTH) return;

        clearTimers();
        stopStream();
        setIsSkipped(true);
        setShowSkipForm(false);
        setPhase("idle");
        onResult({ status: "skipped", reason });
    }, [skipReason, onResult, stopStream, clearTimers]);

    const cancelSkip = useCallback(() => {
        setIsSkipped(false);
        setSkipReason("");
        setShowSkipForm(false);
        onResult(null);
    }, [onResult]);

    // ========================================================================
    // RENDU
    // ========================================================================

    if (isSkipped) {
        return (
            <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-bold text-amber-900">Live capture bypassed</p>
                        <p className="text-xs text-amber-800 leading-relaxed">
                            This file will be created without proof that the applicant was physically
                            present. It will be flagged, scored accordingly, and your justification will be
                            recorded in the audit trail under your name.
                        </p>
                    </div>
                </div>
                <p className="text-xs text-amber-900 bg-amber-100 rounded-lg p-3 italic">
                    &ldquo;{skipReason.trim()}&rdquo;
                </p>
                <button
                    type="button"
                    onClick={cancelSkip}
                    disabled={disabled}
                    className="self-start text-xs font-bold text-amber-900 hover:underline disabled:opacity-50"
                >
                    Cancel and try the camera again
                </button>
            </div>
        );
    }

    if (showSkipForm) {
        const reasonTooShort = skipReason.trim().length < MIN_SKIP_REASON_LENGTH;

        return (
            <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-bold text-amber-900">Why is live capture not possible?</p>
                        <p className="text-xs text-amber-800 leading-relaxed">
                            Your explanation will be stored in the audit trail alongside your name, and the
                            file&apos;s risk score will be increased. Only bypass live capture when there is a
                            genuine technical reason.
                        </p>
                    </div>
                </div>

                <textarea
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    placeholder="Ex: This workstation has no webcam and no spare device was available at the branch."
                    rows={3}
                    maxLength={300}
                    className="w-full border border-amber-300 rounded-lg p-3 text-sm outline-none focus:border-amber-500 bg-white text-gray-800 resize-none"
                />

                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-amber-700">
                        {reasonTooShort
                            ? `At least ${MIN_SKIP_REASON_LENGTH} characters required.`
                            : "Ready to record."}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { setShowSkipForm(false); setSkipReason(""); }}
                            className="text-xs font-bold text-gray-600 hover:text-gray-900 px-3 py-2"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmSkip}
                            disabled={reasonTooShort}
                            className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Confirm bypass
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- SÉQUENCE TERMINÉE ET IMAGES STOCKÉES ---
    if (phase === "done") {
        const labels: Record<LivenessFrameKind, string> = {
            reference: "Neutral",
            action1: "Pose 1",
            action2: "Pose 2",
        };

        return (
            <div className="flex flex-col gap-3">
                <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-sm font-bold text-green-800">
                            Liveness sequence captured and stored
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {frames.map((frame) => (
                            <div key={frame.kind} className="flex flex-col gap-1">
                                <img
                                    src={frame.previewUrl}
                                    alt={frame.kind}
                                    className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                />
                                <p className="text-[10px] text-gray-500 text-center font-medium uppercase tracking-wide">
                                    {labels[frame.kind]}
                                </p>
                            </div>
                        ))}
                    </div>

                    {instructions.length === 2 && (
                        <div className="mt-3 flex flex-col gap-0.5">
                            <p className="text-xs text-gray-600">
                                Pose 1: <span className="font-bold">{instructions[0]}</span>
                            </p>
                            <p className="text-xs text-gray-600">
                                Pose 2: <span className="font-bold">{instructions[1]}</span>
                            </p>
                        </div>
                    )}
                </div>

                {!disabled && (
                    <button
                        type="button"
                        onClick={restart}
                        className="self-center flex items-center gap-2 text-xs font-bold text-gray-700 hover:text-blue-700 transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Restart the sequence
                    </button>
                )}
            </div>
        );
    }

    // --- CAMÉRA : inactive, en démarrage, active, en envoi, ou en erreur ---
    const streamVisible =
        phase === "ready" || phase === "reference" || phase === "instruction" || phase === "hold";

    const currentInstruction = instructions[stepIndex];

    return (
        <div className="flex flex-col gap-3">
            <div
                className={`border-2 rounded-xl overflow-hidden relative h-64 flex flex-col items-center justify-center text-center transition-colors ${
                    phase === "error" ? "border-red-300 bg-red-50" : "border-gray-300 bg-gray-900"
                }`}
            >
                {/* La vidéo est toujours montée mais masquée tant que le flux n'est
                    pas actif : `srcObject` a besoin que l'élément existe déjà dans
                    le DOM au moment de l'assignation.

                    💡 `scale-x-[-1]` affiche l'aperçu en MIROIR : un humain se
                    reconnaît mal dans une image non inversée. L'image capturée,
                    elle, n'est pas inversée (voir grabFrame).

                    `playsInline` est indispensable sur iOS : sans cet attribut,
                    Safari mobile ouvre la vidéo en plein écran. */}
                <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${
                        streamVisible ? "block" : "hidden"
                    }`}
                />

                {/* --- Prêt à lancer --- */}
                {phase === "ready" && !disabled && (
                    <button
                        type="button"
                        onClick={runSequence}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white text-gray-900 text-sm font-bold px-5 py-2.5 rounded-full shadow-lg hover:scale-105 transition-transform"
                    >
                        <Camera className="w-4 h-4" /> Start liveness check
                    </button>
                )}

                {/* --- Capture de la référence --- */}
                {phase === "reference" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <p className="text-white text-sm font-bold px-6 text-center">
                            Look straight at the camera and hold still...
                        </p>
                    </div>
                )}

                {/* --- PHASE LECTURE : l'instruction, sans pression ---
                    💡 Affichée en grand, en haut, sur fond contrasté : c'est le
                    CLIENT (assis en face) qui doit la lire sur l'écran de l'agent,
                    pas seulement l'agent lui-même.

                    💡 Aucun décompte visible ici, délibérément : un compte à
                    rebours pendant qu'on essaie de comprendre une consigne crée une
                    pression inutile et pousse à bâcler la pose.

                    💡 Le compteur "Step X of 2" prévient le client qu'une seconde
                    demande va suivre — sans lui, il croirait avoir terminé. */}
                {phase === "instruction" && currentInstruction && (
                    <>
                        <div className="absolute inset-x-0 top-0 bg-blue-700/95 px-4 py-4 flex flex-col items-center gap-1">
                            <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">
                                Step {stepIndex + 1} of 2
                            </p>
                            <p className="text-white text-lg font-bold text-center leading-snug">
                                {currentInstruction}
                            </p>
                            <p className="text-blue-100 text-xs">
                                Take your time — hold the pose when ready
                            </p>
                        </div>
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => beginHold(stepIndex)}
                                className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white text-gray-900 text-sm font-bold px-5 py-2.5 rounded-full shadow-lg hover:scale-105 transition-transform"
                            >
                                <CheckCircle2 className="w-4 h-4" /> We&apos;re ready
                            </button>
                        )}
                    </>
                )}

                {/* --- PHASE CAPTURE : décompte court --- */}
                {phase === "hold" && currentInstruction && (
                    <div className="absolute inset-x-0 top-0 bg-blue-700/95 px-4 py-3 flex flex-col items-center gap-1">
                        <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">
                            Step {stepIndex + 1} of 2
                        </p>
                        <p className="text-white text-base font-bold text-center">{currentInstruction}</p>
                        <p className="text-blue-100 text-xs font-bold">
                            {countdown > 0 ? `Capturing in ${countdown}...` : "Capturing — hold still"}
                        </p>
                    </div>
                )}

                {/* --- 🆕 [ÉTAPE 3] PHASE ENVOI ---
                    💡 Un écran dédié, et non un simple indicateur discret : trois
                    images de plusieurs centaines de kilo-octets sur une connexion
                    d'agence peuvent prendre quelques secondes. Sans retour visible,
                    l'agent croirait que la séquence a planté et relancerait tout. */}
                {phase === "uploading" && (
                    <div className="flex flex-col items-center gap-3 px-6">
                        <UploadCloud className="w-8 h-8 text-white/80 animate-pulse" />
                        <p className="text-sm font-bold text-white">Storing the captured frames...</p>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
                            The three images are being uploaded to secure storage. This takes a few seconds.
                        </p>
                    </div>
                )}

                {/* --- Erreur --- */}
                {phase === "error" && error && (
                    <div className="flex flex-col items-center gap-2 px-6">
                        <CameraOff className="w-8 h-8 text-red-500 mb-1" />
                        <p className="text-sm font-bold text-red-800">{error.title}</p>
                        <p className="text-xs text-red-700 leading-relaxed max-w-sm">{error.message}</p>
                        {error.recoverable && (
                            <button
                                type="button"
                                onClick={startCamera}
                                disabled={disabled}
                                className="mt-2 flex items-center gap-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Retry
                            </button>
                        )}
                    </div>
                )}

                {/* --- Écran d'accueil --- */}
                {(phase === "idle" || phase === "starting") && (
                    <div className="flex flex-col items-center gap-3 px-6">
                        <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                            <Camera className="w-6 h-6 text-white/80" />
                        </div>
                        <p className="text-sm font-bold text-white">Live liveness check</p>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
                            The applicant must be in front of this camera and will be asked to hold two
                            randomly chosen poses. Uploading a photo is not accepted.
                        </p>
                        <button
                            type="button"
                            onClick={startCamera}
                            disabled={disabled || phase === "starting"}
                            className="mt-1 flex items-center gap-2 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 px-5 py-2.5 rounded-full shadow-md disabled:opacity-50 transition-colors"
                        >
                            {phase === "starting" ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" /> Starting camera...
                                </>
                            ) : (
                                <>
                                    <Camera className="w-4 h-4" /> Start camera
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* 💡 Le lien de contournement est volontairement DISCRET : petit, gris,
                en bas. Il doit rester trouvable pour les cas légitimes, mais ne
                jamais ressembler à une alternative équivalente.
                🆕 Masqué aussi pendant l'envoi : cliquer dessus à ce moment
                laisserait trois images orphelines dans le bucket. */}
            {!disabled &&
                phase !== "reference" &&
                phase !== "instruction" &&
                phase !== "hold" &&
                phase !== "uploading" && (
                    <button
                        type="button"
                        onClick={() => setShowSkipForm(true)}
                        className="self-center text-xs text-gray-500 hover:text-amber-700 hover:underline transition-colors"
                    >
                        Camera unavailable on this workstation?
                    </button>
                )}
        </div>
    );
}