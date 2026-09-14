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
  readSourceHtml,
  normalizePath,
  UPLOADS_DIR,
} = require('../services/htmlAdapter');
const { ensureCatalog } = require('../services/bisCatalog');
const { normalizeHeroStats } = require('../services/contentEditor');
const { isEmailConfigured } = require('../services/mail');
const cheerio = require('cheerio');

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
    const ok =
      /^image\//.test(file.mimetype) ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only image files allowed'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.path === '/login') return next();
  return res.redirect('/admin/login');
}

function baseUrlOf(settings) {
  return String(settings.site?.baseUrl || process.env.BASE_URL || 'https://consult.instacertify.com').replace(
    /\/$/,
    ''
  );
}

function fullUrl(settings, page) {
  const pathPart = normalizePath(page.canonical_path || `/${page.slug}`);
  return `${baseUrlOf(settings)}${pathPart}`;
}

router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.send(loginPage(req.query.error));
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const expected = process.env.ADMIN_PASSWORD || 'change-me-admin';
  console.log("DEBUG: Expected =", expected, "Received =", req.body.password, "Match =", String(req.body.password || "") === expected);
  if (String(req.body.password || "").toLowerCase() === expected.toLowerCase()) {
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
  res.send(
    adminDashboard({
      settings,
      pages,
      leads,
      emailOk: isEmailConfigured(),
      saved: req.query.saved,
    })
  );
});

router.get('/pages/:id', (req, res) => {
  const page = getPageById(Number(req.params.id));
  if (!page) return res.status(404).send('Page not found');
  const settings = getAllSettings();
  res.send(
    pageEditor({
      page,
      settings,
      saved: req.query.saved,
      reloaded: req.query.reloaded,
    })
  );
});

