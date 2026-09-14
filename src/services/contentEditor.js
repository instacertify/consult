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

  // Remove any leftover hero image boxes from older CMS versions
  hero.find('.hero__media').remove();

  if (!$('style[data-hero-media]').length) {
    $('head').append(`<style data-hero-media="1">
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
/* Stats sit under both columns so form stays level with side copy */
.hero > .hero__stats,
.hero .wrap + .hero__stats,
.hero__in + .hero__stats{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;
  margin:8px auto 0;padding:28px 20px 8px;width:100%;max-width:var(--maxw,1120px);box-sizing:border-box
}
.hero__stats[data-count="1"]{grid-template-columns:minmax(0,1fr);max-width:320px}
.hero__stats[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:560px){
  .hero > .hero__stats,
  .hero .wrap + .hero__stats,
  .hero__in + .hero__stats,
  .hero__stats[data-count="2"]{grid-template-columns:1fr;padding-top:20px}
}
.hero__stat{display:flex;gap:12px;align-items:center;background:rgba(255,255,255,.1);
  border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:14px 14px;min-width:0;min-height:74px}
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

  // Place stats under the two-column hero grid so the contact form
  // stays top-aligned with the side content on every landing.
  const heroIn = hero.find('.hero__in').first();
  const html = `<div class="hero__stats" data-count="${cardsStats.length}" aria-label="Key figures">${cards}</div>`;
  if (!wrap.length) {
    if (heroIn.length) heroIn.after(html);
    else {
      const ticks = hero.find('ul.ticks').first();
      const target = ticks.length ? ticks : hero.find('.hero__acts').first();
      if (target.length) target.after(html);
    }
  } else {
    // Move out of left column if an older adapt put it there
    if (heroIn.length && wrap.closest('.hero__in').length) {
      wrap.remove();
      heroIn.after(html);
    } else {
      wrap.attr('data-count', String(cardsStats.length));
      wrap.html(cards);
    }
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
  defaultHeroStats,
  normalizeHeroStats,
};
