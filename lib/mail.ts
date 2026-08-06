// ============================================================================
// ✉️ SERVICE D'ENVOI D'EMAILS — TOUS LES TEMPLATES TRANSACTIONNELS
// ============================================================================
// Pourquoi ce fichier existe : centralise l'unique transporteur SMTP (Nodemailer
// + Gmail) et les 6 templates utilisés par l'application, pour ne pas dupliquer
// la config d'envoi ni le style visuel dans chaque route API.
//
// ✅ [A4 — RÉSOLU] Les valeurs interpolées dans le HTML (nom du client, motif
// de rejet, etc.) viennent de formulaires utilisateurs : elles sont désormais
// TOUTES passées par escapeHtml() avant injection dans les templates.
//
// 🆕 [DÉLIVRABILITÉ] Les emails atterrissaient systématiquement en SPAM. Quatre
// causes ont été corrigées ici :
//   1. Sujets en MAJUSCULES avec "ACTION REQUIRED" et emojis — déclencheurs
//      classiques de filtres anti-spam
//   2. Emails 100% HTML sans version texte brut — fortement pénalisé
//   3. Cinq noms d'expéditeur différents depuis une seule adresse Gmail, ce qui
//      ressemble à de l'usurpation pour un filtre
//   4. Boutons sans lien de secours en clair (voir note ci-dessous)
//
// ⚠️ LIMITE HONNÊTE QUI SUBSISTE : ces corrections améliorent nettement le
// score, mais ne le résolvent pas totalement. La cause profonde est l'envoi via
// GMAIL SMTP depuis une adresse personnelle, en se présentant comme
// "TrustVerify", sur un domaine vercel.app qu'on ne contrôle pas — impossible
// d'y configurer SPF et DKIM, les preuves cryptographiques que les filtres
// attendent d'un expéditeur légitime.
// 📋 La vraie solution, le jour venu : un nom de domaine (~10 €/an) + un service
// transactionnel (Resend, Postmark — gratuits jusqu'à ~3000 emails/mois) avec
// enregistrements DNS vérifiés. Les emails arriveraient alors en boîte de
// réception.
import nodemailer from "nodemailer";

// ============================================================================
// 🆕 [A4] 🛡️ ÉCHAPPEMENT HTML — LA CORRECTION DE LA FAILLE D'INJECTION
// ============================================================================
// Problème corrigé : les templates ci-dessous injectent des valeurs venant de
// formulaires utilisateurs (`${name}`, `${rejectionReason}`...) directement
// dans du HTML. Sans échappement, un nom comme
// `<a href="https://site-pirate.com">Cliquez ici</a>` partirait dans l'email
// comme un VRAI lien cliquable — du phishing envoyé depuis notre propre
// adresse, avec notre design et notre réputation.
//
// ⚠️ L'ordre compte : `&` DOIT être remplacé en premier, sinon on ré-échapperait
// les entités qu'on vient de créer (`<` → `&lt;` → `&amp;lt;` = cassé).
//
// 💡 IMPORTANT — cet échappement ne concerne QUE le HTML. Les versions TEXTE
// BRUT ajoutées plus bas utilisent les valeurs ORIGINALES, non échappées : un
// email texte n'est jamais interprété comme du HTML, donc rien à neutraliser.
// Y mettre les versions échappées ferait lire "O&#39;Brien" à un client
// nommé O'Brien.
const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// ============================================================================
// 🆕 [DÉLIVRABILITÉ] IDENTITÉ D'EXPÉDITEUR UNIQUE
// ============================================================================
// Ce fichier utilisait CINQ noms différents depuis la même adresse Gmail :
// "Compliance Operations", "Security Admin", "Security Operations",
// "TrustVerify Internal", "TrustVerify Analytics".
//
// Pour un filtre anti-spam, une adresse qui change sans cesse d'identité est un
// signal d'usurpation — c'est exactement le comportement d'un spammeur qui
// imite plusieurs services. Une marque unique et constante construit au
// contraire une réputation d'expéditeur stable, sur laquelle les filtres
// s'appuient pour classer les messages suivants.
//
// 💡 Bénéfice secondaire : dans la boîte du destinataire, tous les emails
// s'affichent désormais sous le même nom, donc regroupés et identifiables.
const FROM = `"TrustVerify" <${process.env.EMAIL_USER}>`;

