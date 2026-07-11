import nodemailer from "nodemailer";

// Configuration globale du transporteur sécurisé
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// ============================================================================
// 📁 EMAILS DE STATUT KYC (Existant)
// ============================================================================
export const sendKYCEmail = async (
  to: string, 
  status: string, 
  name: string, 
  rejectionReason?: string
) => {
  let subject = "";
  let htmlContent = "";

  if (status === "verified") {
    subject = "KYC Verification Approved - Access Granted";
    htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
        <div style="margin-bottom: 24px;">
          <span style="background-color: #dcfce7; color: #166534; font-weight: bold; font-size: 12px; padding: 6px 12px; rounded-full: 9999px; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 12px;">Compliance Update</span>
        </div>
        <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Identity Verified Successfully</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${name}</strong>,</p>
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
          <span style="background-color: #fee2e2; color: #991b1b; font-weight: bold; font-size: 12px; padding: 6px 12px; rounded-full: 9999px; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 12px;">Action Required</span>
        </div>
        <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Unable to Verify Identity</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">We have processed your identity verification request, but our risk mitigation engine was unable to authenticate your application with the provided documents.</p>
        
        <div style="background-color: #fef2f2; padding: 18px; border-left: 4px solid #dc2626; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 14px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Declination Reason:</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #7f1d1d;">${rejectionReason || "The provided identification documents do not satisfy readability, clarity, or security requirements."}</p>
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
// 🛡️ NOUVEAU : EMAILS D'INVITATION D'ÉQUIPE (Phase 5.1)
// ============================================================================
// ============================================================================
// 🛡️ NOUVEAU : EMAILS D'INVITATION D'ÉQUIPE (Lien Sécurisé)
// ============================================================================
export const sendAgentInvitationEmail = async (
  to: string, 
  name: string, 
  setupLink: string // 💡 On ne reçoit plus le mot de passe, mais le lien cryptographique
) => {
  const subject = "ACTION REQUIRED: Join the Compliance Team";
  
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #e0e7ff; color: #3730a3; font-weight: bold; font-size: 12px; padding: 6px 12px; rounded-full: 9999px; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 12px;">Organization Invitation</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Welcome to the Team</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${name}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Your Administrator has provisioned a KYC Agent account for you. To access the secure compliance infrastructure, you must set up your authentication credentials.</p>
      
      <div style="margin: 32px 0; text-align: center;">
        <a href="${setupLink}" style="background-color: #1d4ed8; color: #ffffff; padding: 14px 28px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">Activate Your Account</a>
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