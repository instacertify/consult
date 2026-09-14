const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { getSetting } = require('../db');

const PAGES_DIR = path.join(__dirname, '..', '..', 'content', 'pages');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'content', 'uploads');

const cache = new Map();

function clearPageCache(slug) {
  if (slug) cache.delete(slug);
  else cache.clear();
}

function resolveSourcePath(page) {
  if (page.source_type === 'upload') {
    return path.join(UPLOADS_DIR, page.source_file);
  }
  return path.join(PAGES_DIR, page.source_file);
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function buildWhatsAppHref(number, text) {
  const n = digitsOnly(number) || '919999118039';
  const q = encodeURIComponent(text || 'Hi, I need certification help.');
  return `https://wa.me/${n}?text=${q}`;
}

function phoneHrefFromDisplay(phone, fallback) {
  const d = digitsOnly(phone);
  if (!d) return fallback || 'tel:+919999118039';
  return d.startsWith('91') && d.length >= 12 ? `tel:+${d}` : `tel:+${d}`;
}

/**
 * Adapt a stored HTML landing page with CMS settings.
 * Fast path: memory cache keyed by slug + updated_at + settings version.
 */
function adaptPageHtml(page, options = {}) {
  const site = getSetting('site', {});
  const footer = getSetting('footer', {});
  const cacheKey = `${page.slug}::${page.updated_at}::${site.baseUrl || ''}::${footer.email || ''}`;
  if (!options.bypassCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const filePath = resolveSourcePath(page);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Page source missing: ${page.source_file}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(raw, { decodeEntities: false });

  const baseUrl = (site.baseUrl || 'https://consult.instacertify.com').replace(/\/$/, '');
  const canonicalPath = page.canonical_path || `/${page.slug}`;
  const phoneDisplay = page.phone || footer.phone || site.defaultPhone || '+91 99991 18039';
  const phoneHref =
    footer.phoneHref ||
    site.defaultPhoneHref ||
    phoneHrefFromDisplay(phoneDisplay);
  const waHref = buildWhatsAppHref(
    site.whatsappNumber || digitsOnly(phoneDisplay),
    page.whatsapp_text
  );

  // SEO
  if (page.title) $('title').text(page.title);
  setOrCreateMeta($, 'name', 'description', page.meta_description || '');
  setOrCreateMeta($, 'name', 'robots', page.robots || site.robotsDefault || 'index, follow');
  setOrCreateMeta($, 'property', 'og:title', page.og_title || page.title || '');
  setOrCreateMeta(
    $,
    'property',
    'og:description',
    page.og_description || page.meta_description || ''
  );
  setOrCreateMeta($, 'property', 'og:url', `${baseUrl}${canonicalPath}`);
  setOrCreateMeta($, 'property', 'og:type', 'website');

  let canonical = $('link[rel="canonical"]');
  if (!canonical.length) {
    $('head').append(`<link rel="canonical" href="${baseUrl}${canonicalPath}">`);
  } else {
    canonical.attr('href', `${baseUrl}${canonicalPath}`);
  }

  // Hero H1
  if (page.hero_h1) {
    const h1 = $('h1').first();
    if (h1.length) h1.text(page.hero_h1);
  }

  // Form heading
  if (page.form_heading) {
    const fh = $('.formcard h2, .formcard .formcard__title, #apply h2').first();
    if (fh.length) fh.text(page.form_heading);
    else {
      const nearby = $('form').first().closest('aside, section, div').find('h2').first();
      if (nearby.length) nearby.text(page.form_heading);
    }
  }

  // Role dropdown options from CMS
  let roleOptions = [];
  try {
    roleOptions = JSON.parse(page.role_options || '[]');
  } catch {
    roleOptions = [];
  }
  const roleSelect = $('select[name="role"], #f-role');
  if (roleSelect.length && roleOptions.length) {
    roleSelect.empty();
    roleSelect.append('<option value="">Select one</option>');
    for (const opt of roleOptions) {
      const val = String(opt).replace(/"/g, '&quot;');
      roleSelect.append(`<option value="${val}">${opt}</option>`);
    }
  }

  // Rewrite form action → unified lead API, keep page context
  $('form').each((_, el) => {
    const $form = $(el);
    $form.attr('method', 'post');
    $form.attr('action', '/api/leads');
    $form.attr('data-adapted', '1');
    if (!$form.find('input[name="page_slug"]').length) {
      $form.prepend(
        `<input type="hidden" name="page_slug" value="${page.slug}">`
      );
    } else {
      $form.find('input[name="page_slug"]').attr('value', page.slug);
    }
  });

  // Phone / WhatsApp / mailto rewrites
  $('a[href^="tel:"]').attr('href', phoneHref);
  $('a[href*="wa.me"]').attr('href', waHref);
  $('a[href^="mailto:contact@"]').attr(
    'href',
    `mailto:${footer.email || site.leadEmail || 'contact@instacertify.com'}`
  );

  // Footer text blocks (best-effort on class .ftr)
  const $ftr = $('footer.ftr, footer');
  if ($ftr.length) {
    const company = footer.company || 'Instacertify Labs Private Limited';
    const address = footer.address || '';
    const cin = footer.cin || '';
    const email = footer.email || 'contact@instacertify.com';
    const legal = footer.legal || '';

    // Update first strong / brand-ish blocks carefully via known structure
    $ftr.find('a[href^="mailto:"]').first().text(email).attr('href', `mailto:${email}`);
    $ftr.find('a[href^="tel:"]').first().text(phoneDisplay).attr('href', phoneHref);

    if (legal) {
      const $legal = $ftr.find('.ftr__legal');
      if ($legal.length) $legal.text(legal);
    }

    // Inject CMS marker for debugging
    if (!$ftr.attr('data-cms-footer')) {
      $ftr.attr('data-cms-footer', '1');
      $ftr.attr('data-company', company);
    }

    // Soft-replace address line if present
    if (address) {
      $ftr.find('*').each((_, node) => {
        const $n = $(node);
        if ($n.children().length) return;
        const t = ($n.text() || '').trim();
        if (/Sector 63A|Noida/i.test(t) && t.length < 120) {
          $n.text(address + (cin ? ` ${cin}` : ''));
        }
      });
    }
  }

  // Hub / path chooser link in header
  const $logo = $('.hdr__logo').first();
  if ($logo.length) {
    $logo.attr('href', '/');
    $logo.attr('title', 'Instacertify Consult — choose a path');
  }
  if (site.logoUrl) {
    const $img = $('.hdr__logo img').first();
    if ($img.length) $img.attr('src', site.logoUrl);
  }

  // Inject lightweight path switcher into header CTA
  const $cta = $('.hdr__cta').first();
  if ($cta.length && !$cta.find('.path-switch').length) {
    $cta.prepend(`
      <a class="path-switch" href="/#paths" style="font-size:13px;font-weight:600;color:var(--navy-2);text-decoration:none;margin-right:6px">
        All paths
      </a>
    `);
  }

  // Enhance form submit with fetch (progressive) — inject once
  if (!$('script[data-lead-enhancer]').length) {
    $('body').append(`
<script data-lead-enhancer="1">
(function(){
  document.querySelectorAll('form[data-adapted="1"]').forEach(function(form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      if (btn) { btn.disabled = true; btn.dataset._t = btn.textContent; btn.textContent = 'Sending…'; }
      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function(v,k){ payload[k] = v; });
      payload.consent = form.querySelector('[name="consent"]')
        ? (form.querySelector('[name="consent"]').checked ? '1' : '0') : '0';
      fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
        .then(function(res){
          if (res.ok) {
            form.innerHTML = '<div style="padding:18px;border-radius:12px;background:#E6F5EF;color:#12805C;font-weight:600">Thanks — we received your details. Our team will contact you shortly.</div>';
          } else {
            alert((res.j && res.j.error) || 'Could not send. Please call us.');
            if (btn) { btn.disabled = false; btn.textContent = btn.dataset._t || 'Submit'; }
          }
        }).catch(function(){
          alert('Network error. Please call +91 99991 18039.');
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset._t || 'Submit'; }
        });
    });
  });
})();
</script>`);
  }

  const html = $.html();
  cache.set(cacheKey, html);
  // Cap cache size
  if (cache.size > 40) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  return html;
}

function setOrCreateMeta($, attr, key, content) {
  if (!content && content !== '') return;
  const sel =
    attr === 'property'
      ? `meta[property="${key}"]`
      : `meta[name="${key}"]`;
  const existing = $(sel).first();
  if (existing.length) existing.attr('content', content);
  else $('head').append(`<meta ${attr}="${key}" content="${escapeAttr(content)}">`);
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Parse an uploaded HTML file into CMS page fields.
 */
function extractPageMetaFromHtml(html, fallbackSlug) {
  const $ = cheerio.load(html);
  const title = ($('title').text() || fallbackSlug || 'Untitled').trim();
  const meta_description =
    $('meta[name="description"]').attr('content') || '';
  const robots = $('meta[name="robots"]').attr('content') || 'index, follow';
  const og_title = $('meta[property="og:title"]').attr('content') || title;
  const og_description =
    $('meta[property="og:description"]').attr('content') || meta_description;
  const hero_h1 = ($('h1').first().text() || '').trim();
  const form_heading = (
    $('.formcard h2').first().text() ||
    $('form').closest('aside,section,div').find('h2').first().text() ||
    ''
  ).trim();

  const role_options = [];
  $('select[name="role"] option, #f-role option').each((_, el) => {
    const v = ($(el).attr('value') || $(el).text() || '').trim();
    if (v && !/^select/i.test(v)) role_options.push($(el).text().trim() || v);
  });

  return {
    title,
    meta_description,
    robots: /noindex/i.test(robots) ? 'index, follow' : robots,
    og_title,
    og_description,
    hero_h1,
    form_heading,
    role_options,
  };
}

module.exports = {
  adaptPageHtml,
  clearPageCache,
  extractPageMetaFromHtml,
  resolveSourcePath,
  PAGES_DIR,
  UPLOADS_DIR,
};
