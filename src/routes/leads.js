const express = require('express');
const {
  createLead,
  markLeadEmail,
  getPageBySlug,
} = require('../services/pages');
const { sendLeadEmail } = require('../services/mail');

const router = express.Router();

function pickLead(body, fallbackSlug) {
  return {
    page_slug: body.page_slug || body.page || fallbackSlug || '',
    name: body.name || '',
    email: body.email || '',
    country_code: body.country_code || body.cc || '',
    phone: body.phone || '',
    role: body.role || body.rating || '',
    product: body.product || body.prod || '',
    consent: body.consent === '1' || body.consent === 'on' || body.consent === true,
    raw: body,
  };
}

/** Best-effort client IP behind proxies / Cloudflare / load balancers. */
function clientIp(req) {
  const candidates = [
    req.headers['cf-connecting-ip'],
    req.headers['true-client-ip'],
    req.headers['x-real-ip'],
    req.headers['x-client-ip'],
  ];
  for (const c of candidates) {
    const v = cleanIp(c);
    if (v) return v;
  }
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0];
    const v = cleanIp(first);
    if (v) return v;
  }
  return cleanIp(req.socket?.remoteAddress || req.ip || '') || '';
}

function cleanIp(value) {
  if (!value) return '';
  let ip = String(value).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

/** Local India time + ISO for storage/display. */
function captureTime() {
  const now = new Date();
  const ist = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  return {
    iso: now.toISOString(),
    ist: `${ist} IST`,
    unix: Math.floor(now.getTime() / 1000),
  };
}

async function handleLead(req, res, fallbackSlug) {
  const body = req.body || {};
  const data = pickLead(body, fallbackSlug);

  if (!data.name || !data.phone) {
    const wantsJson =
      req.xhr ||
      (req.headers.accept || '').includes('application/json') ||
      req.is('application/json');
    if (wantsJson) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }
    return res.status(400).send('Name and phone are required.');
  }

  const ip = clientIp(req);
  const when = captureTime();
  const userAgent = req.headers['user-agent'] || '';

  const lead = createLead({
    ...data,
    ip,
    user_agent: userAgent,
    submitted_at: when.ist,
    raw: {
      ...data.raw,
      _meta: {
        ip,
        submitted_at_ist: when.ist,
        submitted_at_iso: when.iso,
        submitted_at_unix: when.unix,
        user_agent: userAgent,
      },
    },
  });

  try {
    const mail = await sendLeadEmail(lead);
    if (mail.sent) markLeadEmail(lead.id, { sent: true });
    else markLeadEmail(lead.id, { sent: false, error: mail.reason || 'not sent' });
  } catch (err) {
    markLeadEmail(lead.id, { sent: false, error: err.message });
  }

  const wantsJson =
    req.xhr ||
    (req.headers.accept || '').includes('application/json') ||
    req.is('application/json');

  if (wantsJson) {
    return res.json({
      ok: true,
      id: lead.id,
      ip: lead.ip,
      submitted_at: lead.created_at,
    });
  }

  const slug = data.page_slug;
  const page = slug ? getPageBySlug(slug) : null;
  const back = page ? page.canonical_path || `/${page.slug}` : '/';
  return res.redirect(`${back}?sent=1#apply`);
}

router.post('/leads', (req, res) => handleLead(req, res));
router.post('/bis-submit', (req, res) => handleLead(req, res, 'bis-certification'));
router.post('/lmpc-submit', (req, res) => handleLead(req, res, 'lmpc-certificate'));
router.post('/msds-submit', (req, res) => handleLead(req, res, 'msds-certificate'));

module.exports = { router, handleLead, clientIp, captureTime };
