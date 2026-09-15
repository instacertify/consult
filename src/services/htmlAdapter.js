const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { getSetting } = require('../db');
const {
  extractHeroContent,
  applyHeroContent,
  applyTrustedBy,
  applyAboutBisSection,
  applySchemeVisuals,
} = require('./contentEditor');
const { applyBisCatalog } = require('./bisCatalog');
const { applyTrackingTags } = require('./trackingTags');

const PAGES_DIR = path.join(__dirname, '..', '..', 'content', 'pages');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'content', 'uploads');

const cache = new Map();

function clearPageCache(slug) {
  if (slug) {
    for (const key of [...cache.keys()]) {
      if (key.startsWith(`${slug}::`)) cache.delete(key);
    }
  } else cache.clear();
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

function parseContentJson(page) {
  try {
    return typeof page.content_json === 'string'
      ? JSON.parse(page.content_json || '{}')
      : page.content_json || {};
  } catch {
    return {};
  }
}

/**
 * Extract editable words from a standalone landing HTML (independent page).
 */
function extractEditableWords(html) {
  const $ = cheerio.load(html);
  const hero = $('.hero').first();
  const heroPs = [];
  if (hero.length) {
    hero.find('p').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t) heroPs.push(t);
    });
  }

  const sections = [];
  $('h2').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    sections.push({
      key: `h2_${i}`,
      label: `Section heading ${i + 1}`,
      text,
    });
  });

  const role_options = [];
  $('select[name="role"] option, #f-role option').each((_, el) => {
    const label = ($(el).text() || '').trim();
    const v = ($(el).attr('value') || label).trim();
    if (v && !/^select/i.test(label)) role_options.push(label || v);
  });

  return {
    hero_lede: heroPs[0] || '',
    hero_support: heroPs[1] || '',
    form_heading: (
      $('.formcard h2').first().text() ||
      $('form').closest('aside,section,div').find('h2').first().text() ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim(),
    sections,
    role_options,
  };
}

function extractPageMetaFromHtml(html, fallbackSlug) {
  const $ = cheerio.load(html);
  const words = extractEditableWords(html);
  const hero = extractHeroContent(html);
  const title = ($('title').text() || fallbackSlug || 'Untitled').trim();
  const meta_description =
    $('meta[name="description"]').attr('content') || '';
  const robots = $('meta[name="robots"]').attr('content') || 'index, follow';
  const og_title = $('meta[property="og:title"]').attr('content') || title;
  const og_description =
    $('meta[property="og:description"]').attr('content') || meta_description;
  const hero_h1 = ($('h1').first().text() || '').replace(/\s+/g, ' ').trim();

  return {
    title,
    meta_description,
    robots: /noindex/i.test(robots) ? 'index, follow' : robots,
    og_title,
    og_description,
    hero_h1,
    hero_lede: hero.hero_sub || words.hero_lede,
    form_heading: hero.form_heading || words.form_heading,
    role_options: words.role_options,
    content_json: {
      hero_support: words.hero_support,
      sections: words.sections,
      ...hero,
      trusted_brands: [],
    },
  };
}