// ============================================================================
// 🆕 [DÉLIVRABILITÉ] BLOC DE SECOURS SOUS CHAQUE BOUTON
// ============================================================================
// ⚠️ CECI RÉSOUT UN PROBLÈME CONCRET ET IMMÉDIAT : quand Gmail classe un
// message en spam, il DÉSACTIVE les liens cliquables par sécurité. Le bouton
// "Activate Your Account" paraissait alors cassé ou "statique" — alors que le
// lien lui-même était parfaitement valide.
//
// En affichant l'URL en toutes lettres juste en dessous, le destinataire peut
// la copier-coller manuellement dans son navigateur. C'est aussi une pratique
// standard des grands services (GitHub, Stripe le font) pour les clients mail
// qui bloquent ou dégradent le HTML.
//
// 💡 `word-break: break-all` évite que l'URL, longue et sans espaces, ne déborde
// hors du cadre sur mobile.
const linkFallbackBlock = (safeLink: string) => `
      <p style="font-size: 12px; line-height: 1.6; color: #9ca3af; text-align: center; margin-top: 8px;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <span style="color: #6b7280; word-break: break-all;">${safeLink}</span>
      </p>
`;

// Un seul transporteur, réutilisé par toutes les fonctions ci-dessous.
// Utilise le compte Gmail défini par EMAIL_USER / EMAIL_APP_PASSWORD (mot de
// passe d'application Google, pas le mot de passe du compte).
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// ============================================================================
// 📁 EMAILS DE STATUT KYC (Pour le Client Final)
// ============================================================================
// Envoyé au CLIENT FINAL (la personne dont l'identité est vérifiée) quand un
// agent traite son dossier. `status` détermine le template : approbation ou
// rejet (avec motif). C'est la seule fonction de ce fichier qui s'adresse à
// quelqu'un d'externe à l'entreprise cliente de TrustVerify.
// ============================================================================
export const sendKYCEmail = async (
  to: string, 
  status: string, 
  name: string, 
  rejectionReason?: string
) => {
  // 🆕 [A4] Neutralisation des valeurs utilisateur AVANT toute interpolation.
  const safeName = escapeHtml(name);
  const safeRejectionReason = rejectionReason ? escapeHtml(rejectionReason) : undefined;

  // 🆕 [DÉLIVRABILITÉ] Valeurs NON échappées, réservées à la version texte brut.
  const plainRejectionReason = rejectionReason || "The provided identification documents do not satisfy readability, clarity, or security requirements.";

  let subject = "";
  let htmlContent = "";
  let textContent = "";

  if (status === "verified") {
    // 🆕 [DÉLIVRABILITÉ] Ancien sujet : "KYC Verification Approved - Access
    // Granted". "Access Granted" a une tournure promotionnelle qui attire les
    // filtres. Le nouveau est factuel et descriptif.
    subject = "Your identity verification is complete";
    htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
        <div style="margin-bottom: 24px;">
          <span style="background-color: #dcfce7; color: #166534; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Compliance Update</span>
        </div>
        <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Identity Verified Successfully</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Excellent news! Our compliance operations team has manually reviewed and approved your identity verification request.</p>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">All provisional account restrictions have been lifted. You now have unrestricted access to the platform's core infrastructure.</p>
        <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
          Best regards,<br/>
          <strong style="color: #4b5563;">The Compliance & Risk Operations Team</strong>
        </div>
      </div>
    `;
    // 🆕 [DÉLIVRABILITÉ] Version texte : reprend le MÊME message, sans mise en
    // forme. Un email dont les versions HTML et texte racontent des choses
    // différentes est encore plus suspect qu'un email sans version texte.
    textContent = `Hello ${name},

Your identity verification request has been reviewed and approved by our compliance operations team.

All provisional account restrictions have been lifted. You now have full access to the platform.

Best regards,
The Compliance & Risk Operations Team
TrustVerify`;
  } else if (status === "rejected") {
    // 🆕 [DÉLIVRABILITÉ] Ancien sujet : "ACTION REQUIRED: KYC Verification
    // Update". Les majuscules et la formule "ACTION REQUIRED" sont des
    // marqueurs de spam très reconnus — ils créent une urgence artificielle,
    // exactement ce que font les campagnes de phishing.
    subject = "Update on your identity verification";
    htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
        <div style="margin-bottom: 24px;">
          <span style="background-color: #fee2e2; color: #991b1b; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Action Required</span>
        </div>
        <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Unable to Verify Identity</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">We have processed your identity verification request, but our risk mitigation engine was unable to authenticate your application with the provided documents.</p>
        
        <div style="background-color: #fef2f2; padding: 18px; border-left: 4px solid #dc2626; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 14px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Declination Reason:</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #7f1d1d;">${safeRejectionReason || "The provided identification documents do not satisfy readability, clarity, or security requirements."}</p>
        </div>
        
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Please sign back into your secure portal, review our document guidelines, and submit a clear, uncropped copy of your identification document to initiate a new verification pipeline.</p>
        <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
          Best regards,<br/>
          <strong style="color: #4b5563;">The Compliance & Risk Operations Team</strong>
        </div>
      </div>
    `;
    textContent = `Hello ${name},

We have processed your identity verification request, but we were unable to authenticate your application with the documents provided.

Reason: ${plainRejectionReason}

Please sign back into your secure portal, review our document guidelines, and submit a clear, uncropped copy of your identification document to start a new verification.

Best regards,
The Compliance & Risk Operations Team
TrustVerify`;
  }

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    // 🆕 [DÉLIVRABILITÉ] `text` AVANT `html` : c'est l'ordre attendu par la
    // norme MIME (du format le plus simple au plus riche). Les clients mail
    // affichent la dernière version qu'ils savent lire.
    text: textContent,
    html: htmlContent,
  });
};