router.post('/pages/:id', express.urlencoded({ extended: true }), (req, res) => {
  const id = Number(req.params.id);
  const existing = getPageById(id);
  if (!existing) return res.status(404).send('Page not found');
  const b = req.body;

  // URL is editable: prefer explicit path, derive slug from it
  let canonical_path = normalizePath(b.canonical_path || b.url_path || `/${b.slug || existing.slug}`);
  let slug = slugify(b.slug || canonical_path.replace(/^\//, ''), {
    lower: true,
    strict: true,
  });
  if (!slug) slug = existing.slug;
  if (!b.canonical_path && b.slug) canonical_path = normalizePath(`/${slug}`);

  const role_options = String(b.role_options || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  let content = {};
  try {
    content = JSON.parse(existing.content_json || '{}');
  } catch {
    content = {};
  }
  content.hero_support = b.hero_support || '';
  content.flag_prefix = b.flag_prefix || '';
  content.flag_bold = b.flag_bold || '';
  content.h1_main = b.h1_main || '';
  content.h1_em = b.h1_em || '';
  content.hero_sub = b.hero_sub || b.hero_lede || '';
  content.cta_primary = b.cta_primary || '';
  content.cta_primary_href = b.cta_primary_href || '';
  content.cta_secondary = b.cta_secondary || '';
  content.cta_secondary_href = b.cta_secondary_href || '';
  content.form_sub = b.form_sub || '';
  content.trusted_label = b.trusted_label || content.trusted_label || '';
  // hero image feature removed — clear any leftover values
  delete content.hero_image_url;
  delete content.hero_image_alt;

  const ticks = [];
  for (let i = 0; i < 6; i++) {
    if (b[`tick_bold_${i}`] === undefined && b[`tick_rest_${i}`] === undefined) continue;
    ticks.push({
      bold: b[`tick_bold_${i}`] || '',
      rest: b[`tick_rest_${i}`] || '',
    });
  }
  if (ticks.length) content.ticks = ticks;

  if (b.consulting_label !== undefined) {
    content.consulting_label = String(b.consulting_label || 'Consulting Starts At').trim();
  }
  if (b.consulting_price_crs !== undefined && b.consulting_price_crs !== '') {
    content.consulting_price_crs = Number(String(b.consulting_price_crs).replace(/[^\d.]/g, '')) || 0;
  }
  if (b.consulting_price_isi !== undefined && b.consulting_price_isi !== '') {
    content.consulting_price_isi = Number(String(b.consulting_price_isi).replace(/[^\d.]/g, '')) || 0;
  }

  // Hero stats (Happy Clients / Advisors / Offices)
  content.hero_stats_enabled = b.hero_stats_enabled_present
    ? b.hero_stats_enabled === '1' || b.hero_stats_enabled === 'on'
    : content.hero_stats_enabled !== false;
  const hero_stats = normalizeHeroStats(content).map((s) => ({
    key: s.key,
    value: b[`stat_value_${s.key}`] != null ? String(b[`stat_value_${s.key}`]) : s.value,
    label: b[`stat_label_${s.key}`] != null ? String(b[`stat_label_${s.key}`]) : s.label,
    iconUrl: s.iconUrl || '',
  }));
  content.hero_stats = hero_stats;

  const sections = [];
  const keys = Object.keys(b).filter((k) => k.startsWith('section_'));
  for (const key of keys) {
    const idx = key.replace('section_', '');
    sections.push({
      key: `h2_${idx}`,
      label: b[`section_label_${idx}`] || `Section heading ${Number(idx) + 1}`,
      text: b[key] || '',
    });
  }
  // keep stable order by index
  sections.sort((a, b) => Number(a.key.split('_')[1]) - Number(b.key.split('_')[1]));
  if (sections.length) content.sections = sections;

  updatePage(id, {
    slug,
    title: b.title,
    meta_description: b.meta_description,
    canonical_path,
    robots: b.robots || 'index, follow',
    og_title: b.og_title,
    og_description: b.og_description,
    hero_h1: [b.h1_main, b.h1_em].filter(Boolean).join(' ') || b.hero_h1,
    hero_lede: b.hero_sub || b.hero_lede,
    form_heading: b.form_heading,
    whatsapp_text: b.whatsapp_text,
    phone: b.phone,
    role_options,
    enabled: b.enabled === '1' ? 1 : 0,
    sort_order: Number(b.sort_order || 0),
    hub_label: b.hub_label,
    hub_blurb: b.hub_blurb,
    hub_badge: b.hub_badge,
    content_json: content,
  });
  clearPageCache();
  res.redirect(`/admin/pages/${id}?saved=1`);
});

router.post('/pages/:id/reload-words', express.urlencoded({ extended: true }), (req, res) => {
  const id = Number(req.params.id);
  const page = getPageById(id);
  if (!page) return res.status(404).send('Page not found');
  try {
    const html = readSourceHtml(page);
    const meta = extractPageMetaFromHtml(html, page.slug);
    let existing = {};
    try {
      existing = JSON.parse(page.content_json || '{}');
    } catch {
      existing = {};
    }
    const content_json = {
      ...meta.content_json,
      trusted_brands: existing.trusted_brands || [],
      consulting_label: existing.consulting_label,
      consulting_price_crs: existing.consulting_price_crs,
      consulting_price_isi: existing.consulting_price_isi,
      bis_catalog: existing.bis_catalog || { categories: [], products: [] },
      hero_stats: existing.hero_stats,
      hero_stats_enabled: existing.hero_stats_enabled,
    };
    updatePage(id, {
      title: meta.title,
      meta_description: meta.meta_description,
      og_title: meta.og_title,
      og_description: meta.og_description,
      hero_h1: meta.hero_h1,
      hero_lede: meta.hero_lede,
      form_heading: meta.form_heading,
      role_options: meta.role_options,
      content_json,
    });
    clearPageCache();
    res.redirect(`/admin/pages/${id}?reloaded=1`);
  } catch (err) {
    res.status(500).send(`Reload failed: ${err.message}`);
  }
});

router.post('/pages/:id/stat-icon/:key', mediaUpload.single('icon'), (req, res) => {
  const id = Number(req.params.id);
  const key = String(req.params.key || '');
  const page = getPageById(id);
  if (!page) return res.status(404).send('Page not found');
  if (!['clients', 'advisors', 'offices'].includes(key)) {
    return res.status(400).send('Unknown stat key');
  }
  if (!req.file) return res.status(400).send('Upload a PNG or WebP icon');
  let content = {};
  try {
    content = JSON.parse(page.content_json || '{}');
  } catch {
    content = {};
  }
  const stats = normalizeHeroStats(content).map((s) =>
    s.key === key ? { ...s, iconUrl: `/media/${req.file.filename}` } : s
  );
  content.hero_stats = stats;
  content.hero_stats_enabled = true;
  updatePage(id, { content_json: content });
  clearPageCache();
  res.redirect(`/admin/pages/${id}?saved=stat-icon#hero-stats`);
});

router.post('/pages/:id/trusted-brand', mediaUpload.single('logo'), (req, res) => {
  const id = Number(req.params.id);
  const page = getPageById(id);
  if (!page) return res.status(404).send('Page not found');
  if (!req.file) return res.status(400).send('Upload a brand logo (PNG or WebP)');
  let content = {};
  try {
    content = JSON.parse(page.content_json || '{}');
  } catch {
    content = {};
  }
  const brands = Array.isArray(content.trusted_brands) ? content.trusted_brands : [];
  brands.push({
    name: (req.body.brand_name || 'Trusted brand').trim(),
    imageUrl: `/media/${req.file.filename}`,
  });
  content.trusted_brands = brands;
  if (req.body.trusted_label) content.trusted_label = req.body.trusted_label.trim();
  updatePage(id, { content_json: content });
  clearPageCache();
  res.redirect(`/admin/pages/${id}?saved=trusted`);
});

router.post(
  '/pages/:id/trusted-brand/:idx/delete',
  express.urlencoded({ extended: true }),
  (req, res) => {
    const id = Number(req.params.id);
    const idx = Number(req.params.idx);
    const page = getPageById(id);
    if (!page) return res.status(404).send('Page not found');
    let content = {};
    try {
      content = JSON.parse(page.content_json || '{}');
    } catch {
      content = {};
    }
    const brands = Array.isArray(content.trusted_brands) ? content.trusted_brands : [];
    if (idx >= 0 && idx < brands.length) brands.splice(idx, 1);
    content.trusted_brands = brands;
    updatePage(id, { content_json: content });
    clearPageCache();
    res.redirect(`/admin/pages/${id}?saved=trusted-deleted`);
  }
);

function readPageContent(page) {
  try {
    return JSON.parse(page.content_json || '{}');
  } catch {
    return {};
  }
}

function builtinCategoriesFor(page) {
  try {
    const html = readSourceHtml(page);
    const $ = cheerio.load(html);
    const raw = $('#bis-data').html();
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.c) ? data.c : [];
  } catch {
    return [];
  }
}

