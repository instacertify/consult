const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const session = require('express-session');
require('dotenv').config();

const { getDb, getSetting } = require('./db');
const { listPages, getPageBySlug } = require('./services/pages');
const { adaptPageHtml } = require('./services/htmlAdapter');
const { injectTrackingIntoHtml } = require('./services/trackingTags');
const { router: leadsRouter, handleLead } = require('./routes/leads');
const adminRouter = require('./routes/admin');
const { SqliteSessionStore } = require('./services/sessionStore');
const { syncAdminAuthFromEnv, getAdminUsername } = require('./services/adminAuth');

// Ensure DB + seed defaults on boot if empty
getDb();
try {
  const { seed } = require('../scripts/seed');
  seed();
} catch (e) {
  console.warn('Seed note:', e.message);
}
try {
  syncAdminAuthFromEnv();
  console.log('Admin login user:', getAdminUsername());
} catch (e) {
  console.warn('Admin auth sync note:', e.message);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
// Secure cookies only in production HTTPS (override with COOKIE_SECURE=true|false)
const cookieSecure =
  process.env.COOKIE_SECURE === 'true'
    ? true
    : process.env.COOKIE_SECURE === 'false'
      ? false
      : process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(
  session({
    name: 'ic_admin',
    secret: process.env.SESSION_SECRET || 'dev-consult-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store: new SqliteSessionStore(),
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Admin before static so /admin is never shadowed by a public folder
app.use('/admin', adminRouter);

app.use(
  '/css',
  express.static(path.join(__dirname, '..', 'public', 'css'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true,
  })
);
app.use(
  '/js',
  express.static(path.join(__dirname, '..', 'public', 'js'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true,
  })
);
app.use(
  '/img',
  express.static(path.join(__dirname, '..', 'public', 'img'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true,
  })
);
app.use(
  '/media',
  express.static(path.join(__dirname, '..', 'content', 'uploads', 'media'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true,
  })
);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/robots.txt', (_req, res) => {
  const site = getSetting('site', {});
  const base = (site.baseUrl || 'https://consult.instacertify.com').replace(/\/$/, '');
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${base}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (_req, res) => {
  const site = getSetting('site', {});
  const base = (site.baseUrl || 'https://consult.instacertify.com').replace(/\/$/, '');
  const pages = listPages({ enabledOnly: true });
  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    ...pages.map((p) => ({
      loc: `${base}${p.canonical_path || '/' + p.slug}`,
      priority: '0.9',
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url><loc>${u.loc}</loc><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`
  )
  .join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

// Hub — customer path chooser
app.get('/', (_req, res) => {
  res.type('html').send(renderHub());
});

app.get('/building', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'building.html'));
});

function renderHub() {
  const site = getSetting('site', {});
  const footer = getSetting('footer', {});
  const pages = listPages({ enabledOnly: true });
  const base = (site.baseUrl || 'https://consult.instacertify.com').replace(/\/$/, '');

  const options = pages
    .map(
      (p) =>
        `<option value="${escapeHtml(p.canonical_path || '/' + p.slug)}">${escapeHtml(
          p.hub_label || p.slug
        )}</option>`
    )
    .join('');

  const cards = pages
    .map((p, i) => {
      const badge = String(p.hub_badge || '').trim();
      const blurb = String(p.hub_blurb || '').trim();
      return `
    <a class="path" href="${escapeHtml(p.canonical_path || '/' + p.slug)}" style="--d:${0.08 * i}s">
      ${badge ? `<span class="path__badge">${escapeHtml(badge)}</span>` : ''}
      <h2>${escapeHtml(p.hub_label || p.slug)}</h2>
      ${blurb ? `<p>${escapeHtml(blurb)}</p>` : ''}
      <span class="path__cta">Continue →</span>
    </a>`;
    })
    .join('');

  const hubDesc = String(site.hubDescription || '').trim();
  const hubSupport = String(site.hubSupport || '').trim();

  return injectTrackingIntoHtml(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(site.brandName || 'Instacertify')} Consult — ${escapeHtml(site.hubTitle || 'Choose your certification path')}</title>
<meta name="description" content="${escapeHtml(hubDesc)}">
<link rel="canonical" href="${base}/">
<meta name="robots" content="${escapeHtml(site.robotsDefault || 'index, follow')}">
<meta property="og:title" content="${escapeHtml(site.brandName || 'Instacertify')} — ${escapeHtml(site.hubTitle || '')}">
<meta property="og:description" content="${escapeHtml(hubDesc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${base}/">
<meta name="theme-color" content="#0A3A52">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/hub.css">
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: site.brandName || 'Instacertify',
  url: base,
  email: footer.email || 'contact@instacertify.com',
  telephone: footer.phone || site.defaultPhone,
  address: footer.address,
})}
</script>
</head>
<body>
  <header class="top">
    <div class="top__in">
      <a class="logo" href="/">${site.logoUrl ? `<img src="${escapeHtml(site.logoUrl)}" alt="${escapeHtml(site.brandName || 'Instacertify')}" style="height:36px;width:auto;display:block">` : `${escapeHtml(site.brandName || 'Instacertify')}<span>Consult</span>`}</a>
      <a class="call" href="${escapeHtml(footer.phoneHref || site.defaultPhoneHref || 'tel:+919999118039')}">${escapeHtml(footer.phone || site.defaultPhone || 'Call')}</a>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="hero__glow" aria-hidden="true"></div>
      <p class="eyebrow">${escapeHtml(site.hubEyebrow || 'Instacertify Consult')}</p>
      <h1>${escapeHtml(site.brandName || 'Instacertify')}</h1>
      <p class="lede">${escapeHtml(site.hubTitle || 'Choose your certification path')}</p>
      ${hubDesc ? `<p class="sub">${escapeHtml(hubDesc)}</p>` : ''}

      <form class="chooser" id="path-form" action="#" method="get">
        <label for="path-select">I need help with</label>
        <div class="chooser__row">
          <select id="path-select" name="path" required>
            <option value="">Select a certification path…</option>
            ${options}
          </select>
          <button type="submit">Go</button>
        </div>
      </form>
    </section>

    <section class="paths" id="paths">
      <h2 class="sr">Available paths</h2>
      <div class="paths__grid" data-count="${pages.length}">${cards}</div>
      ${
        hubSupport
          ? `<p class="support">${escapeHtml(hubSupport)}
        <a href="${escapeHtml(footer.phoneHref || 'tel:+919999118039')}">${escapeHtml(footer.phone || '+91 99991 18039')}</a>
      </p>`
          : ''
      }
    </section>
  </main>

  <footer class="foot">
    <div class="foot__in">
      <strong>${escapeHtml(footer.company || 'Instacertify Labs Private Limited')}</strong>
      <p>${escapeHtml(footer.address || '')} ${escapeHtml(footer.cin || '')}</p>
      <p><a href="${escapeHtml(footer.phoneHref || 'tel:+919999118039')}">${escapeHtml(footer.phone || '')}</a>
        · <a href="mailto:${escapeHtml(footer.email || 'contact@instacertify.com')}">${escapeHtml(footer.email || 'contact@instacertify.com')}</a></p>
      <p class="legal">${escapeHtml(footer.legal || '')}</p>
    </div>
  </footer>
  <script src="/js/hub.js" defer></script>
</body>
</html>`, site);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendAdaptedPage(req, res, page) {
  if (!page || !page.enabled) {
    return res.status(404).type('html').send(notFound());
  }
  try {
    const html = adaptPageHtml(page);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.type('html').send(html);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Page unavailable');
  }
}

function notFound() {
  return `<!DOCTYPE html><html><head><title>Not found</title><link rel="stylesheet" href="/css/hub.css"></head>
  <body style="padding:48px;font-family:Poppins,sans-serif"><h1>Page not found</h1><p><a href="/">Back to path chooser</a></p></body></html>`;
}

// Lead APIs
app.use('/api', leadsRouter);
app.post('/bis-submit', (req, res) => handleLead(req, res, 'bis-certification'));
app.post('/lmpc-submit', (req, res) => handleLead(req, res, 'lmpc-certificate'));
app.post('/msds-submit', (req, res) => handleLead(req, res, 'msds-certificate'));

// Dynamic pages by slug (seed + uploaded)
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug;
  if (slug === 'admin' || slug === 'api' || slug === 'css' || slug === 'js') return next();
  const page = getPageBySlug(slug);
  if (!page) return next();
  return sendAdaptedPage(req, res, page);
});

// Alias: /p/:slug
app.get('/p/:slug', (req, res) => {
  const page = getPageBySlug(req.params.slug);
  return sendAdaptedPage(req, res, page);
});

app.use((req, res) => {
  res.status(404).type('html').send(notFound());
});

app.listen(PORT, () => {
  console.log(`Instacertify Consult listening on http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
