const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const slugify = require('slugify');
const { getAllSettings, setSetting } = require('../db');
const {
  listPages,
  getPageById,
  updatePage,
  createPage,
  deletePage,
  listLeads,
} = require('../services/pages');
const {
  extractPageMetaFromHtml,
  clearPageCache,
  UPLOADS_DIR,
} = require('../services/htmlAdapter');
const { isEmailConfigured } = require('../services/mail');

const router = express.Router();

const MEDIA_DIR = path.join(UPLOADS_DIR, 'media');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const safe = slugify(path.parse(file.originalname).name, {
        lower: true,
        strict: true,
      });
      cb(null, `${Date.now()}-${safe}${path.extname(file.originalname) || '.html'}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.html?$/i.test(file.originalname) ||
      file.mimetype === 'text/html' ||
      file.mimetype === 'application/octet-stream';
    cb(ok ? null : new Error('Only HTML files allowed'), ok);
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
    filename: (_req, file, cb) => {
      const safe = slugify(path.parse(file.originalname).name, {
        lower: true,
        strict: true,
      });
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${Date.now()}-${safe}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only image files allowed'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.path === '/login') return next();
  return res.redirect('/admin/login');
}

router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.send(loginPage(req.query.error));
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const expected = process.env.ADMIN_PASSWORD || 'change-me-admin';
  if (String(req.body.password || '') === expected) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  return res.redirect('/admin/login?error=1');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.use(requireAuth);

router.get('/', (req, res) => {
  const settings = getAllSettings();
  const pages = listPages();
  const leads = listLeads(50);
  res.send(adminDashboard({ settings, pages, leads, emailOk: isEmailConfigured() }));
});

router.get('/pages/:id', (req, res) => {
  const page = getPageById(Number(req.params.id));
  if (!page) return res.status(404).send('Page not found');
  const settings = getAllSettings();
  res.send(pageEditor({ page, settings }));
});

router.post(
  '/pages/:id',
  express.urlencoded({ extended: true }),
  (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    const role_options = String(b.role_options || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    let slug = slugify(b.slug || '', { lower: true, strict: true });
    if (!slug) slug = getPageById(id)?.slug;

    updatePage(id, {
      slug,
      title: b.title,
      meta_description: b.meta_description,
      canonical_path: b.canonical_path || `/${slug}`,
      robots: b.robots || 'index, follow',
      og_title: b.og_title,
      og_description: b.og_description,
      hero_h1: b.hero_h1,
      hero_lede: b.hero_lede,
      form_heading: b.form_heading,
      whatsapp_text: b.whatsapp_text,
      phone: b.phone,
      role_options,
      enabled: b.enabled === '1' ? 1 : 0,
      sort_order: Number(b.sort_order || 0),
      hub_label: b.hub_label,
      hub_blurb: b.hub_blurb,
      hub_badge: b.hub_badge,
    });
    clearPageCache();
    res.redirect(`/admin/pages/${id}?saved=1`);
  }
);

router.post('/pages/:id/delete', express.urlencoded({ extended: true }), (req, res) => {
  deletePage(Number(req.params.id));
  clearPageCache();
  res.redirect('/admin');
});

router.post(
  '/settings',
  express.urlencoded({ extended: true }),
  (req, res) => {
    const b = req.body;
    const site = {
      brandName: b.brandName,
      brandTagline: b.brandTagline,
      baseUrl: b.baseUrl,
      hubTitle: b.hubTitle,
      hubDescription: b.hubDescription,
      hubEyebrow: b.hubEyebrow,
      hubSupport: b.hubSupport,
      whatsappNumber: b.whatsappNumber,
      defaultPhone: b.defaultPhone,
      defaultPhoneHref: b.defaultPhoneHref,
      leadEmail: b.leadEmail,
      googleAdsId: b.googleAdsId,
      robotsDefault: b.robotsDefault,
      logoUrl: b.logoUrl || getAllSettings().site?.logoUrl || '',
    };
    const footer = {
      company: b.company,
      address: b.address,
      cin: b.cin,
      phone: b.phone,
      phoneHref: b.phoneHref,
      email: b.email,
      offices: String(b.offices || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      alsoHandles: b.alsoHandles,
      policies: [
        { label: 'Privacy Policy', href: b.policyPrivacy || 'https://instacertify.com/privacy-policy' },
        { label: 'Terms of Service', href: b.policyTerms || 'https://instacertify.com/terms-of-service' },
        { label: 'Refund Policy', href: b.policyRefund || 'https://instacertify.com/refund-policy' },
      ],
      legal: b.legal,
    };
    setSetting('site', site);
    setSetting('footer', footer);
    clearPageCache();
    res.redirect('/admin?saved=settings');
  }
);

router.post('/upload-html', upload.single('html'), (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded');
    const html = fs.readFileSync(req.file.path, 'utf8');
    const desiredSlug =
      slugify(req.body.slug || path.parse(req.file.originalname).name, {
        lower: true,
        strict: true,
      }) || `page-${Date.now()}`;

    const meta = extractPageMetaFromHtml(html, desiredSlug);
    const page = createPage({
      slug: desiredSlug,
      title: req.body.title || meta.title,
      meta_description: meta.meta_description,
      canonical_path: `/${desiredSlug}`,
      robots: meta.robots,
      og_title: meta.og_title,
      og_description: meta.og_description,
      hero_h1: meta.hero_h1,
      form_heading: meta.form_heading,
      role_options: meta.role_options,
      whatsapp_text: req.body.whatsapp_text || 'Hi, I need certification help.',
      hub_label: req.body.hub_label || meta.title.split('|')[0].trim(),
      hub_blurb: req.body.hub_blurb || meta.meta_description.slice(0, 140),
      hub_badge: req.body.hub_badge || 'New path',
      source_file: req.file.filename,
      source_type: 'upload',
      enabled: 1,
      sort_order: 50,
    });
    clearPageCache();
    res.redirect(`/admin/pages/${page.id}?uploaded=1`);
  } catch (err) {
    res.status(500).send(`Upload failed: ${err.message}`);
  }
});

router.post('/upload-logo', mediaUpload.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No image uploaded');
    const settings = getAllSettings();
    const site = { ...(settings.site || {}), logoUrl: `/media/${req.file.filename}` };
    setSetting('site', site);
    clearPageCache();
    res.redirect('/admin?saved=logo');
  } catch (err) {
    res.status(500).send(`Logo upload failed: ${err.message}`);
  }
});

router.get('/leads', (req, res) => {
  res.send(leadsPage(listLeads(500)));
});

/* ---------- HTML UI helpers ---------- */

function shell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Instacertify CMS</title>
<link rel="stylesheet" href="/css/admin.css">
</head>
<body>
<header class="top">
  <a class="brand" href="/admin">Instacertify CMS</a>
  <nav>
    <a href="/admin">Dashboard</a>
    <a href="/admin/leads">Leads</a>
    <a href="/" target="_blank" rel="noopener">View site</a>
    <form method="post" action="/admin/logout" style="display:inline"><button type="submit" class="linkish">Logout</button></form>
  </nav>
</header>
<main class="wrap">${body}</main>
</body></html>`;
}

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Admin Login</title>
<link rel="stylesheet" href="/css/admin.css"></head>
<body class="login">
<form class="card" method="post" action="/admin/login">
  <h1>Consult CMS</h1>
  <p>Manage pages, footer, URLs, HTML uploads and leads.</p>
  ${error ? '<p class="err">Incorrect password</p>' : ''}
  <label>Password <input type="password" name="password" required autofocus></label>
  <button type="submit">Sign in</button>
