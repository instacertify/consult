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

  if (content.flag_prefix || content.flag_bold) {
    const flag = hero.find('.flag').first();
    if (flag.length) {
      const dot = flag.find('.dot').first();
      const dotHtml = dot.length ? `<span class="dot"></span>` : '';
      const prefix = content.flag_prefix || '';
      const bold = content.flag_bold || '';
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

  if (content.hero_sub || content.hero_lede) {
    const sub = hero.find('.hero__sub').first();
    if (sub.length) sub.text(content.hero_sub || content.hero_lede);
  }

  const acts = hero.find('.hero__acts a.btn');
  if (acts.length && content.cta_primary) {
    setBtnText($(acts[0]), content.cta_primary);
    if (content.cta_primary_href) $(acts[0]).attr('href', content.cta_primary_href);
  }
  if (acts.length > 1 && content.cta_secondary) {
    setBtnText($(acts[1]), content.cta_secondary);
    if (content.cta_secondary_href) $(acts[1]).attr('href', content.cta_secondary_href);
  }

  const ticks = Array.isArray(content.ticks) ? content.ticks : [];
  hero.find('ul.ticks li').each((i, el) => {
    if (!ticks[i]) return;
    const $li = $(el);
    const svg = $li.find('svg').first();
    const svgHtml = svg.length ? $.html(svg) : '';
    const bold = ticks[i].bold || '';
    const rest = ticks[i].rest || '';
    $li.html(
      `${svgHtml}${bold ? `<b>${escapeHtml(bold)}</b>` : ''}${rest ? ` ${escapeHtml(rest)}` : ''}`
    );
  });

  if (content.form_heading) {
    const fh = hero.find('.formcard h2').first();
    if (fh.length) fh.text(content.form_heading);
  }
  if (content.form_sub) {
    const fs = hero.find('.formcard__sub').first();
    if (fs.length) fs.text(content.form_sub);
  }

  // Hero stats under headline/ticks (Happy Clients / Advisors / Offices)
  applyHeroStats(hero, $, content);

  // Remove any leftover hero image boxes from older CMS versions
  hero.find('.hero__media').remove();

  if (!$('style[data-hero-media]').length) {
    $('head').append(`<style data-hero-media="1">
.hero__stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:26px;width:100%;max-width:100%}
@media(max-width:560px){.hero__stats{grid-template-columns:1fr}}
.hero__stat{display:flex;gap:12px;align-items:center;background:rgba(255,255,255,.1);
  border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:14px 14px;min-width:0}
.hero__stat-icon{width:44px;height:44px;border-radius:10px;background:rgba(255,255,255,.12);
  display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden}
.hero__stat-icon img{width:100%;height:100%;object-fit:cover;display:block}
.hero__stat-icon svg{width:22px;height:22px;color:#FFC79E}
.hero__stat strong{display:block;color:#fff;font-size:clamp(16px,2.1vw,20px);line-height:1.1;letter-spacing:-.02em}
.hero__stat span{display:block;color:#B6D3E4;font-size:12px;margin-top:4px;line-height:1.25}
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
  return defaults.map((d, i) => {
    const row = incoming.find((x) => x && x.key === d.key) || incoming[i] || {};
    return {
      key: d.key,
      value: row.value != null && String(row.value).trim() !== '' ? String(row.value) : d.value,
      label: row.label != null && String(row.label).trim() !== '' ? String(row.label) : d.label,
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

function applyHeroStats(hero, $, content) {
  const stats = normalizeHeroStats(content);
  const enabled = content.hero_stats_enabled !== false;
  if (!enabled) {
    hero.find('.hero__stats').remove();
    return;
  }

  const cards = stats
    .map((s) => {
      const icon = s.iconUrl
        ? `<img src="${escapeAttr(s.iconUrl)}" alt="">`
        : defaultStatIcon(s.key);
      return `<div class="hero__stat">
        <div class="hero__stat-icon">${icon}</div>
        <div><strong>${escapeHtml(s.value)}</strong><span>${escapeHtml(s.label)}</span></div>
      </div>`;
    })
    .join('');

  let wrap = hero.find('.hero__stats').first();
  if (!wrap.length) {
    const ticks = hero.find('ul.ticks').first();
    const target = ticks.length ? ticks : hero.find('.hero__acts').first();
    if (target.length) {
      target.after(`<div class="hero__stats" aria-label="Key figures">${cards}</div>`);
    } else {
      const leftCol = hero.find('.hero__in > div').first();
      if (leftCol.length) leftCol.append(`<div class="hero__stats">${cards}</div>`);
    }
  } else {
    wrap.html(cards);
  }
}

function applyTrustedBy($, content = {}) {
  if (content.trusted_label) {
    const lbl = $('.marq__lbl').first();
    if (lbl.length) lbl.text(content.trusted_label);
  }

  const brands = Array.isArray(content.trusted_brands) ? content.trusted_brands : [];
  if (!brands.length) return;

  const marq = $('section.marq').first();
  if (!marq.length) return;

  const imgs = brands
    .filter((b) => b && b.imageUrl)
    .map(
      (b) =>
        `<img alt="${escapeAttr(b.name || 'Trusted brand')}" src="${escapeAttr(b.imageUrl)}" loading="lazy" decoding="async">`
    )
    .join('');

  if (!imgs) return;

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
  defaultHeroStats,
  normalizeHeroStats,
};
