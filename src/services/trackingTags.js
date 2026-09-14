/**
 * Build and inject Google Tag Manager, Analytics, Ads, and custom snippets.
 */

function normalizeId(value, prefixes) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  for (const p of prefixes) {
    if (upper.startsWith(p.toUpperCase())) return raw.trim();
  }
  // Allow bare IDs and add the first prefix
  if (/^[A-Z0-9_-]+$/i.test(raw) && prefixes[0]) {
    return `${prefixes[0]}${raw.replace(/^[-_]+/, '')}`;
  }
  return raw;
}

function trackingConfig(site = {}) {
  const gtmId = normalizeId(site.gtmId || site.googleTagManagerId, ['GTM-']);
  const gaId = normalizeId(site.gaId || site.googleAnalyticsId, ['G-', 'UA-']);
  let adsId = String(site.googleAdsId || '').trim();
  if (adsId && !/^AW-/i.test(adsId) && /^[0-9]+$/.test(adsId)) {
    adsId = `AW-${adsId}`;
  }
  if (/AW-X+/i.test(adsId) || /XXXX/i.test(adsId)) adsId = '';
  return {
    gtmId: /^GTM-[A-Z0-9]+$/i.test(gtmId) ? gtmId : '',
    gaId: /^(G-[A-Z0-9]+|UA-\d+-\d+)$/i.test(gaId) ? gaId : '',
    adsId: /^AW-[0-9]+$/i.test(adsId) ? adsId : '',
    customHeadHtml: String(site.customHeadHtml || '').trim(),
    customBodyHtml: String(site.customBodyHtml || '').trim(),
  };
}

function gtagBootstrap(ids) {
  const list = ids.filter(Boolean);
  if (!list.length) return '';
  const primary = list[0];
  const configs = list
    .map((id) => `gtag('config', '${id.replace(/'/g, "\\'")}');`)
    .join('\n  ');
  return `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${primary}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
  ${configs}
</script>`;
}

function gtmHead(gtmId) {
  if (!gtmId) return '';
  return `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');</script>
<!-- End Google Tag Manager -->`;
}

function gtmBody(gtmId) {
  if (!gtmId) return '';
  return `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;
}

function buildHeadSnippets(site = {}) {
  const cfg = trackingConfig(site);
  const parts = [];
  if (cfg.gtmId) parts.push(gtmHead(cfg.gtmId));
  // If GTM is set, GA/Ads are usually configured inside GTM — still allow direct IDs
  const gtagIds = [];
  if (cfg.gaId) gtagIds.push(cfg.gaId);
  if (cfg.adsId) gtagIds.push(cfg.adsId);
  if (gtagIds.length) parts.push(gtagBootstrap(gtagIds));
  if (cfg.customHeadHtml) parts.push(cfg.customHeadHtml);
  return parts.join('\n');
}

function buildBodyStartSnippets(site = {}) {
  const cfg = trackingConfig(site);
  return gtmBody(cfg.gtmId);
}

function buildBodyEndSnippets(site = {}) {
  const cfg = trackingConfig(site);
  return cfg.customBodyHtml || '';
}

/**
 * Inject tracking into a Cheerio document (landings).
 */
function applyTrackingTags($, site = {}) {
  $('[data-cms-tracking]').remove();
  // Strip previous comment-wrapped injections by removing known GTM/gtag blocks we own
  // (fresh adapt always starts from source HTML, so this is mainly for bypassCache).

  const headHtml = buildHeadSnippets(site);
  if (headHtml) {
    $('head').prepend(headHtml);
  }

  const bodyStart = buildBodyStartSnippets(site);
  if (bodyStart) {
    $('body').prepend(bodyStart);
  }

  const bodyEnd = buildBodyEndSnippets(site);
  if (bodyEnd) {
    $('body').append(bodyEnd);
  }

  const cfg = trackingConfig(site);
  if (cfg.adsId) {
    $('script').each((_, el) => {
      const $el = $(el);
      let t = $el.html();
      if (!t || t.indexOf('AW_ID') === -1) return;
      t = t.replace(/var\s+AW_ID\s*=\s*['"]AW-[^'"]*['"]/g, `var AW_ID = '${cfg.adsId}'`);
      $el.html(t);
    });
  }
}

/**
 * Inject tracking into a full HTML string (hub).
 */
function injectTrackingIntoHtml(html, site = {}) {
  let out = String(html || '');
  const head = buildHeadSnippets(site);
  const bodyStart = buildBodyStartSnippets(site);
  const bodyEnd = buildBodyEndSnippets(site);
  if (head) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n${head}\n`);
  }
  if (bodyStart) {
    out = out.replace(/<body[^>]*>/i, (m) => `${m}\n${bodyStart}\n`);
  }
  if (bodyEnd) {
    out = out.replace(/<\/body>/i, `${bodyEnd}\n</body>`);
  }
  return out;
}

module.exports = {
  trackingConfig,
  buildHeadSnippets,
  buildBodyStartSnippets,
  buildBodyEndSnippets,
  applyTrackingTags,
  injectTrackingIntoHtml,
};