router.post(
  '/pages/:id/catalog/category',
  express.urlencoded({ extended: true }),
  (req, res) => {
    const id = Number(req.params.id);
    const page = getPageById(id);
    if (!page) return res.status(404).send('Page not found');
    const content = readPageContent(page);
    const catalog = ensureCatalog(content);
    const name = String(req.body.category_name || '').trim();
    if (!name) return res.redirect(`/admin/pages/${id}?error=category`);
    const builtin = builtinCategoriesFor(page);
    if (!catalog.categories.includes(name) && !builtin.includes(name)) {
      catalog.categories.push(name);
    }
    content.bis_catalog = catalog;
    updatePage(id, { content_json: content });
    clearPageCache();
    res.redirect(`/admin/pages/${id}?saved=category#catalog`);
  }
);

router.post(
  '/pages/:id/catalog/product',
  express.urlencoded({ extended: true }),
  (req, res) => {
    const id = Number(req.params.id);
    const page = getPageById(id);
    if (!page) return res.status(404).send('Page not found');
    const content = readPageContent(page);
    const catalog = ensureCatalog(content);
    const b = req.body;
    const name = String(b.product_name || '').trim();
    const category = String(b.category || '').trim();
    if (!name || !category) {
      return res.redirect(`/admin/pages/${id}?error=product#catalog`);
    }
    // ensure category exists in custom list if not builtin
    const builtin = builtinCategoriesFor(page);
    if (!builtin.includes(category) && !catalog.categories.includes(category)) {
      catalog.categories.push(category);
    }
    catalog.products.unshift({
      id: `p_${Date.now()}`,
      scheme: b.scheme === 'crs' ? 'crs' : 'isi',
      category,
      name,
      standard: String(b.standard || '').trim(),
      hsn4: String(b.hsn4 || '').trim(),
      hsn8: String(b.hsn8 || '').trim(),
      status: Number(b.status || 0),
      fee_micro: Number(b.fee_micro || 0),
      fee_small: Number(b.fee_small || 0),
      fee_large: Number(b.fee_large || 0),
      test_lo: Number(b.test_lo || 0),
      test_hi: Number(b.test_hi || 0),
      labs: Number(b.labs || 0),
    });
    content.bis_catalog = catalog;
    updatePage(id, { content_json: content });
    clearPageCache();
    res.redirect(`/admin/pages/${id}?saved=product#catalog`);
  }
);

router.post(
  '/pages/:id/catalog/product/:pid/delete',
  express.urlencoded({ extended: true }),
  (req, res) => {
    const id = Number(req.params.id);
    const page = getPageById(id);
    if (!page) return res.status(404).send('Page not found');
    const content = readPageContent(page);
    const catalog = ensureCatalog(content);
    catalog.products = catalog.products.filter((p) => p.id !== req.params.pid);
    content.bis_catalog = catalog;
    updatePage(id, { content_json: content });
    clearPageCache();
    res.redirect(`/admin/pages/${id}?saved=product-deleted#catalog`);
  }
);

router.post(
  '/pages/:id/dropdown-option',
  express.urlencoded({ extended: true }),
  (req, res) => {
    const id = Number(req.params.id);
    const page = getPageById(id);
    if (!page) return res.status(404).send('Page not found');
    let roles = [];
    try {
      roles = JSON.parse(page.role_options || '[]');
    } catch {
      roles = [];
    }
    const opt = String(req.body.option_text || '').trim();
    if (opt && !roles.includes(opt)) roles.push(opt);
    updatePage(id, { role_options: roles });
    clearPageCache();
    res.redirect(`/admin/pages/${id}?saved=dropdown#dropdowns`);
  }
);

router.post('/pages/:id/delete', express.urlencoded({ extended: true }), (req, res) => {
  deletePage(Number(req.params.id));
  clearPageCache();
  res.redirect('/admin');
});

