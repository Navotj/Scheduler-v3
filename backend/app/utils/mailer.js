const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const MAIL_FROM = process.env.MAIL_FROM || 'Nat20 Scheduling <no-reply@nat20scheduling.com>';
const SES_REGION = process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1';
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
const PUBLIC_FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || '').replace(/\/+$/, '');

const ses = new SESv2Client({ region: SES_REGION });

async function sendEmail(to, subject, html, text, reqId) {
  const cmd = new SendEmailCommand({
    FromEmailAddress: MAIL_FROM,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: html },
          Text: { Data: text }
        }
      }
    }
  });
  const out = await ses.send(cmd);
  if (reqId) console.log(`[MAIL][${reqId}] sent ${subject} to ${to} messageId=${out?.MessageId || '-'}`);
  return out;
}

function buildVerifyUrl(token) {
  // API handles verify then redirects back to frontend with status
  const api = PUBLIC_API_URL || '';
  return `${api}/auth/verify?token=${encodeURIComponent(token)}`;
}

function buildResetUrl(token) {
  // Serve reset form from API for now (no frontend changes required)
  const api = PUBLIC_API_URL || '';
  return `${api}/auth/reset?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(user, token, reqId) {
  const url = buildVerifyUrl(token);
  const subject = 'Verify your email for Nat20 Scheduling';
  const text = `Hi ${user.username},

Please verify your email address to activate your account.

Verify link:
${url}

If you did not create this account, you can ignore this email.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;color:#e7eaf2;background:#0a0b0d;padding:24px">
    <div style="max-width:520px;margin:auto;background:#121315;border:1px solid #1a1c20;border-radius:10px;padding:20px">
      <h1 style="margin:0 0 12px 0;font-size:20px;color:#e7eaf2">Verify your email</h1>
      <p style="margin:0 0 16px 0;color:#b6bfd4">Hi ${escapeHtml(user.username)}, click the button below to verify your email and finish setting up your account.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#7c5cff;color:#fff;text-decoration:none">Verify email</a></p>
      <p style="color:#8a93a8">If the button doesn't work, copy and paste this link:<br><span style="word-break:break-all">${url}</span></p>
    </div>
  </div>`;
  return sendEmail(user.email, subject, html, text, reqId);
}

async function sendPasswordResetEmail(user, token, reqId) {
  const url = buildResetUrl(token);
  const subject = 'Reset your Nat20 Scheduling password';
  const text = `Hi ${user.username},

You requested a password reset.

Reset link (expires soon):
${url}

If you didn't request this, you can ignore this email.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;color:#e7eaf2;background:#0a0b0d;padding:24px">
    <div style="max-width:520px;margin:auto;background:#121315;border:1px solid #1a1c20;border-radius:10px;padding:20px">
      <h1 style="margin:0 0 12px 0;font-size:20px;color:#e7eaf2">Reset your password</h1>
      <p style="margin:0 0 16px 0;color:#b6bfd4">Hi ${escapeHtml(user.username)}, click the button below to set a new password.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#7c5cff;color:#fff;text-decoration:none">Reset password</a></p>
      <p style="color:#8a93a8">If the button doesn't work, copy and paste this link:<br><span style="word-break:break-all">${url}</span></p>
    </div>
  </div>`;
  return sendEmail(user.email, subject, html, text, reqId);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
