// ============================================================================
// ✉️ SERVICE D'ENVOI D'EMAILS — TOUS LES TEMPLATES TRANSACTIONNELS
// ============================================================================
// Pourquoi ce fichier existe : centralise l'unique transporteur SMTP (Nodemailer
// + Gmail) et les 5 templates HTML utilisés par l'application, pour ne pas
// dupliquer la config d'envoi ni le style visuel dans chaque route API.
//
// ✅ [A4 — RÉSOLU] Les valeurs interpolées dans le HTML (nom du client, motif
// de rejet, etc.) viennent de formulaires utilisateurs : elles sont désormais
// TOUTES passées par escapeHtml() avant injection dans les templates. Un
// `customerName` contenant du HTML/JS s'affiche maintenant comme du texte
// inerte au lieu d'être interprété par le client email.
import nodemailer from "nodemailer";

// ============================================================================
// 🆕 [A4] 🛡️ ÉCHAPPEMENT HTML — LA CORRECTION DE LA FAILLE D'INJECTION
// ============================================================================
// Problème corrigé : les templates ci-dessous injectent des valeurs venant de
// formulaires utilisateurs (`${name}`, `${rejectionReason}`...) directement
// dans du HTML. Sans échappement, un nom comme
// `<a href="https://site-pirate.com">Cliquez ici</a>` partirait dans l'email
// comme un VRAI lien cliquable — du phishing envoyé depuis notre propre
// adresse "Compliance Operations", avec notre design et notre réputation.
//
// La parade : remplacer les 5 caractères qui ont un sens spécial en HTML par
// leur entité inoffensive. Après ce traitement, le HTML malveillant s'affiche
// comme du simple texte visible (l'utilisateur voit littéralement `<a href=...`
// écrit en toutes lettres) au lieu d'être interprété.
//
// ⚠️ L'ordre compte : `&` DOIT être remplacé en premier, sinon on ré-échapperait
// les entités qu'on vient de créer (`<` → `&lt;` → `&amp;lt;` = cassé).
//
// Règle d'application : on échappe TOUT ce qui vient d'un humain (name,
// customerName, rejectionReason, actionBy). On n'échappe PAS ce que notre
// serveur génère lui-même (otpCode, stats numériques, couleurs internes) —
// inutile, puisque nous en contrôlons le contenu.
const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

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
  // On échappe une seule fois ici, en haut, puis les templates n'utilisent
  // QUE les versions sûres — impossible d'oublier un endroit plus bas.
  const safeName = escapeHtml(name);
  const safeRejectionReason = rejectionReason ? escapeHtml(rejectionReason) : undefined;

  let subject = "";
  let htmlContent = "";

  if (status === "verified") {
    subject = "KYC Verification Approved - Access Granted";
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
  } else if (status === "rejected") {
    subject = "ACTION REQUIRED: KYC Verification Update";
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
  }

  await transporter.sendMail({
    from: `"Compliance Operations" <${process.env.EMAIL_USER}>`,
    to,
    subject,
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
  // aussi par défense en profondeur : il est injecté dans un attribut href, et
  // si sa construction change un jour en amont, l'email restera sûr.
  const safeName = escapeHtml(name);
  const safeSetupLink = escapeHtml(setupLink);

  const subject = "ACTION REQUIRED: Join the Compliance Team";
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
      
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; text-align: center;">
        This secure link will expire in exactly 24 hours. If it expires, please contact your administrator for a new invitation.
      </p>

      <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
        Securely yours,<br/>
        <strong style="color: #4b5563;">System Administrator</strong>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Security Admin" <${process.env.EMAIL_USER}>`,
    to,
    subject,
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
// notre propre serveur (6 chiffres), jamais saisi par un utilisateur. Il n'y a
// aucune donnée d'origine externe dans ce template.
// ============================================================================
export const sendVerificationOtpEmail = async (to: string, otpCode: string) => {
  const subject = "Verify Your Business Email";
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
        <strong style="color: #4b5563;">The Security Operations Team</strong>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Security Operations" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
  });
};

