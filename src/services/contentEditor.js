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

  // Optional hero side image (utilizes empty visual space in left column)
  if (content.hero_image_url) {
    let imgWrap = hero.find('.hero__media').first();
    if (!imgWrap.length) {
      const leftCol = hero.find('.hero__in > div').first();
      if (leftCol.length) {
        leftCol.append(
          `<div class="hero__media"><img src="${escapeAttr(content.hero_image_url)}" alt="${escapeAttr(
            content.hero_image_alt || 'Instacertify'
          )}" loading="lazy" decoding="async"></div>`
        );
      }
    } else {
      imgWrap.find('img').attr('src', content.hero_image_url);
      if (content.hero_image_alt) imgWrap.find('img').attr('alt', content.hero_image_alt);
    }
  }

  // Inject minimal CSS once for hero media
  if (content.hero_image_url && !$('style[data-hero-media]').length) {
    $('head').append(`<style data-hero-media="1">
.hero__media{margin-top:22px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);max-width:420px}
.hero__media img{display:block;width:100%;height:auto;object-fit:cover;max-height:220px}
@media(min-width:980px){.hero__media{max-width:100%}}
</style>`);
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
};
