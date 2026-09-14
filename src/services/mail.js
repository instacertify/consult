const nodemailer = require('nodemailer');

function isEmailConfigured() {
  if (process.env.EMAIL_ENABLED === 'false') return false;
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendLeadEmail(lead) {
  if (!isEmailConfigured()) {
    return {
      sent: false,
      skipped: true,
      reason:
        'SMTP not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password). See GMAIL_SETUP.md',
    };
  }

  const to = process.env.LEAD_TO_EMAIL || 'contact@instacertify.com';
  const from = process.env.LEAD_FROM_EMAIL || process.env.SMTP_USER;
  const transport = createTransport();

  const subject = `[Consult Lead] ${lead.page_slug || 'site'} — ${lead.name || 'Unknown'} (${lead.phone || 'no phone'})`;
  const text = `
New lead from consult.instacertify.com

Page: ${lead.page_slug || '-'}
Name: ${lead.name || '-'}
Email: ${lead.email || '-'}
Phone: ${lead.country_code || ''} ${lead.phone || '-'}
Role: ${lead.role || '-'}
Product / need: ${lead.product || '-'}
Consent: ${lead.consent ? 'yes' : 'no'}
Time: ${lead.created_at || '-'}
IP address: ${lead.ip || '-'}
User agent: ${lead.user_agent || '-'}

---
Manage leads in Admin → Leads
`.trim();

  const html = `
    <h2 style="font-family:system-ui,sans-serif;color:#0A3A52">New consult lead</h2>
    <table style="font-family:system-ui,sans-serif;border-collapse:collapse;width:100%;max-width:560px">
      ${row('Page', lead.page_slug)}
      ${row('Name', lead.name)}
      ${row('Email', lead.email)}
      ${row('Phone', `${lead.country_code || ''} ${lead.phone || ''}`.trim())}
      ${row('Role', lead.role)}
      ${row('Product / need', lead.product)}
      ${row('Consent', lead.consent ? 'yes' : 'no')}
      ${row('Time', lead.created_at)}
      ${row('IP address', lead.ip)}
      ${row('User agent', lead.user_agent)}
    </table>
  `;

  await transport.sendMail({ from, to, subject, text, html, replyTo: lead.email || undefined });
  return { sent: true };
}

function row(label, value) {
  return `<tr>
    <td style="padding:8px 10px;border:1px solid #DCE6ED;background:#F4F8FB;font-weight:600;width:140px">${escapeHtml(label)}</td>
    <td style="padding:8px 10px;border:1px solid #DCE6ED">${escapeHtml(value || '-')}</td>
  </tr>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendLeadEmail, isEmailConfigured };