// ============================================================================
// 🛡️ EMAILS D'INVITATION D'ÉQUIPE
// ============================================================================
// Envoyé par un COMPANY_ADMIN quand il invite un nouvel agent à rejoindre son
// entreprise. `setupLink` contient un token d'invitation à usage unique (généré
// et validé côté serveur, voir app/api/settings/team + app/setup-account) qui
// permet au destinataire de définir son mot de passe et d'activer son compte.
// ============================================================================
export const sendAgentInvitationEmail = async (
  to: string, 
  name: string, 
  setupLink: string 
) => {
  // 🆕 [A4] `name` est saisi par l'admin dans le formulaire d'invitation → on
  // l'échappe. `setupLink` est généré par NOTRE serveur, mais on l'échappe
  // aussi par défense en profondeur : il est injecté dans un attribut href.
  const safeName = escapeHtml(name);
  const safeSetupLink = escapeHtml(setupLink);

  // 🆕 [DÉLIVRABILITÉ] Ancien sujet : "ACTION REQUIRED: Join the Compliance
  // Team". C'était le pire des trois : majuscules, urgence artificielle, et
  // une formulation vague qui ne dit pas de quel service il s'agit. Le nouveau
  // nomme le produit et décrit factuellement l'action attendue.
  const subject = "Activate your TrustVerify account";
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #e0e7ff; color: #3730a3; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Organization Invitation</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Welcome to the Team</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Your Administrator has provisioned a KYC Agent account for you. To access the secure compliance infrastructure, you must set up your authentication credentials.</p>
      
      <div style="margin: 32px 0; text-align: center;">
        <a href="${safeSetupLink}" style="background-color: #1d4ed8; color: #ffffff; padding: 14px 28px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">Activate Your Account</a>
      </div>

      ${linkFallbackBlock(safeSetupLink)}
      
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; text-align: center;">
        This secure link will expire in exactly 24 hours. If it expires, please contact your administrator for a new invitation.
      </p>

      <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
        Securely yours,<br/>
        <strong style="color: #4b5563;">TrustVerify</strong>
      </div>
    </div>
  `;

  // 🆕 [DÉLIVRABILITÉ] Le lien apparaît EN CLAIR dans la version texte. C'est
  // souvent le seul moyen d'activer un compte quand le client mail dégrade ou
  // bloque le HTML.
  const textContent = `Hello ${name},

Your administrator has created a KYC Agent account for you on TrustVerify.

To activate it, open this link and choose your password:
${setupLink}

This link expires in 24 hours. If it expires, ask your administrator to send a new invitation.

Securely yours,
TrustVerify`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    text: textContent,
    html: htmlContent,
  });
};

// ============================================================================
// 📩 EMAIL DE VÉRIFICATION OTP (Phase 6)
// ============================================================================
// Envoyé à l'inscription d'une nouvelle entreprise, pour prouver que le créateur
// du compte possède bien l'adresse email fournie (anti-inscription frauduleuse).
// Le code à 6 chiffres est généré et stocké dans le modèle `OtpCode` (expire
// après 10 minutes) et vérifié par app/api/auth/verify-register.
//
// 🆕 [A4] Pas d'échappement ici, et c'est VOULU : `otpCode` est généré par
// notre propre serveur (6 chiffres), jamais saisi par un utilisateur.
// ============================================================================
export const sendVerificationOtpEmail = async (to: string, otpCode: string) => {
  // 🆕 [DÉLIVRABILITÉ] Sujet légèrement reformulé pour nommer le produit.
  //
  // ⚠️ CHOIX DÉLIBÉRÉ : on ne met PAS le code dans le sujet ("123456 is your
  // code"), bien que ce soit courant. Un sujet est visible dans les
  // notifications d'écran verrouillé et dans les aperçus — quelqu'un ayant
  // l'appareil sous les yeux lirait le code sans même déverrouiller.
  const subject = "Your TrustVerify verification code";
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #e0e7ff; color: #3730a3; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Security Check</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Email Verification</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">You are attempting to register a new Workspace on the Compliance Portal. To verify your identity and secure your account, please enter the following 6-digit verification code:</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 32px 0; text-align: center;">
        <p style="margin: 0; font-size: 40px; font-family: monospace; font-weight: 900; color: #1d4ed8; letter-spacing: 0.2em;">${otpCode}</p>
      </div>
      
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; text-align: center;">
        This code is highly confidential and will expire in exactly 10 minutes. Do not share this code with anyone.
      </p>

      <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
        Securely yours,<br/>
        <strong style="color: #4b5563;">TrustVerify</strong>
      </div>
    </div>
  `;

  const textContent = `Your TrustVerify verification code is: ${otpCode}

Enter this code to finish registering your workspace.

This code expires in 10 minutes. Do not share it with anyone.

If you did not request this code, you can safely ignore this email.

Securely yours,
TrustVerify`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    text: textContent,
    html: htmlContent,
  });
};