</form>
</body></html>`;
}

function adminDashboard({ settings, pages, leads, emailOk }) {
  const site = settings.site || {};
  const footer = settings.footer || {};
  return shell(
    'Dashboard',
    `
    <h1>Dashboard</h1>
    <p class="muted">Host: <code>${esc(site.baseUrl || 'https://consult.instacertify.com')}</code>
      · Email pipeline: <strong>${emailOk ? 'SMTP configured' : 'SMTP not configured — leads still saved'}</strong>
      · See <code>GMAIL_SETUP.md</code></p>

    <section class="grid-2">
      <div class="panel">
        <h2>Customer paths (pages)</h2>
        <table>
          <thead><tr><th>Path</th><th>URL</th><th>On hub</th><th></th></tr></thead>
          <tbody>
            ${pages
              .map(
                (p) => `<tr>
              <td><strong>${esc(p.hub_label || p.slug)}</strong><br><span class="muted">${esc(p.hub_badge || '')}</span></td>
              <td><a href="${esc(p.canonical_path || '/' + p.slug)}" target="_blank">/${esc(p.slug)}</a></td>
              <td>${p.enabled ? 'Yes' : 'No'}</td>
              <td><a class="btn" href="/admin/pages/${p.id}">Edit</a></td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Upload HTML → adapt into site</h2>
        <p class="muted">Upload a standalone landing HTML. We extract SEO/title/H1/form dropdowns, wire the form to lead capture, and add it to the hub path chooser.</p>
        <form method="post" action="/admin/upload-html" enctype="multipart/form-data" class="stack">
          <label>HTML file <input type="file" name="html" accept=".html,.htm,text/html" required></label>
          <label>URL slug <input name="slug" placeholder="e.g. cdsco-license"></label>
          <label>Hub label <input name="hub_label" placeholder="Shown on path chooser"></label>
          <label>Hub blurb <input name="hub_blurb" placeholder="One short sentence"></label>
          <label>Badge <input name="hub_badge" placeholder="e.g. New"></label>
          <button type="submit">Upload & adapt</button>
        </form>
      </div>
    </section>

    <section class="panel">
      <h2>Site + footer settings</h2>
      <form method="post" action="/admin/settings" class="form-grid">
        <fieldset>
          <legend>Hub / brand</legend>
          <label>Brand name <input name="brandName" value="${esc(site.brandName || '')}"></label>
          <label>Tagline <input name="brandTagline" value="${esc(site.brandTagline || '')}"></label>
          <label>Base URL <input name="baseUrl" value="${esc(site.baseUrl || '')}"></label>
          <label>Hub eyebrow <input name="hubEyebrow" value="${esc(site.hubEyebrow || '')}"></label>
          <label>Hub title <input name="hubTitle" value="${esc(site.hubTitle || '')}"></label>
          <label>Hub description <textarea name="hubDescription" rows="3">${esc(site.hubDescription || '')}</textarea></label>
          <label>Hub support line <textarea name="hubSupport" rows="2">${esc(site.hubSupport || '')}</textarea></label>
          <label>WhatsApp number (digits) <input name="whatsappNumber" value="${esc(site.whatsappNumber || '')}"></label>
          <label>Default phone <input name="defaultPhone" value="${esc(site.defaultPhone || '')}"></label>
          <label>Default phone href <input name="defaultPhoneHref" value="${esc(site.defaultPhoneHref || '')}"></label>
          <label>Lead email <input name="leadEmail" value="${esc(site.leadEmail || '')}"></label>
          <label>Logo URL (or upload below) <input name="logoUrl" value="${esc(site.logoUrl || '')}"></label>
          <label>Google Ads ID <input name="googleAdsId" value="${esc(site.googleAdsId || '')}"></label>
          <label>Default robots
            <select name="robotsDefault">
              <option value="index, follow" ${site.robotsDefault === 'index, follow' ? 'selected' : ''}>index, follow</option>
              <option value="noindex, follow" ${site.robotsDefault === 'noindex, follow' ? 'selected' : ''}>noindex, follow</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Footer</legend>
          <label>Company <input name="company" value="${esc(footer.company || '')}"></label>
          <label>Address <input name="address" value="${esc(footer.address || '')}"></label>
          <label>CIN <input name="cin" value="${esc(footer.cin || '')}"></label>
          <label>Phone display <input name="phone" value="${esc(footer.phone || '')}"></label>
          <label>Phone href <input name="phoneHref" value="${esc(footer.phoneHref || '')}"></label>
          <label>Email <input name="email" value="${esc(footer.email || '')}"></label>
          <label>Offices (one per line) <textarea name="offices" rows="4">${esc((footer.offices || []).join('\n'))}</textarea></label>
          <label>Also handles <textarea name="alsoHandles" rows="2">${esc(footer.alsoHandles || '')}</textarea></label>
          <label>Privacy URL <input name="policyPrivacy" value="${esc((footer.policies && footer.policies[0]?.href) || '')}"></label>
          <label>Terms URL <input name="policyTerms" value="${esc((footer.policies && footer.policies[1]?.href) || '')}"></label>
          <label>Refund URL <input name="policyRefund" value="${esc((footer.policies && footer.policies[2]?.href) || '')}"></label>
          <label>Legal text <textarea name="legal" rows="5">${esc(footer.legal || '')}</textarea></label>
        </fieldset>
        <button type="submit">Save site & footer</button>
      </form>
      <form method="post" action="/admin/upload-logo" enctype="multipart/form-data" class="stack" style="margin-top:16px">
        <h3 style="margin:0 0 8px;color:#0F2230">Replace logo image</h3>
        ${site.logoUrl ? `<p class="muted">Current: <a href="${esc(site.logoUrl)}" target="_blank">${esc(site.logoUrl)}</a></p>` : ''}
        <label>Logo image <input type="file" name="logo" accept="image/*" required></label>
        <button type="submit">Upload logo</button>
      </form>
    </section>

    <section class="panel">
      <h2>Recent leads</h2>
      <p><a href="/admin/leads">View all →</a></p>
      <table>
        <thead><tr><th>When</th><th>Page</th><th>Name</th><th>Phone</th><th>Emailed</th></tr></thead>
        <tbody>
          ${leads
            .slice(0, 8)
            .map(
              (l) => `<tr>
            <td>${esc(l.created_at)}</td>
            <td>${esc(l.page_slug)}</td>
            <td>${esc(l.name)}</td>
            <td>${esc((l.country_code || '') + ' ' + (l.phone || ''))}</td>
            <td>${l.email_sent ? 'Yes' : 'No'}</td>
          </tr>`
            )
            .join('') || '<tr><td colspan="5">No leads yet</td></tr>'}
        </tbody>
      </table>
    </section>
  `
  );
}

