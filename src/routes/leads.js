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
    role: body.role || '',
    product: body.product || body.prod || '',
    consent: body.consent === '1' || body.consent === 'on' || body.consent === true,
    raw: body,
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

  const lead = createLead({
    ...data,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
    user_agent: req.headers['user-agent'] || '',
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
    return res.json({ ok: true, id: lead.id });
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

// Compatibility aliases without /api prefix are mounted in server.js

module.exports = { router, handleLead };