// ============================================================================
// 🔔 EMAILS DE NOTIFICATION INTERNE (Pour les Agents, basé sur les Settings)
// ============================================================================
// Envoyé à un AGENT/ADMIN interne (pas au client final) quand un dossier KYC
// change de statut, SEULEMENT si l'utilisateur a activé cette préférence dans
// ses réglages (`emailNotifSuccess` / `emailNotifAlerts` en base).
// ============================================================================
export const sendAgentNotificationEmail = async (
  to: string, 
  type: "SUCCESS" | "ALERT", 
  customerName: string, 
  actionBy: string
) => {
  // 🆕 [A4] `customerName` et `actionBy` sont d'origine humaine → échappés pour
  // le HTML. Le sujet, lui, est du texte brut : on y utilise la valeur
  // ORIGINALE, sinon un client nommé "O'Brien" apparaîtrait "O&#39;Brien".
  const safeCustomerName = escapeHtml(customerName);
  const safeActionBy = escapeHtml(actionBy);

  const isAlert = type === "ALERT";

  // 🆕 [DÉLIVRABILITÉ] Anciens sujets : "⚠️ AUDIT REQUIRED: Action taken on X"
  // et "✅ VERIFICATION SUCCESS: X". Deux problèmes cumulés — les emojis en
  // début de sujet et les majuscules sont tous deux des marqueurs de spam
  // classiques. Le nouveau format reste parfaitement lisible en liste.
  const subject = isAlert 
    ? `Verification flagged: ${customerName}` 
    : `Verification approved: ${customerName}`;
  
  const tagColor = isAlert ? "#fee2e2" : "#dcfce7";
  const tagTextColor = isAlert ? "#991b1b" : "#166534";
  const tagText = isAlert ? "Audit Alert" : "Success Alert";

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: ${tagColor}; color: ${tagTextColor}; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">${tagText}</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Internal System Notification</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">This is an automated alert from your TrustVerify Workspace based on your Email Preferences.</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;"><strong>Customer Profile:</strong> ${safeCustomerName}</p>
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;"><strong>Action Taken:</strong> ${isAlert ? 'Rejected / Flagged' : 'Approved'}</p>
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Processed By:</strong> ${safeActionBy}</p>
      </div>
      
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Please log in to your Dashboard to review the full audit log and details for this profile.</p>

      <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
        This email was sent because you enabled this notification type in your Account Settings.<br/>
        <strong style="color: #4b5563;">TrustVerify</strong>
      </div>
    </div>
  `;

  const textContent = `Internal notification from your TrustVerify workspace.

Customer profile: ${customerName}
Action taken: ${isAlert ? "Rejected / Flagged" : "Approved"}
Processed by: ${actionBy}

Log in to your dashboard to review the full audit log for this profile.

You received this email because you enabled this notification type in your account settings.

TrustVerify`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    text: textContent,
    html: htmlContent,
    // 🆕 [DÉLIVRABILITÉ] En-tête List-Unsubscribe, présent uniquement sur les
    // emails de NOTIFICATION (celui-ci et le rapport hebdomadaire) — pas sur
    // les transactionnels critiques comme un code OTP ou une réinitialisation
    // de mot de passe, où proposer un désabonnement n'aurait aucun sens.
    //
    // Ce que ça change : les filtres considèrent qu'un expéditeur offrant une
    // sortie facile agit de bonne foi, et Gmail affiche un bouton "Se
    // désabonner" natif — ce qui évite qu'un destinataire agacé clique sur
    // "Signaler comme spam", geste bien plus dommageable pour la réputation.
    //
    // ⚠️ Honnêtement partiel : ce mailto ouvre juste un email vers le support,
    // il n'existe pas encore de traitement automatisé derrière. Les préférences
    // restent modifiables dans les Settings de l'application.
    headers: {
      "List-Unsubscribe": `<mailto:${process.env.EMAIL_USER}?subject=Unsubscribe>`,
    },
  });
};

// ============================================================================
// 📊 EMAIL DE RAPPORT HEBDOMADAIRE (CRON JOB)
// ============================================================================
// Déclenché une fois par semaine par app/api/cron/weekly-report (planifié dans
// vercel.json, protégé par CRON_SECRET), pour chaque utilisateur ayant activé
// `emailNotifWeekly`. Résume l'activité KYC des 7 derniers jours de SON
// entreprise (les métriques sont déjà filtrées par companyId en amont).
// ============================================================================
// ============================================================================
// 📊 EMAIL DE RAPPORT HEBDOMADAIRE (CRON JOB)
// ============================================================================
// Déclenché une fois par semaine par app/api/cron/weekly-report (planifié dans
// vercel.json, protégé par CRON_SECRET), pour chaque utilisateur ayant activé
// `emailNotifWeekly`. Résume l'activité KYC des 7 derniers jours de SON
// entreprise (les métriques sont déjà filtrées par companyId en amont).
//
// 🆕 [FIX] LES LIBELLÉS DÉCRIVAIENT MAL CE QU'ILS COMPTAIENT.
// "Total Verifications Processed" affichait en réalité les dossiers REÇUS, y
// compris ceux encore en attente — d'où des rapports du type "Total: 2,
// Approuvés: 0, Rejetés: 1" où le second dossier semblait s'être évaporé.
//
// Le rapport distingue désormais explicitement les deux natures de métriques :
// ce qui est ARRIVÉ (nouveaux dossiers) et ce qui a été FAIT (décisions prises).
// ============================================================================
export const sendWeeklyReportEmail = async (
  to: string, 
  name: string, 
  // 🆕 `total` devient `submitted` (nom honnête : ce sont des dépôts, pas des
  // traitements), et `pending` fait son entrée.
  stats: { submitted: number; pending: number; approved: number; rejected: number; highRisk: number }
) => {
  // 🆕 [A4] `name` échappé pour le HTML ; les `stats` sont des NOMBRES calculés
  // par Prisma, aucun humain ne peut y glisser du HTML.
  const safeName = escapeHtml(name);

  // 🆕 Total réel des décisions prises cette semaine. C'est LA métrique qu'un
  // responsable cherche en priorité : combien de dossiers l'équipe a-t-elle
  // effectivement traités ?
  const processed = stats.approved + stats.rejected;

  const subject = "Your weekly TrustVerify summary";
  
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #eff6ff; color: #1d4ed8; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Weekly Summary</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Compliance Operations Report</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Here is the automated summary of your workspace's KYC verification activities over the last 7 days.</p>
      
      <!-- 🆕 SECTION 1 — CE QUE VOTRE ÉQUIPE A FAIT.
           Placée en PREMIER car c'est la question à laquelle un rapport
           d'activité doit répondre. Les sous-totaux approuvé/rejeté sont
           volontairement indentés sous "Decisions Made" : le lecteur voit
           immédiatement qu'ils s'additionnent pour former ce total, ce qui
           supprime toute impression de chiffres incohérents. -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
        <h3 style="margin-top: 0; color: #111827; font-size: 16px;">Work completed this week</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
          <tr>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Decisions Made:</td>
            <td style="padding: 8px 0; color: #111827; font-weight: bold; text-align: right; border-bottom: 1px solid #e2e8f0;">${processed}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0 8px 16px; color: #4b5563; font-size: 14px; border-bottom: 1px solid #e2e8f0;">→ Approved:</td>
            <td style="padding: 8px 0; color: #166534; font-weight: bold; text-align: right; border-bottom: 1px solid #e2e8f0;">${stats.approved}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0 8px 16px; color: #4b5563; font-size: 14px;">→ Rejected:</td>
            <td style="padding: 8px 0; color: #991b1b; font-weight: bold; text-align: right;">${stats.rejected}</td>
          </tr>
        </table>
      </div>

      <!-- 🆕 SECTION 2 — CE QUI EST ARRIVÉ ET CE QUI RESTE À FAIRE.
           "Awaiting Review" est la métrique la plus actionnable du rapport, et
           elle était totalement absente. Sa mention "(all time)" est
           importante : contrairement aux autres, elle n'est pas limitée à 7
           jours — un dossier en attente depuis trois semaines est justement le
           plus préoccupant, le masquer irait à l'encontre du but. -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
        <h3 style="margin-top: 0; color: #111827; font-size: 16px;">Incoming &amp; backlog</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 14px; border-bottom: 1px solid #e2e8f0;">New Applications Received:</td>
            <td style="padding: 8px 0; color: #111827; font-weight: bold; text-align: right; border-bottom: 1px solid #e2e8f0;">${stats.submitted}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 14px; border-bottom: 1px solid #e2e8f0;">Awaiting Review <span style="color: #9ca3af; font-size: 12px;">(all time)</span>:</td>
            <td style="padding: 8px 0; color: ${stats.pending > 0 ? "#b45309" : "#111827"}; font-weight: bold; text-align: right; border-bottom: 1px solid #e2e8f0;">${stats.pending}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">High Risk Flagged <span style="color: #9ca3af; font-size: 12px;">(new)</span>:</td>
            <td style="padding: 8px 0; color: #b45309; font-weight: bold; text-align: right;">${stats.highRisk}</td>
          </tr>
        </table>
      </div>
      
      <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
        This automated report was generated based on your Account Settings preferences.<br/>
        <strong style="color: #4b5563;">TrustVerify</strong>
      </div>
    </div>
  `;

  // 🆕 La version texte suit exactement la même structure en deux sections. Un
  // email dont les versions HTML et texte racontent des choses différentes est
  // plus suspect aux yeux des filtres anti-spam qu'un email sans version texte.
  const textContent = `Hello ${name},

Here is the summary of your workspace's KYC activity over the last 7 days.

WORK COMPLETED THIS WEEK
Decisions made: ${processed}
  - Approved: ${stats.approved}
  - Rejected: ${stats.rejected}

INCOMING & BACKLOG
New applications received: ${stats.submitted}
Awaiting review (all time): ${stats.pending}
High risk flagged (new): ${stats.highRisk}

This report was generated based on your account settings preferences.

TrustVerify`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    text: textContent,
    html: htmlContent,
    headers: {
      "List-Unsubscribe": `<mailto:${process.env.EMAIL_USER}?subject=Unsubscribe>`,
    },
  });
};
// ============================================================================
// 🆕 [PHASE B] 🔓 EMAIL DE RÉINITIALISATION DE MOT DE PASSE
// ============================================================================
// Envoyé quand un utilisateur clique "Forgot password?" sur la page de login.
// `resetLink` contient un jeton à usage unique valable 30 minutes (généré par
// app/api/auth/forgot-password, dont seule l'empreinte SHA-256 est stockée en
// base — voir le modèle PasswordResetToken dans schema.prisma).
//
// ⚠️ Ce lien vaut un mot de passe temporaire : quiconque le possède peut
// changer le mot de passe du compte. D'où la durée de vie très courte et
// l'usage unique.
// ============================================================================
export const sendPasswordResetEmail = async (
  to: string,
  name: string,
  resetLink: string
) => {
  const safeName = escapeHtml(name);
  const safeResetLink = escapeHtml(resetLink);

  // 🆕 [DÉLIVRABILITÉ] Sujet conservé : il était déjà correct — factuel, sans
  // majuscules ni emoji, et il nomme le produit.
  const subject = "Reset Your TrustVerify Password";
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #fef3c7; color: #92400e; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Password Reset</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Reset Your Password</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">We received a request to reset the password for your TrustVerify account. Click the button below to choose a new one.</p>

      <div style="margin: 32px 0; text-align: center;">
        <a href="${safeResetLink}" style="background-color: #1d4ed8; color: #ffffff; padding: 14px 28px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">Reset My Password</a>
      </div>

      ${linkFallbackBlock(safeResetLink)}

      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; text-align: center;">
        This secure link expires in 30 minutes and can only be used once.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #94a3b8; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #475569;">
          <strong>You didn't request this?</strong> You can safely ignore this email — your password will remain unchanged. No action is required on your part.
        </p>
      </div>

      <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
        Securely yours,<br/>
        <strong style="color: #4b5563;">TrustVerify</strong>
      </div>
    </div>
  `;

  const textContent = `Hello ${name},

We received a request to reset the password for your TrustVerify account.

Open this link to choose a new password:
${resetLink}

This link expires in 30 minutes and can only be used once.

If you did not request this, you can safely ignore this email — your password will remain unchanged.

Securely yours,
TrustVerify`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    text: textContent,
    html: htmlContent,
  });
};