// ============================================================================
// 🔔 EMAILS DE NOTIFICATION INTERNE (Pour les Agents, basé sur les Settings)
// ============================================================================
// Envoyé à un AGENT/ADMIN interne (pas au client final) quand un dossier KYC
// change de statut, SEULEMENT si l'utilisateur a activé cette préférence dans
// ses réglages (`emailNotifSuccess` / `emailNotifAlerts` en base — voir
// app/api/settings/notifications). `type` détermine le ton : succès ou alerte
// nécessitant une revue.
// ============================================================================
export const sendAgentNotificationEmail = async (
  to: string, 
  type: "SUCCESS" | "ALERT", 
  customerName: string, 
  actionBy: string
) => {
  // 🆕 [A4] `customerName` vient du formulaire de création du dossier KYC, et
  // `actionBy` du profil de l'agent (fullName, saisi à l'inscription) : les
  // deux sont d'origine humaine → échappés. Le sujet de l'email n'a PAS besoin
  // d'échappement HTML (un sujet est du texte brut, jamais interprété comme du
  // HTML par les clients mail) — on n'y met donc pas la version échappée,
  // sinon un client s'appelant "O'Brien" verrait "O&#39;Brien" dans le sujet.
  const safeCustomerName = escapeHtml(customerName);
  const safeActionBy = escapeHtml(actionBy);

  const isAlert = type === "ALERT";
  const subject = isAlert 
    ? `⚠️ AUDIT REQUIRED: Action taken on ${customerName}` 
    : `✅ VERIFICATION SUCCESS: ${customerName}`;
  
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
        <strong style="color: #4b5563;">TrustVerify System</strong>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"TrustVerify Internal" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
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
export const sendWeeklyReportEmail = async (
  to: string, 
  name: string, 
  stats: { total: number; approved: number; rejected: number; highRisk: number }
) => {
  // 🆕 [A4] `name` = fullName de l'utilisateur (saisi à l'inscription) →
  // échappé. Les `stats` sont des NOMBRES calculés par Prisma (count) : aucun
  // humain ne peut y glisser du HTML, pas d'échappement nécessaire.
  const safeName = escapeHtml(name);

  const subject = "📊 Your TrustVerify Weekly Compliance Report";
  
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #eff6ff; color: #1d4ed8; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Weekly Summary</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Compliance Operations Report</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Here is the automated summary of your workspace's KYC verification activities over the last 7 days.</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
        <h3 style="margin-top: 0; color: #111827; font-size: 16px;">Last 7 Days Metrics:</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 14px; border-bottom: 1px solid #e2e8f0;">Total Verifications Processed:</td>
            <td style="padding: 8px 0; color: #111827; font-weight: bold; text-align: right; border-bottom: 1px solid #e2e8f0;">${stats.total}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 14px; border-bottom: 1px solid #e2e8f0;">Successfully Approved:</td>
            <td style="padding: 8px 0; color: #166534; font-weight: bold; text-align: right; border-bottom: 1px solid #e2e8f0;">${stats.approved}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 14px; border-bottom: 1px solid #e2e8f0;">Rejected Applications:</td>
            <td style="padding: 8px 0; color: #991b1b; font-weight: bold; text-align: right; border-bottom: 1px solid #e2e8f0;">${stats.rejected}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">High Risk Alerts Flagged:</td>
            <td style="padding: 8px 0; color: #b45309; font-weight: bold; text-align: right;">${stats.highRisk}</td>
          </tr>
        </table>
      </div>
      
      <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; font-size: 13px; color: #9ca3af;">
        This automated report was generated based on your Account Settings preferences.<br/>
        <strong style="color: #4b5563;">TrustVerify Analytics Engine</strong>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"TrustVerify Analytics" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
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
  // 🆕 [A4] Même règle que partout ailleurs dans ce fichier : toute valeur
  // d'origine utilisateur est échappée avant d'entrer dans le HTML.
  // `resetLink` est généré par notre serveur, mais on l'échappe aussi par
  // défense en profondeur — il est injecté dans un attribut href.
  const safeName = escapeHtml(name);
  const safeResetLink = escapeHtml(resetLink);

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
        <strong style="color: #4b5563;">The Security Operations Team</strong>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Security Operations" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
  });
};