function readSourceHtml(page) {
  const filePath = resolveSourcePath(page);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Page source missing: ${page.source_file}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Adapt one independent landing HTML with CMS URL + words.
 */
function adaptPageHtml(page, options = {}) {
  const site = getSetting('site', {});
  const footer = getSetting('footer', {});
  const content = parseContentJson(page);
  const cacheKey = `${page.slug}::${page.updated_at}::${site.baseUrl || ''}::${footer.email || ''}::${page.canonical_path || ''}`;
  if (!options.bypassCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const raw = readSourceHtml(page);
  const $ = cheerio.load(raw, { decodeEntities: false });

  const baseUrl = (site.baseUrl || 'https://consult.instacertify.com').replace(/\/$/, '');
  const canonicalPath = normalizePath(page.canonical_path || `/${page.slug}`);
  const phoneDisplay = page.phone || footer.phone || site.defaultPhone || '+91 99991 18039';
  const phoneHref =
    footer.phoneHref ||
    site.defaultPhoneHref ||
    phoneHrefFromDisplay(phoneDisplay);
  const waHref = buildWhatsAppHref(
    site.whatsappNumber || digitsOnly(phoneDisplay),
    page.whatsapp_text
  );

  // BIS consulting prices (editable from CMS)
  applyBisConsultingPrices($, content);

  // CMS-added products/categories for the BIS checker
  applyBisCatalog($, content);

  // Hero banner words + atmosphere image + trusted-by brands
  applyHeroContent($, {
    ...content,
    hero_h1: page.hero_h1,
    hero_lede: page.hero_lede,
    form_heading: page.form_heading || content.form_heading,
  });
  applyTrustedBy($, content);

  // SEO / URL
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

  // Section headings (independent page body words)
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const $h2s = $('h2');
  for (const sec of sections) {
    const m = String(sec.key || '').match(/h2_(\d+)/);
    if (!m) continue;
    const idx = Number(m[1]);
    const node = $h2s.eq(idx);
    if (!node.length) continue;
    const text = String(sec.text || '').trim();
    if (!text) {
      // Hide emptied headings and tighten the surrounding section block
      const parent = node.parent();
      node.remove();
      if (
        parent.length &&
        parent.is('section, .sec, .block, .wrap, div') &&
        !parent.find('h2,h3,p,li,form,table,.card,.chk').length
      ) {
        parent.remove();
      }
    } else {
      node.text(text);
      node.css('display', '');
    }
  }

  // BIS visual bands AFTER h2 remapping so CMS section indexes stay stable
  const isBis =
    page.slug === 'bis-certification' ||
    String(page.canonical_path || '').includes('bis');
  applyAboutBisSection($, content, { force: isBis });
  applySchemeVisuals($, content, { force: isBis });

  // Role dropdown options
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

  // Form → lead API (page stays independent; only wiring changes)
  $('form').each((_, el) => {
    const $form = $(el);
    $form.attr('method', 'post');
    $form.attr('action', '/api/leads');
    $form.attr('data-adapted', '1');
    if (!$form.find('input[name="page_slug"]').length) {
      $form.prepend(`<input type="hidden" name="page_slug" value="${page.slug}">`);
    } else {
      $form.find('input[name="page_slug"]').attr('value', page.slug);
    }
  });

  $('a[href^="tel:"]').attr('href', phoneHref);
  $('a[href*="wa.me"]').attr('href', waHref);
  $('a[href^="mailto:contact@"]').attr(
    'href',
    `mailto:${footer.email || site.leadEmail || 'contact@instacertify.com'}`
  );

  const $ftr = $('footer.ftr, footer');
  if ($ftr.length) {
    const address = footer.address || '';
    const cin = footer.cin || '';
    const email = footer.email || 'contact@instacertify.com';
    const legal = footer.legal || '';
    $ftr.find('a[href^="mailto:"]').first().text(email).attr('href', `mailto:${email}`);
    $ftr.find('a[href^="tel:"]').first().text(phoneDisplay).attr('href', phoneHref);
    if (legal) {
      const $legal = $ftr.find('.ftr__legal');
      if ($legal.length) $legal.text(legal);
    }
    $ftr.attr('data-cms-footer', '1');
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

  // Soft link back to directory (does not merge pages)
  const $logo = $('.hdr__logo').first();
  if ($logo.length) {
    $logo.attr('href', '/');
    $logo.attr('title', 'Instacertify Consult');
  }
  if (site.logoUrl) {
    const $img = $('.hdr__logo img').first();
    if ($img.length) $img.attr('src', site.logoUrl);
  }

  // Compact contact card: merge country into phone, reduce form size
  compactContactForm($);

  // GTM / GA / Ads / custom tags (site-wide)
  applyTrackingTags($, site);

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
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return html;
}

/**
 * Merge country code into the phone row and shrink the contact form card.
 */
function compactContactForm($) {
  const $form = $('form.formcard, form[data-adapted="1"]').first();
  if (!$form.length) return;

  const $ccField = $form.find('select#f-cc, select[name="country_code"]').first().closest('.field');
  const $phoneField = $form.find('#f-phone, input[name="phone"]').first().closest('.field');
  const $cc = $form.find('select#f-cc, select[name="country_code"]').first();
  const $telIn = $phoneField.find('.tel-in').first();

  if ($cc.length && $telIn.length) {
    // Move country select into phone input row
    $cc.addClass('tel-cc');
    $cc.attr('aria-label', 'Country code');
    $telIn.prepend($cc);
    $telIn.addClass('tel-in--merged');
    $telIn.find('#f-dial').remove();
    if ($ccField.length) $ccField.remove();
    const $phoneLabel = $phoneField.find('label').first();
    if ($phoneLabel.length) {
      $phoneLabel.html(
        'Mobile number <span class="req">*</span> <span class="field-hint">with country</span>'
      );
    }
  }

  $form.addClass('formcard--compact');

  if (!$('style[data-compact-form]').length) {
    $('head').append(`<style data-compact-form="1">
.formcard.formcard--compact{padding:18px 18px 16px;border-radius:14px;display:flex;flex-direction:column}
.formcard.formcard--compact h2{font-size:18px;margin:0 0 4px}
.formcard.formcard--compact .formcard__sub{font-size:12.5px;margin:0 0 12px;line-height:1.4}
.formcard.formcard--compact .field{margin-bottom:10px}
.formcard.formcard--compact .field label{font-size:11.5px;margin-bottom:4px}
.formcard.formcard--compact .field-hint{font-weight:500;color:var(--muted);font-size:10.5px}
.formcard.formcard--compact input,
.formcard.formcard--compact select,
.formcard.formcard--compact textarea{
  padding:9px 11px;font-size:13.5px;border-radius:8px;min-height:0;width:100%
}
.formcard.formcard--compact input[type="checkbox"],
.formcard.formcard--compact input[type="radio"]{
  width:15px;min-width:15px;max-width:15px;height:15px;padding:0;flex:none
}
.formcard.formcard--compact .consent{
  display:flex;gap:10px;align-items:flex-start;margin:10px 0 12px;width:100%
}
.formcard.formcard--compact .consent span,
.formcard.formcard--compact .consent label,
.formcard.formcard--compact .consent{
  font-size:11.5px;line-height:1.45
}
.formcard.formcard--compact .consent > *:not(input){flex:1;min-width:0}
.formcard.formcard--compact textarea{min-height:56px;resize:vertical}
.formcard.formcard--compact .btn{padding:12px 16px;font-size:14.5px;border-radius:8px;width:100%;justify-content:center}
.formcard.formcard--compact .tel-in--merged{
  display:grid;grid-template-columns:112px minmax(0,1fr);gap:8px;align-items:stretch
}
.formcard.formcard--compact .tel-cc{
  width:100%;max-width:100%;padding:8px 6px;font-size:12.5px;line-height:1.2
}
.formcard.formcard--compact .consent{margin:10px 0 12px}
.formcard.formcard--compact .formcard__foot{margin-top:auto;padding-top:8px}
@media(max-width:420px){
  .formcard.formcard--compact .tel-in--merged{grid-template-columns:1fr}
}
</style>`);
  }
}

function normalizePath(p) {
  let out = String(p || '/').trim();
  if (!out.startsWith('/')) out = `/${out}`;
  out = out.replace(/\/+/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function formatInr(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return `₹${num.toLocaleString('en-IN')}`;
}

/**
 * Apply CMS-editable "Consulting Starts At" prices on BIS landings.
 * Updates #bis-data JSON fees and visible copy that mentions CRS/ISI consulting prices.
 */
function applyBisConsultingPrices($, content) {
  const crs = Number(content.consulting_price_crs);
  const isi = Number(content.consulting_price_isi);
  const label = (content.consulting_label || 'Consulting Starts At').trim() || 'Consulting Starts At';
  const hasCrs = Number.isFinite(crs) && crs > 0;
  const hasIsi = Number.isFinite(isi) && isi > 0;
  if (!hasCrs && !hasIsi && !content.consulting_label) return;

  const $data = $('#bis-data');
  if ($data.length) {
    try {
      const data = JSON.parse($data.html() || '{}');
      data.f = data.f || {};
      if (hasCrs) data.f.crs = crs;
      if (hasIsi) data.f.isi = isi;
      $data.html(JSON.stringify(data));
    } catch {
      /* ignore malformed dataset */
    }
  }

  // Update fee chip label text in checker script if present
  $('script').each((_, el) => {
    const $el = $(el);
    let t = $el.html();
    if (!t || t.indexOf('fee--us') === -1) return;
    t = t.replace(/>Our fee</g, `>${label}<`);
    t = t.replace(/>Consulting Starts At</g, `>${label}<`);
    t = t.replace(/>Consulting from</g, `>${label}<`);
    $el.html(t);
  });

  // Visible body copy containing published consulting prices
  const crsStr = hasCrs ? formatInr(crs) : null;
  const isiStr = hasIsi ? formatInr(isi) : null;

  $('body *').each((_, node) => {
    const $n = $(node);
    if ($n.children().length) return;
    let t = $n.text();
    if (!t) return;
    const parentText = $n.parent().text() || t;
    const isConsultingCopy =
      /consulting|our fee|professional fee|own fee/i.test(parentText) ||
      /consulting|our fee|own fee/i.test(t);
    if (!isConsultingCopy) return;

    let next = t;
    if (crsStr) next = next.replace(/₹\s*9,?999/g, crsStr);
    if (isiStr) next = next.replace(/₹\s*20,?999/g, isiStr);
    next = next.replace(/Consulting from/gi, label);
    next = next.replace(/Our fee starts at/gi, label);
    next = next.replace(/Our own fee is fixed and published:/gi, `${label}:`);
    if (next !== t) $n.text(next);
  });
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

module.exports = {
  adaptPageHtml,
  clearPageCache,
  extractPageMetaFromHtml,
  extractEditableWords,
  readSourceHtml,
  resolveSourcePath,
  normalizePath,
  PAGES_DIR,
  UPLOADS_DIR,
};
