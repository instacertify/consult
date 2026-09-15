const cheerio = require('cheerio');

/**
 * Extract every editable hero/banner word + trusted-by label from a landing HTML.
 */
function extractHeroContent(html) {
  const $ = cheerio.load(html);
  const hero = $('.hero').first();
  const flag = hero.find('.flag').first();
  let flag_prefix = '';
  let flag_bold = '';
  if (flag.length) {
    flag_bold = flag.find('b').first().text().replace(/\s+/g, ' ').trim();
    const clone = flag.clone();
    clone.find('b,.dot').remove();
    flag_prefix = clone.text().replace(/\s+/g, ' ').trim();
  }

  const h1 = hero.find('h1').first();
  const h1_em = h1.find('em').first().text().replace(/\s+/g, ' ').trim();
  const h1_clone = h1.clone();
  h1_clone.find('em').remove();
  const h1_main = h1_clone.text().replace(/\s+/g, ' ').trim();

  const ticks = [];
  hero.find('ul.ticks li').each((_, el) => {
    const $li = $(el);
    const bold = $li.find('b').first().text().replace(/\s+/g, ' ').trim();
    const clone = $li.clone();
    clone.find('svg,b').remove();
    const rest = clone.text().replace(/\s+/g, ' ').trim();
    ticks.push({ bold, rest });
  });

  const ctas = [];
  hero.find('.hero__acts a.btn').each((_, el) => {
    const $a = $(el);
    const clone = $a.clone();
    clone.find('svg').remove();
    ctas.push({
      text: clone.text().replace(/\s+/g, ' ').trim(),
      href: $a.attr('href') || '',
    });
  });

  return {
    flag_prefix,
    flag_bold,
    h1_main,
    h1_em,
    hero_sub: hero.find('.hero__sub').first().text().replace(/\s+/g, ' ').trim(),
    cta_primary: ctas[0]?.text || '',
    cta_primary_href: ctas[0]?.href || '',
    cta_secondary: ctas[1]?.text || '',
    cta_secondary_href: ctas[1]?.href || '',
    ticks,
    form_heading: (
      hero.find('.formcard h2').first().text() ||
      $('#apply h2').first().text() ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim(),
    form_sub: (
      hero.find('.formcard__sub').first().text() ||
      $('.formcard__sub').first().text() ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim(),
    trusted_label: ($('.marq__lbl').first().text() || '').replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Apply hero word fields + optional hero image into the live HTML.
 */
function applyHeroContent($, content = {}) {
  const hero = $('.hero').first();
  if (!hero.length) return;

  const flag = hero.find('.flag').first();
  if (flag.length) {
    const prefix = String(content.flag_prefix || '').trim();
    const bold = String(content.flag_bold || '').trim();
    if (!prefix && !bold && (content.flag_prefix !== undefined || content.flag_bold !== undefined)) {
      flag.remove();
    } else if (prefix || bold) {
      const dot = flag.find('.dot').first();
      const dotHtml = dot.length ? `<span class="dot"></span>` : '';
      flag.html(
        `${dotHtml}${escapeHtml(prefix)}${bold ? ` <b>${escapeHtml(bold)}</b>` : ''}`
      );
    }
  }

  if (content.h1_main || content.h1_em || content.hero_h1) {
    const h1 = hero.find('h1').first();
    if (h1.length) {
      if (content.h1_main || content.h1_em) {
        const main = content.h1_main || '';
        const em = content.h1_em || '';
        h1.html(
          `${escapeHtml(main)}${em ? ` <em>${escapeHtml(em)}</em>` : ''}`
        );
      } else if (content.hero_h1) {
        h1.text(content.hero_h1);
      }
    }
  }

  const sub = hero.find('.hero__sub').first();
  if (sub.length) {
    const subText = String(content.hero_sub || content.hero_lede || '').trim();
    if (content.hero_sub !== undefined || content.hero_lede !== undefined) {
      if (!subText) sub.remove();
      else sub.text(subText);
    }
  }

  const actsWrap = hero.find('.hero__acts').first();
  if (actsWrap.length && (content.cta_primary !== undefined || content.cta_secondary !== undefined)) {
    const $all = actsWrap.find('a.btn');
    const $primary = $all.eq(0);
    const $secondary = $all.eq(1);

    if (content.cta_secondary !== undefined && $secondary.length) {
      const t = String(content.cta_secondary || '').trim();
      if (!t) $secondary.remove();
      else {
        setBtnText($secondary, t);
        if (content.cta_secondary_href) $secondary.attr('href', content.cta_secondary_href);
      }
    }

    if (content.cta_primary !== undefined && $primary.length) {
      const t = String(content.cta_primary || '').trim();
      if (!t) $primary.remove();
      else {
        setBtnText($primary, t);
        if (content.cta_primary_href) $primary.attr('href', content.cta_primary_href);
      }
    }

    if (!actsWrap.find('a.btn').length) actsWrap.remove();
  }

  const ticks = Array.isArray(content.ticks) ? content.ticks : null;
  if (ticks) {
    const $ul = hero.find('ul.ticks').first();
    if ($ul.length) {
      $ul.find('li').each((i, el) => {
        const $li = $(el);
        const row = ticks[i];
        if (!row) {
          $li.remove();
          return;
        }
        const bold = String(row.bold || '').trim();
        const rest = String(row.rest || '').trim();
        if (!bold && !rest) {
          $li.remove();
          return;
        }
        const svg = $li.find('svg').first();
        const svgHtml = svg.length ? $.html(svg) : '';
        $li.html(
          `${svgHtml}${bold ? `<b>${escapeHtml(bold)}</b>` : ''}${rest ? ` ${escapeHtml(rest)}` : ''}`
        );
      });
      if (!$ul.find('li').length) $ul.remove();
    }
  }

  if (content.form_heading !== undefined) {
    const fh = hero.find('.formcard h2').first();
    if (fh.length) {
      const t = String(content.form_heading || '').trim();
      if (!t) fh.remove();
      else fh.text(t);
    }
  } else if (content.form_heading) {
    const fh = hero.find('.formcard h2').first();
    if (fh.length) fh.text(content.form_heading);
  }

  const fs = hero.find('.formcard__sub').first();
  if (fs.length && content.form_sub !== undefined) {
    const t = String(content.form_sub || '').trim();
    if (!t) fs.remove();
    else fs.text(t);
  } else if (content.form_sub) {
    if (fs.length) fs.text(content.form_sub);
  }

  // Hero stats under headline/ticks (Happy Clients / Advisors / Offices)
  applyHeroStats(hero, $, content);

  // Full-bleed atmospheric photo behind hero (edge-to-edge, not an inset card)
  applyHeroBackground(hero, $, content);

  // Remove leftover inset hero image boxes from older CMS versions
  hero.find('.hero__media').remove();

  if (!$('style[data-hero-media]').length) {
    $('head').append(`<style data-hero-media="1">
.hero{isolation:isolate}
.hero__bg{
  position:absolute;inset:0;z-index:0;pointer-events:none;
  background-size:cover;background-position:center 42%;
  transform:scale(1.02);
}
.hero__bg::after{
  content:"";position:absolute;inset:0;
  background:
    linear-gradient(118deg,rgba(8,42,58,.94) 0%,rgba(10,58,82,.78) 48%,rgba(10,58,82,.62) 100%),
    linear-gradient(180deg,rgba(8,42,58,.35) 0%,rgba(8,42,58,.55) 100%);
}
.hero > .wrap,
.hero > .hero__in,
.hero > .hero__stats{position:relative;z-index:1}
.hero ul.ticks{margin-bottom:0}
@media(min-width:980px){
  .hero__in{align-items:start!important}
  .hero__in > div:first-child{display:flex;flex-direction:column;min-width:0}
  .hero__in > div:last-child,
  .hero__in > #apply{min-width:0;display:flex;flex-direction:column;padding-top:0;margin-top:0}
  .hero form.formcard,
  .hero .formcard{
    align-self:start;
    width:100%;
    margin-top:0!important;
    position:sticky;
    top:88px;
  }
}
/* Stats sit in the left column, beside the contact form */
.hero__in > div:first-child .hero__stats,
.hero__in .hero__stats{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;
  margin:22px 0 0;padding:0;width:100%;max-width:none;box-sizing:border-box
}
.hero__stats[data-count="1"]{grid-template-columns:minmax(0,1fr);max-width:280px}
.hero__stats[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:560px){
  .hero__in .hero__stats,
  .hero__stats[data-count="2"]{grid-template-columns:1fr}
}
.hero__stat{display:flex;gap:12px;align-items:center;background:rgba(255,255,255,.1);
  border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:14px 14px;min-width:0;min-height:74px;
  backdrop-filter:blur(6px)}
.hero__stat-icon{width:44px;height:44px;border-radius:10px;background:rgba(255,255,255,.12);
  display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden}
.hero__stat-icon img{width:100%;height:100%;object-fit:cover;display:block}
.hero__stat-icon svg{width:22px;height:22px;color:#FFC79E}
.hero__stat strong{display:block;color:#fff;font-size:clamp(16px,2.1vw,20px);line-height:1.1;letter-spacing:-.02em}
.hero__stat span{display:block;color:#B6D3E4;font-size:12px;margin-top:4px;line-height:1.25}
.marq[hidden],.hero .flag[hidden],.hero__acts:empty,ul.ticks:empty{display:none!important}
.fees.fees--1{grid-template-columns:1fr}
.fees.fees--2{grid-template-columns:repeat(2,1fr)}
.fees.fees--3{grid-template-columns:repeat(3,1fr)}
@media(min-width:560px){
  .fees.fees--1{grid-template-columns:1fr}
  .fees.fees--2{grid-template-columns:repeat(2,1fr)}
  .fees.fees--3{grid-template-columns:repeat(3,1fr)}
}
.hero__acts .btn{justify-content:center}
.strip__in{align-items:stretch}
.strip__i{display:flex;flex-direction:column;justify-content:center;min-height:88px}

/* What is BIS — visual band (Agile-inspired image slot) */
.about-bis{padding:64px 0;background:
  radial-gradient(900px 420px at 85% 20%,rgba(232,114,42,.08),transparent 60%),
  linear-gradient(180deg,#F7FBFD 0%,#EEF4F8 100%)}
.about-bis__in{display:grid;gap:36px;align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.about-bis__in{grid-template-columns:1.05fr .95fr;gap:56px}}
.about-bis .eyebrow{margin-bottom:10px}
.about-bis h2{margin:0 0 14px;letter-spacing:-.02em}
.about-bis .lede{margin:0 0 16px;max-width:54ch}
.about-bis__points{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.about-bis__points li{display:flex;gap:10px;align-items:flex-start;color:var(--body,#40566A);font-size:.95rem;line-height:1.45}
.about-bis__points li svg{flex:none;margin-top:3px}
.about-bis__visual{margin:0;border-radius:18px;overflow:hidden;background:#fff;
  border:1px solid rgba(10,58,82,.08);box-shadow:0 18px 40px -28px rgba(10,58,82,.45)}
.about-bis__visual img{display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:cover}
.about-bis__visual figcaption{padding:12px 16px;font-size:12px;color:#6B8095;border-top:1px solid #E8EEF3}

/* Scheme visual strip above comparison table */
.scheme-visuals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 22px}
@media(min-width:900px){.scheme-visuals{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}}
.scheme-visual{
  display:flex;flex-direction:column;gap:8px;min-height:132px;padding:16px;
  border-radius:14px;border:1px solid #DCE6ED;background:#fff;position:relative;overflow:hidden
}
.scheme-visual__icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:2px}
.scheme-visual__icon svg{width:22px;height:22px}
.scheme-visual--navy .scheme-visual__icon{background:#E7F0F5;color:#0A3A52}
.scheme-visual--teal .scheme-visual__icon{background:#E6F5EF;color:#12805C}
.scheme-visual--orange .scheme-visual__icon{background:#FCEFE6;color:#E8702A}
.scheme-visual--slate .scheme-visual__icon{background:#EEF1F4;color:#40566A}
.scheme-visual__tag{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#E8702A}
.scheme-visual h3{margin:0;font-size:1rem;color:#0F2230;letter-spacing:-.01em}
.scheme-visual p{margin:0;font-size:.82rem;color:#40566A;line-height:1.35}
</style>`);
  }
}

function defaultHeroStats() {
  return [
    {
      key: 'clients',
      value: '42,818+',
      label: 'Happy Customers',
      iconUrl: '',
    },
    {
      key: 'advisors',
      value: '15+',
      label: 'Expert Advisors',
      iconUrl: '',
    },
    {
      key: 'offices',
      value: '3+',
      label: 'Branch Offices',
      iconUrl: '',
    },
  ];
}

function normalizeHeroStats(content = {}) {
  const defaults = defaultHeroStats();
  const incoming = Array.isArray(content.hero_stats) ? content.hero_stats : [];
  const hasIncoming = Array.isArray(content.hero_stats);
  return defaults.map((d, i) => {
    const row = incoming.find((x) => x && x.key === d.key) || incoming[i] || {};
    const hasValue = row.value != null;
    const hasLabel = row.label != null;
    return {
      key: d.key,
      // Blank value in CMS means “hide this stat”; missing row keeps the default.
      value: hasIncoming
        ? hasValue
          ? String(row.value)
          : d.value
        : d.value,
      label: hasIncoming
        ? hasLabel
          ? String(row.label)
          : d.label
        : d.label,
      iconUrl: row.iconUrl || '',
    };
  });
}

function defaultStatIcon(key) {
  if (key === 'advisors') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  }
  if (key === 'offices') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>`;
  }
  // clients / happy
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 11.5c.5 1.2.5 2.5 0 3.5"/></svg>`;
}

function applyHeroBackground(hero, $, content = {}) {
  hero.find('.hero__bg').remove();
  const url = String(content.hero_bg_url || '').trim();
  if (!url) return;
  hero.prepend(
    `<div class="hero__bg" aria-hidden="true" style="background-image:url('${escapeAttr(url)}')"></div>`
  );
}

function defaultAboutBis() {
  return {
    enabled: true,
    eyebrow: 'Bureau of Indian Standards',
    title: 'What is BIS certification?',
    body:
      'BIS is the Indian government body that sets product quality and safety standards. A valid BIS certificate means your product was tested against the right Indian Standard — and you are allowed to manufacture, import or sell it in India.',
    points: [
      'Mandatory for many products before import or sale in India',
      'Covers ISI Mark, CRS, FMCS and Scheme X routes',
      'Builds buyer trust and keeps consignments moving through customs',
    ],
    image_url: '/img/bis-mark-visual.jpg',
    image_alt: 'Example BIS ISI certification mark plate',
    caption: 'Illustrative ISI mark layout — your exact standard and CM/L number appear after grant.',
  };
}

function applyAboutBisSection($, content = {}, { force = false } = {}) {
  const existing = $('section.about-bis').first();
  const hasCms = content.about_bis && typeof content.about_bis === 'object';
  const cfg = {
    ...defaultAboutBis(),
    ...(hasCms ? content.about_bis : {}),
  };
  const show = hasCms ? cfg.enabled !== false : Boolean(force);
  if (!show) {
    existing.remove();
    return;
  }

  const points = (Array.isArray(cfg.points) ? cfg.points : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  const img = String(cfg.image_url || '').trim();
  if (!img && !String(cfg.title || '').trim()) {
    existing.remove();
    return;
  }

  const pointsHtml = points
    .map(
      (p) => `<li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#12805C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>${escapeHtml(p)}</span></li>`
    )
    .join('');

  const visual = img
    ? `<figure class="about-bis__visual">
        <img src="${escapeAttr(img)}" alt="${escapeAttr(cfg.image_alt || 'BIS certification mark')}" loading="lazy" decoding="async">
        ${
          cfg.caption
            ? `<figcaption>${escapeHtml(cfg.caption)}</figcaption>`
            : ''
        }
      </figure>`
    : '';

  const html = `<section class="sec about-bis" id="about-bis">
  <div class="wrap about-bis__in">
    <div>
      ${cfg.eyebrow ? `<p class="eyebrow">${escapeHtml(cfg.eyebrow)}</p>` : ''}
      ${cfg.title ? `<h2>${escapeHtml(cfg.title)}</h2>` : ''}
      ${cfg.body ? `<p class="lede">${escapeHtml(cfg.body)}</p>` : ''}
      ${pointsHtml ? `<ul class="about-bis__points">${pointsHtml}</ul>` : ''}
    </div>
    ${visual}
  </div>
</section>`;

  if (existing.length) {
    existing.replaceWith(html);
    return;
  }

  const marq = $('section.marq').first();
  const checker = $('#checker').first();
  if (marq.length) marq.after(html);
  else if (checker.length) checker.before(html);
  else $('section.hero').first().after(html);
}

function defaultSchemeVisuals() {
  return [
    {
      key: 'isi',
      tag: 'Domestic',
      title: 'ISI Mark',
      blurb: 'Indian factories — factory audit + product testing',
      tone: 'navy',
    },
    {
      key: 'fmcs',
      tag: 'Foreign',
      title: 'FMCS',
      blurb: 'Overseas manufacturers selling into India',
      tone: 'teal',
    },
    {
      key: 'crs',
      tag: 'Electronics',
      title: 'CRS',
      blurb: 'IT, telecom & electronics registration',
      tone: 'orange',
    },
    {
      key: 'schemex',
      tag: 'Machinery',
      title: 'Scheme X',
      blurb: 'Low-voltage / industrial equipment route',
      tone: 'slate',
    },
  ];
}

function schemeVisualIcon(key) {
  if (key === 'fmcs') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`;
  }
  if (key === 'crs') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>`;
  }
  if (key === 'schemex') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h16M6 20V10l6-4 6 4v10M10 20v-4h4v4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>`;
}

function applySchemeVisuals($, content = {}, { force = false } = {}) {
  $('div.scheme-visuals').remove();
  if (content.scheme_visuals_enabled === false) return;

  const rows = Array.isArray(content.scheme_visuals) && content.scheme_visuals.length
    ? content.scheme_visuals
    : force
      ? defaultSchemeVisuals()
      : [];
  if (!rows.length) return;

  let host = null;
  $('section.sec').each((_, el) => {
    const $sec = $(el);
    const t = $sec.find('h2').first().text().toLowerCase();
    if (t.includes('isi') && (t.includes('crs') || t.includes('scheme') || t.includes('fmcs'))) {
      host = $sec;
      return false;
    }
    if ($sec.find('table.ctable').length && t.includes('interchangeable')) {
      host = $sec;
      return false;
    }
  });
  if (!host) {
    const table = $('table.ctable').first();
    if (table.length) host = table.closest('section.sec');
  }
  if (!host || !host.length) return;

  const cards = rows
    .map((r) => {
      const tone = String(r.tone || 'navy');
      return `<div class="scheme-visual scheme-visual--${escapeAttr(tone)}">
        <div class="scheme-visual__icon">${schemeVisualIcon(r.key)}</div>
        <span class="scheme-visual__tag">${escapeHtml(r.tag || '')}</span>
        <h3>${escapeHtml(r.title || '')}</h3>
        <p>${escapeHtml(r.blurb || '')}</p>
      </div>`;
    })
    .join('');

  const wrap = host.find('.wrap').first();
  const center = wrap.find('.center').first();
  const html = `<div class="scheme-visuals" aria-label="BIS schemes">${cards}</div>`;
  if (center.length) center.after(html);
  else if (wrap.length) wrap.prepend(html);
}

function applyHeroStats(hero, $, content) {
  const enabled = content.hero_stats_enabled !== false;
  if (!enabled) {
    hero.find('.hero__stats').remove();
    return;
  }

  const cardsStats = normalizeHeroStats(content).filter(
    (s) => String(s.value || '').trim() !== ''
  );

  let wrap = hero.find('.hero__stats').first();
  if (!cardsStats.length) {
    wrap.remove();
    return;
  }

  const cards = cardsStats
    .map((s) => {
      const icon = s.iconUrl
        ? `<img src="${escapeAttr(s.iconUrl)}" alt="">`
        : defaultStatIcon(s.key);
      const label = String(s.label || '').trim();
      return `<div class="hero__stat">
        <div class="hero__stat-icon">${icon}</div>
        <div><strong>${escapeHtml(String(s.value).trim())}</strong>${
          label ? `<span>${escapeHtml(label)}</span>` : ''
        }</div>
      </div>`;
    })
    .join('');

  // Place stats in the left hero column so they sit beside the contact
  // form (not full-width underneath both columns).
  const heroIn = hero.find('.hero__in').first();
  const leftCol = heroIn.children('div').first();
  const html = `<div class="hero__stats" data-count="${cardsStats.length}" aria-label="Key figures">${cards}</div>`;

  if (wrap.length) wrap.remove();

  if (leftCol.length) {
    const ticks = leftCol.find('ul.ticks').first();
    const acts = leftCol.find('.hero__acts').first();
    if (ticks.length) ticks.after(html);
    else if (acts.length) acts.after(html);
    else leftCol.append(html);
  } else {
    const ticks = hero.find('ul.ticks').first();
    const target = ticks.length ? ticks : hero.find('.hero__acts').first();
    if (target.length) target.after(html);
  }
}

function applyTrustedBy($, content = {}) {
  const marq = $('section.marq').first();
  if (!marq.length) return;

  if (content.trusted_label !== undefined) {
    const lbl = marq.find('.marq__lbl').first();
    const label = String(content.trusted_label || '').trim();
    if (lbl.length) {
      if (!label) lbl.remove();
      else lbl.text(label);
    }
  } else if (content.trusted_label) {
    const lbl = marq.find('.marq__lbl').first();
    if (lbl.length) lbl.text(content.trusted_label);
  }

  // Only override brands when CMS has an explicit array (including empty = hide strip)
  if (!Array.isArray(content.trusted_brands)) return;

  const brands = content.trusted_brands.filter((b) => b && b.imageUrl);
  if (!brands.length) {
    marq.attr('hidden', 'hidden');
    marq.css('display', 'none');
    return;
  }

  marq.removeAttr('hidden');
  marq.css('display', '');
  const imgs = brands
    .map(
      (b) =>
        `<img alt="${escapeAttr(b.name || 'Trusted brand')}" src="${escapeAttr(b.imageUrl)}" loading="lazy" decoding="async">`
    )
    .join('');

  // Duplicate set for marquee animation
  marq.find('.marq__track').html(
    `<div class="marq__set">${imgs}</div><div class="marq__set" aria-hidden="true">${imgs}</div>`
  );
}

function setBtnText($a, text) {
  const $svg = $a.find('svg').first().clone();
  $a.empty();
  if ($svg.length) $a.append($svg);
  $a.append(` ${escapeHtml(text)}`);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

module.exports = {
  extractHeroContent,
  applyHeroContent,
  applyTrustedBy,
  applyAboutBisSection,
  applySchemeVisuals,
  defaultHeroStats,
  normalizeHeroStats,
  defaultAboutBis,
  defaultSchemeVisuals,
};