function pageEditor({ page }) {
  let roles = [];
  try {
    roles = JSON.parse(page.role_options || '[]');
  } catch {
    roles = [];
  }
  return shell(
    `Edit ${page.slug}`,
    `
    <p><a href="/admin">← Dashboard</a></p>
    <h1>Edit page · ${esc(page.hub_label || page.slug)}</h1>
    <p class="muted">Live URL: <a href="${esc(page.canonical_path || '/' + page.slug)}" target="_blank">${esc(page.canonical_path || '/' + page.slug)}</a>
      · Source: <code>${esc(page.source_type)} / ${esc(page.source_file)}</code></p>
    <form method="post" action="/admin/pages/${page.id}" class="form-grid">
      <fieldset>
        <legend>URL & SEO</legend>
        <label>Slug (URL) <input name="slug" value="${esc(page.slug)}" required></label>
        <label>Canonical path <input name="canonical_path" value="${esc(page.canonical_path)}"></label>
        <label>Enabled
          <select name="enabled">
            <option value="1" ${page.enabled ? 'selected' : ''}>Yes — show on hub & public</option>
            <option value="0" ${!page.enabled ? 'selected' : ''}>No — hidden</option>
          </select>
        </label>
        <label>Sort order <input type="number" name="sort_order" value="${esc(page.sort_order)}"></label>
        <label>Robots
          <select name="robots">
            <option value="index, follow" ${page.robots === 'index, follow' ? 'selected' : ''}>index, follow</option>
            <option value="noindex, follow" ${page.robots === 'noindex, follow' ? 'selected' : ''}>noindex, follow</option>
          </select>
        </label>
        <label>Title <input name="title" value="${esc(page.title)}"></label>
        <label>Meta description <textarea name="meta_description" rows="3">${esc(page.meta_description)}</textarea></label>
        <label>OG title <input name="og_title" value="${esc(page.og_title)}"></label>
        <label>OG description <textarea name="og_description" rows="2">${esc(page.og_description)}</textarea></label>
      </fieldset>
      <fieldset>
        <legend>Content & dropdowns</legend>
        <label>Hub label <input name="hub_label" value="${esc(page.hub_label)}"></label>
        <label>Hub badge <input name="hub_badge" value="${esc(page.hub_badge)}"></label>
        <label>Hub blurb <textarea name="hub_blurb" rows="2">${esc(page.hub_blurb)}</textarea></label>
        <label>Hero H1 <textarea name="hero_h1" rows="2">${esc(page.hero_h1)}</textarea></label>
        <label>Hero lede (optional) <textarea name="hero_lede" rows="2">${esc(page.hero_lede)}</textarea></label>
        <label>Form heading <input name="form_heading" value="${esc(page.form_heading)}"></label>
        <label>Phone on this page <input name="phone" value="${esc(page.phone)}"></label>
        <label>WhatsApp prefill text <input name="whatsapp_text" value="${esc(page.whatsapp_text)}"></label>
        <label>Role dropdown options (one per line)
          <textarea name="role_options" rows="8">${esc(roles.join('\n'))}</textarea>
        </label>
      </fieldset>
      <button type="submit">Save page</button>
    </form>
    <form method="post" action="/admin/pages/${page.id}/delete" onsubmit="return confirm('Delete this page entry? HTML file is kept on disk.')" style="margin-top:24px">
      <button type="submit" class="danger">Delete page entry</button>
    </form>
  `
  );
}

function leadsPage(leads) {
  return shell(
    'Leads',
    `
    <h1>Leads</h1>
    <p class="muted">All form submissions are stored here and emailed to contact@instacertify.com when SMTP is configured.</p>
    <table>
      <thead>
        <tr><th>ID</th><th>When</th><th>Page</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Product</th><th>Mail</th></tr>
      </thead>
      <tbody>
        ${
          leads
            .map(
              (l) => `<tr>
          <td>${l.id}</td>
          <td>${esc(l.created_at)}</td>
          <td>${esc(l.page_slug)}</td>
          <td>${esc(l.name)}</td>
          <td>${esc(l.email)}</td>
          <td>${esc((l.country_code || '') + ' ' + (l.phone || ''))}</td>
          <td>${esc(l.role)}</td>
          <td>${esc(l.product)}</td>
          <td title="${esc(l.email_error || '')}">${l.email_sent ? 'Sent' : 'Pending/fail'}</td>
        </tr>`
            )
            .join('') || '<tr><td colspan="9">No leads yet</td></tr>'
        }
      </tbody>
    </table>
  `
  );
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