router.post('/settings', express.urlencoded({ extended: true }), (req, res) => {
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
});

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
      hero_lede: meta.hero_lede,
      form_heading: meta.form_heading,
      role_options: meta.role_options,
      content_json: meta.content_json,
      whatsapp_text: req.body.whatsapp_text || 'Hi, I need certification help.',
      hub_label: req.body.hub_label || meta.title.split('|')[0].trim(),
      hub_blurb: req.body.hub_blurb || meta.meta_description.slice(0, 140),
      hub_badge: req.body.hub_badge || 'New',
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
    <a href="/admin">Independent pages</a>
    <a href="/admin/leads">Leads</a>
    <a href="/" target="_blank" rel="noopener">Directory</a>
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
  <p>Independent landing pages — edit each URL and all words from here.</p>
  ${error ? '<p class="err">Incorrect password</p>' : ''}
  <label>Password <input type="password" name="password" autocapitalize="none" autocomplete="off" required autofocus></label>
  <button type="submit">Sign in</button>
</form>
</body></html>`;
}

function adminDashboard({ settings, pages, leads, emailOk, saved }) {
  const site = settings.site || {};
  const footer = settings.footer || {};
  const base = baseUrlOf(settings);
  return shell(
    'Independent pages',
    `
    <h1>Independent landing pages</h1>
    <p class="lede-admin">Each page stays its own landing (BIS, LMPC, MSDS, uploads). They are <strong>not merged into one page</strong>. Open any page from here. Every URL and its words are editable.</p>
    ${saved ? `<p class="ok">Saved.</p>` : ''}
    <p class="muted">Site base URL: <code>${esc(base)}</code>
      · Email: <strong>${emailOk ? 'SMTP configured' : 'SMTP not configured — leads still saved'}</strong></p>

    <section class="panel">
      <h2>All landings</h2>
      <table class="pages-table">
        <thead>
          <tr>
            <th>Landing</th>
            <th>Full URL (editable per page)</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pages
            .map((p) => {
              const pathPart = normalizePath(p.canonical_path || `/${p.slug}`);
              const live = `${base}${pathPart}`;
              return `<tr>
              <td>
                <strong>${esc(p.hub_label || p.slug)}</strong>
                <div class="muted">${esc(p.hub_badge || '')} · ${esc(p.source_type)}</div>
              </td>
              <td>
                <a class="url-link" href="${esc(pathPart)}" target="_blank" rel="noopener">${esc(live)}</a>
                <div class="muted">Path: <code>${esc(pathPart)}</code></div>
              </td>
              <td>${p.enabled ? '<span class="pill on">Live</span>' : '<span class="pill off">Hidden</span>'}</td>
              <td class="actions">
                <a class="btn" href="/admin/pages/${p.id}">Edit URL &amp; words</a>
                <a class="btn btn-ghost" href="${esc(pathPart)}" target="_blank" rel="noopener">Open page</a>
              </td>
            </tr>`;
            })
            .join('') || '<tr><td colspan="4">No pages yet</td></tr>'}
        </tbody>
      </table>
    </section>

    <section class="grid-2">
      <div class="panel">
        <h2>Add another independent HTML landing</h2>
        <p class="muted">Upload a standalone HTML file. It becomes its own URL — not merged into other pages. Forms are wired to lead capture.</p>
        <form method="post" action="/admin/upload-html" enctype="multipart/form-data" class="stack">
          <label>HTML file <input type="file" name="html" accept=".html,.htm,text/html" required></label>
          <label>URL path slug <input name="slug" placeholder="e.g. cdsco-license"></label>
          <label>Display name <input name="hub_label" placeholder="Shown in directory & admin"></label>
          <label>Short blurb <input name="hub_blurb" placeholder="One short sentence"></label>
          <label>Badge <input name="hub_badge" placeholder="e.g. New"></label>
          <button type="submit">Upload independent page</button>
        </form>
      </div>
      <div class="panel">
        <h2>Shared footer & brand</h2>
        <p class="muted">Applies across landings (phone, email, legal). Per-page words stay on each page editor.</p>
        <p><a href="#settings">Jump to site &amp; footer settings ↓</a></p>
      </div>
    </section>

    <section class="panel" id="settings">
      <h2>Site + footer settings</h2>
      <form method="post" action="/admin/settings" class="form-grid">
        <fieldset>
          <legend>Brand / directory</legend>
          <label>Brand name <input name="brandName" value="${esc(site.brandName || '')}"></label>
          <label>Tagline <input name="brandTagline" value="${esc(site.brandTagline || '')}"></label>
          <label>Base URL (used to show full page URLs) <input name="baseUrl" value="${esc(site.baseUrl || '')}"></label>
          <label>Directory eyebrow <input name="hubEyebrow" value="${esc(site.hubEyebrow || '')}"></label>
          <label>Directory title <input name="hubTitle" value="${esc(site.hubTitle || '')}"></label>
          <label>Directory description <textarea name="hubDescription" rows="3">${esc(site.hubDescription || '')}</textarea></label>
          <label>Directory support line <textarea name="hubSupport" rows="2">${esc(site.hubSupport || '')}</textarea></label>
          <label>WhatsApp number (digits) <input name="whatsappNumber" value="${esc(site.whatsappNumber || '')}"></label>
          <label>Default phone <input name="defaultPhone" value="${esc(site.defaultPhone || '')}"></label>
          <label>Default phone href <input name="defaultPhoneHref" value="${esc(site.defaultPhoneHref || '')}"></label>
          <label>Lead email <input name="leadEmail" value="${esc(site.leadEmail || '')}"></label>
          <label>Logo URL <input name="logoUrl" value="${esc(site.logoUrl || '')}"></label>
          <label>Google Ads ID <input name="googleAdsId" value="${esc(site.googleAdsId || '')}"></label>
          <label>Default robots
            <select name="robotsDefault">
              <option value="index, follow" ${site.robotsDefault === 'index, follow' ? 'selected' : ''}>index, follow</option>
              <option value="noindex, follow" ${site.robotsDefault === 'noindex, follow' ? 'selected' : ''}>noindex, follow</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Footer (shared)</legend>
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
        <thead><tr><th>When</th><th>IP</th><th>Page</th><th>Name</th><th>Phone</th><th>Emailed</th></tr></thead>
        <tbody>
          ${leads
            .slice(0, 8)
            .map(
              (l) => `<tr>
            <td>${esc(l.created_at)}</td>
            <td><code>${esc(l.ip || '-')}</code></td>
            <td>${esc(l.page_slug)}</td>
            <td>${esc(l.name)}</td>
            <td>${esc((l.country_code || '') + ' ' + (l.phone || ''))}</td>
            <td>${l.email_sent ? 'Yes' : 'No'}</td>
          </tr>`
            )
            .join('') || '<tr><td colspan="6">No leads yet</td></tr>'}
        </tbody>
      </table>
    </section>
  `
  );
}

function pageEditor({ page, settings, saved, reloaded }) {
  let roles = [];
  try {
    roles = JSON.parse(page.role_options || '[]');
  } catch {
    roles = [];
  }
  let content = {};
  try {
    content = JSON.parse(page.content_json || '{}');
  } catch {
    content = {};
  }
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const catalog = ensureCatalog(content);
  const heroStats = normalizeHeroStats(content);
  const builtinCats = builtinCategoriesFor(page);
  const allCategories = [...builtinCats];
  for (const c of catalog.categories) {
    if (!allCategories.includes(c)) allCategories.push(c);
  }
  const base = baseUrlOf(settings);
  const pathPart = normalizePath(page.canonical_path || `/${page.slug}`);
  const live = `${base}${pathPart}`;
  const isBis =
    page.slug === 'bis-certification' ||
    page.source_file === 'bis-certification.html' ||
    builtinCats.length > 0;

  return shell(
    `Edit ${page.slug}`,
    `
    <p><a href="/admin">← All independent pages</a></p>
    <h1>Edit landing · ${esc(page.hub_label || page.slug)}</h1>
    ${saved ? `<p class="ok">Saved — URL and words updated.</p>` : ''}
    ${reloaded ? `<p class="ok">Words reloaded from the HTML file.</p>` : ''}

    <div class="url-banner">
      <div>
        <div class="muted">Full live URL</div>
        <a class="url-link big" href="${esc(pathPart)}" target="_blank" rel="noopener">${esc(live)}</a>
      </div>
      <a class="btn" href="${esc(pathPart)}" target="_blank" rel="noopener">Open this page</a>
    </div>
    <p class="muted">Source file: <code>${esc(page.source_type)} / ${esc(page.source_file)}</code> · This landing stays independent of the others.</p>

    <form method="post" action="/admin/pages/${page.id}" class="form-grid" id="page-main-form">
      <fieldset>
        <legend>1 · Editable URL</legend>
        <label>URL path (change this to change the page address)
          <input name="canonical_path" id="canonical_path" value="${esc(pathPart)}" required>
        </label>
        <label>Slug (used internally; usually matches path without /)
          <input name="slug" id="slug" value="${esc(page.slug)}" required>
        </label>
        <p class="muted">Preview: <code>${esc(base)}</code><strong id="url-preview">${esc(pathPart)}</strong></p>
        <label>Enabled
          <select name="enabled">
            <option value="1" ${page.enabled ? 'selected' : ''}>Live — publicly reachable</option>
            <option value="0" ${!page.enabled ? 'selected' : ''}>Hidden</option>
          </select>
        </label>
        <label>Sort order in directory <input type="number" name="sort_order" value="${esc(page.sort_order)}"></label>
        <label>Robots
          <select name="robots">
            <option value="index, follow" ${page.robots === 'index, follow' ? 'selected' : ''}>index, follow</option>
            <option value="noindex, follow" ${page.robots === 'noindex, follow' ? 'selected' : ''}>noindex, follow</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>2 · SEO words</legend>
        <label>Browser title <input name="title" value="${esc(page.title)}"></label>
        <label>Meta description <textarea name="meta_description" rows="3">${esc(page.meta_description)}</textarea></label>
        <label>OG title <input name="og_title" value="${esc(page.og_title)}"></label>
        <label>OG description <textarea name="og_description" rows="2">${esc(page.og_description)}</textarea></label>
      </fieldset>

      <fieldset class="hero-editor">
        <legend>3 · Hero banner word editor (all words)</legend>
        <p class="muted">Edit every word on the hero/banner side. Uses the full editor width so nothing is cramped.</p>
        <div class="hero-grid">
          <div>
            <h3 class="subhead">Banner flag</h3>
            <label>Flag text <input name="flag_prefix" value="${esc(content.flag_prefix || '')}" placeholder="Goods held at customs?"></label>
            <label>Flag bold <input name="flag_bold" value="${esc(content.flag_bold || '')}" placeholder="Call, don't fill a form"></label>
            <h3 class="subhead">Headline</h3>
            <label>H1 main <textarea name="h1_main" rows="2">${esc(content.h1_main || page.hero_h1 || '')}</textarea></label>
            <label>H1 emphasis (em) <input name="h1_em" value="${esc(content.h1_em || '')}" placeholder="— ISI, CRS, FMCS & Scheme X."></label>
            <label>Hero paragraph <textarea name="hero_sub" rows="5">${esc(content.hero_sub || page.hero_lede || '')}</textarea></label>
            <label>Directory label <input name="hub_label" value="${esc(page.hub_label)}"></label>
            <label>Directory badge <input name="hub_badge" value="${esc(page.hub_badge)}"></label>
            <label>Directory blurb <textarea name="hub_blurb" rows="2">${esc(page.hub_blurb)}</textarea></label>
          </div>
          <div>
            <h3 class="subhead">Buttons</h3>
            <label>Primary CTA text <input name="cta_primary" value="${esc(content.cta_primary || '')}"></label>
            <label>Primary CTA link <input name="cta_primary_href" value="${esc(content.cta_primary_href || '')}"></label>
            <label>Secondary CTA text <input name="cta_secondary" value="${esc(content.cta_secondary || '')}"></label>
            <label>Secondary CTA link <input name="cta_secondary_href" value="${esc(content.cta_secondary_href || '')}"></label>
            <h3 class="subhead">Form card words</h3>
            <label>Form heading <input name="form_heading" value="${esc(content.form_heading || page.form_heading || '')}"></label>
            <label>Form subtext <textarea name="form_sub" rows="3">${esc(content.form_sub || '')}</textarea></label>
            <label>Phone on this page <input name="phone" value="${esc(page.phone)}"></label>
            <label>WhatsApp prefill text <input name="whatsapp_text" value="${esc(page.whatsapp_text)}"></label>
          </div>
        </div>
        <h3 class="subhead" id="dropdowns">Form dropdown options (add more anytime)</h3>
        <p class="muted">These power the role / category dropdown on the contact form. Add one option at a time or edit the full list.</p>
        <div class="option-list">
          ${roles.map((r) => `<span class="pill on">${esc(r)}</span>`).join(' ') || '<span class="muted">No options yet</span>'}
        </div>
        <label>Full dropdown list (one per line)
          <textarea name="role_options" rows="6">${esc(roles.join('\n'))}</textarea>
        </label>
        <h3 class="subhead">Hero tick points</h3>
        <div class="ticks-grid">
          ${(content.ticks && content.ticks.length
            ? content.ticks
            : [{ bold: '', rest: '' }, { bold: '', rest: '' }, { bold: '', rest: '' }]
          )
            .map(
              (t, i) => `<div class="tick-card">
              <label>Tick ${i + 1} bold <input name="tick_bold_${i}" value="${esc(t.bold || '')}"></label>
              <label>Tick ${i + 1} rest <input name="tick_rest_${i}" value="${esc(t.rest || '')}"></label>
            </div>`
            )
            .join('')}
        </div>
      </fieldset>

      ${
        isBis
          ? `<fieldset>
        <legend>BIS · Consulting Starts At (editable price)</legend>
        <p class="muted">Shown in the product checker and hero. Label defaults to “Consulting Starts At”.</p>
        <label>Price label <input name="consulting_label" value="${esc(content.consulting_label || 'Consulting Starts At')}"></label>
        <label>CRS consulting price (₹) <input name="consulting_price_crs" type="number" min="0" step="1" value="${esc(content.consulting_price_crs ?? 9999)}"></label>
        <label>ISI Mark consulting price (₹) <input name="consulting_price_isi" type="number" min="0" step="1" value="${esc(content.consulting_price_isi ?? 20999)}"></label>
      </fieldset>`
          : ''
      }

      <fieldset>
        <legend>4 · Section headings (every front-end H2)</legend>
        ${
          sections.length
            ? sections
                .map((s, i) => {
                  const idx = String(s.key || `h2_${i}`).replace('h2_', '');
                  return `<label>${esc(s.label || `Section ${Number(idx) + 1}`)}
                    <input type="hidden" name="section_label_${esc(idx)}" value="${esc(s.label || '')}">
                    <textarea name="section_${esc(idx)}" rows="2">${esc(s.text || '')}</textarea>
                  </label>`;
                })
                .join('')
            : `<p class="muted">No section headings loaded yet. Click “Reload words from HTML” below.</p>`
        }
      </fieldset>

      <fieldset>
        <legend>5 · Trusted by label</legend>
        <label>Trusted by heading <input name="trusted_label" value="${esc(content.trusted_label || '')}" placeholder="Trusted by Indian and overseas manufacturers"></label>
      </fieldset>

      <button type="submit">Save URL &amp; all words</button>
    </form>

    <section class="panel" id="hero-stats">
      <h2>Hero stats (below headline)</h2>
      <p class="muted">Shown under the hero copy on this landing: Happy Customers, Expert Advisors, Branch Offices. Change numbers, labels, and icons (PNG/WebP) for each.</p>
      <div class="stats-admin-grid">
        ${heroStats
          .map(
            (s) => `<div class="stat-admin-card">
            <div class="stat-admin-preview">
              ${
                s.iconUrl
                  ? `<img src="${esc(s.iconUrl)}" alt="">`
                  : `<span class="muted">Default icon</span>`
              }
            </div>
            <label>Number / value
              <input form="page-main-form" name="stat_value_${esc(s.key)}" value="${esc(s.value)}">
            </label>
            <label>Label
              <input form="page-main-form" name="stat_label_${esc(s.key)}" value="${esc(s.label)}">
            </label>
            <form method="post" action="/admin/pages/${page.id}/stat-icon/${esc(s.key)}" enctype="multipart/form-data" class="stack">
              <label>Change icon (PNG / WebP)
                <input type="file" name="icon" accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg" required>
              </label>
              <button type="submit">Upload ${esc(s.label)} icon</button>
            </form>
          </div>`
          )
          .join('')}
      </div>
      <p class="muted" style="margin-top:12px">Tip: save the main “Save URL &amp; all words” form after editing numbers/labels. Icons upload immediately.</p>
      <label style="display:flex;flex-direction:row;align-items:center;gap:8px;margin-top:8px">
        <input form="page-main-form" type="checkbox" name="hero_stats_enabled" value="1" ${
          content.hero_stats_enabled === false ? '' : 'checked'
        }>
        Show hero stats on this landing
      </label>
      <input form="page-main-form" type="hidden" name="hero_stats_enabled_present" value="1">
    </section>

    <section class="panel media-panel">
      <h2>Trusted by brands (single upload area)</h2>
      <p class="muted">Add brand logos here. They replace the Trusted by marquee on this landing.</p>
      <div class="brand-grid">
        ${(Array.isArray(content.trusted_brands) ? content.trusted_brands : [])
          .map(
            (b, i) => `<div class="brand-card">
            <img src="${esc(b.imageUrl)}" alt="${esc(b.name || '')}">
            <div><strong>${esc(b.name || 'Brand')}</strong>
              <form method="post" action="/admin/pages/${page.id}/trusted-brand/${i}/delete">
                <button type="submit" class="danger">Remove</button>
              </form>
            </div>
          </div>`
          )
          .join('') || '<p class="muted">No brands uploaded yet — add the first logo below.</p>'}
      </div>
      <form method="post" action="/admin/pages/${page.id}/trusted-brand" enctype="multipart/form-data" class="stack" style="margin-top:14px">
        <label>Brand name <input name="brand_name" placeholder="e.g. Acme Industries" required></label>
        <label>Logo (PNG / WebP) <input type="file" name="logo" accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg" required></label>
        <button type="submit">Add trusted brand</button>
      </form>
    </section>

    <section class="panel" id="quick-dropdown">
      <h2>Quick add — form dropdown option</h2>
      <p class="muted">Add one more choice to the contact-form dropdown without editing the full list.</p>
      <form method="post" action="/admin/pages/${page.id}/dropdown-option" class="inline-add">
        <input name="option_text" placeholder="New dropdown option…" required>
        <button type="submit">Add to dropdown</button>
      </form>
    </section>

    ${
      isBis
        ? `<section class="panel" id="catalog">
      <h2>BIS products by category (checker dropdown / search)</h2>
      <p class="muted">Add more products into any category. They appear in the BIS product checker search on the front end.</p>

      <div class="catalog-layout">
        <div>
          <h3 class="subhead">Categories</h3>
          <div class="option-list">
            ${allCategories.map((c) => `<span class="pill ${catalog.categories.includes(c) ? 'on' : ''}">${esc(c)}${catalog.categories.includes(c) ? ' · custom' : ''}</span>`).join(' ')}
          </div>
          <form method="post" action="/admin/pages/${page.id}/catalog/category" class="inline-add" style="margin-top:12px">
            <input name="category_name" placeholder="New category name…" required>
            <button type="submit">Add category</button>
          </form>
        </div>
        <div>
          <h3 class="subhead">Add product into a category</h3>
          <form method="post" action="/admin/pages/${page.id}/catalog/product" class="stack">
            <label>Category
              <select name="category" required>
                <option value="">Select category…</option>
                ${allCategories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select>
            </label>
            <label>Scheme
              <select name="scheme">
                <option value="isi">ISI Mark</option>
                <option value="crs">CRS (electronics)</option>
              </select>
            </label>
            <label>Product name <input name="product_name" required placeholder="e.g. LED Panel Lights"></label>
            <label>IS / standard <input name="standard" placeholder="e.g. IS 10322"></label>
            <label>HSN (4 digit) <input name="hsn4" placeholder="9405"></label>
            <label>HSN (8 digit) <input name="hsn8" placeholder="94054090"></label>
            <label>QCO status (ISI)
              <select name="status">
                <option value="0">Mandatory — QCO in force</option>
                <option value="1">Mandatory — phased</option>
                <option value="2">Notified — verify</option>
                <option value="4">No QCO traced — ISI voluntary</option>
              </select>
            </label>
            <button type="submit">Add product to category</button>
          </form>
        </div>
      </div>

      <h3 class="subhead">Custom products added from backend</h3>
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Scheme</th><th>Standard</th><th></th></tr></thead>
        <tbody>
          ${
            catalog.products.length
              ? catalog.products
                  .map(
                    (p) => `<tr>
              <td><strong>${esc(p.name)}</strong></td>
              <td>${esc(p.category)}</td>
              <td>${esc((p.scheme || 'isi').toUpperCase())}</td>
              <td>${esc(p.standard || '')}</td>
              <td>
                <form method="post" action="/admin/pages/${page.id}/catalog/product/${esc(p.id)}/delete">
                  <button type="submit" class="danger">Remove</button>
                </form>
              </td>
            </tr>`
                  )
                  .join('')
              : '<tr><td colspan="5">No custom products yet — add one above.</td></tr>'
          }
        </tbody>
      </table>
    </section>`
        : ''
    }

    <form method="post" action="/admin/pages/${page.id}/reload-words" style="margin-top:18px">
      <button type="submit" class="btn-ghost">Reload words from HTML file</button>
      <span class="muted">Pulls hero words, section headings and trusted label from the source landing HTML (keeps uploaded brands & hero image).</span>
    </form>

    <form method="post" action="/admin/pages/${page.id}/delete" onsubmit="return confirm('Delete this independent page entry? HTML file is kept on disk.')" style="margin-top:24px">
      <button type="submit" class="danger">Delete page entry</button>
    </form>

    <script>
    (function(){
      var pathInput = document.getElementById('canonical_path');
      var slugInput = document.getElementById('slug');
      var preview = document.getElementById('url-preview');
      function sync(){
        var p = pathInput.value.trim();
        if (p && p.charAt(0) !== '/') p = '/' + p;
        pathInput.value = p;
        preview.textContent = p;
        var slug = p.replace(/^\\/+/, '').replace(/\\/+$/, '');
        if (slug && document.activeElement === pathInput) slugInput.value = slug;
      }
      pathInput.addEventListener('input', sync);
    })();
    </script>
  `
  );
}

function leadsPage(leads) {
  return shell(
    'Leads',
    `
    <h1>Leads</h1>
    <p class="muted">Every form submission stores the visitor <strong>IP address</strong> and <strong>time (IST)</strong>, and emails them to contact@instacertify.com when SMTP is configured.</p>
    <table>
      <thead>
        <tr><th>ID</th><th>Time (IST)</th><th>IP address</th><th>Page</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Product</th><th>Mail</th></tr>
      </thead>
      <tbody>
        ${
          leads
            .map(
              (l) => `<tr>
          <td>${l.id}</td>
          <td>${esc(l.created_at)}</td>
          <td><code>${esc(l.ip || '-')}</code></td>
          <td>${esc(l.page_slug)}</td>
          <td>${esc(l.name)}</td>
          <td>${esc(l.email)}</td>
          <td>${esc((l.country_code || '') + ' ' + (l.phone || ''))}</td>
          <td>${esc(l.role)}</td>
          <td>${esc(l.product)}</td>
          <td title="${esc(l.email_error || '')}">${l.email_sent ? 'Sent' : 'Pending/fail'}</td>
        </tr>`
            )
            .join('') || '<tr><td colspan="10">No leads yet</td></tr>'
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
