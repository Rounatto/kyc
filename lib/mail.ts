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
// 📁 EMAILS DE STATUT KYC (Pour le Client Final)
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
          <span style="background-color: #dcfce7; color: #166534; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Compliance Update</span>
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
          <span style="background-color: #fee2e2; color: #991b1b; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Action Required</span>
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
// 🛡️ EMAILS D'INVITATION D'ÉQUIPE
// ============================================================================
export const sendAgentInvitationEmail = async (
  to: string, 
  name: string, 
  setupLink: string 
) => {
  const subject = "ACTION REQUIRED: Join the Compliance Team";
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #e0e7ff; color: #3730a3; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Organization Invitation</span>
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

// ============================================================================
// 📩 EMAIL DE VÉRIFICATION OTP (Phase 6)
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
// 🔔 NOUVEAU : EMAILS DE NOTIFICATION INTERNE (Pour les Agents, basé sur les Settings)
// ============================================================================
export const sendAgentNotificationEmail = async (
  to: string, 
  type: "SUCCESS" | "ALERT", 
  customerName: string, 
  actionBy: string
) => {
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
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;"><strong>Customer Profile:</strong> ${customerName}</p>
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;"><strong>Action Taken:</strong> ${isAlert ? 'Rejected / Flagged' : 'Approved'}</p>
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Processed By:</strong> ${actionBy}</p>
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
// 📊 NOUVEAU : EMAIL DE RAPPORT HEBDOMADAIRE (CRON JOB)
// ============================================================================
export const sendWeeklyReportEmail = async (
  to: string, 
  name: string, 
  stats: { total: number; approved: number; rejected: number; highRisk: number }
) => {
  const subject = "📊 Your TrustVerify Weekly Compliance Report";
  
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <span style="background-color: #eff6ff; color: #1d4ed8; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Weekly Summary</span>
      </div>
      <h2 style="color: #111827; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 8px;">Compliance Operations Report</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">Hello <strong>${name}</strong>,</p>
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