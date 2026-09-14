/**
 * Simple session-bound math captcha for admin login (no third-party service).
 */

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function createMathCaptcha() {
  const a = randomInt(2, 9);
  const b = randomInt(1, 9);
  const answer = a + b;
  const text = `${a} + ${b} = ?`;
  const svg = renderCaptchaSvg(text);
  return {
    answer: String(answer),
    question: text,
    svg,
    dataUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  };
}

function renderCaptchaSvg(text) {
  const w = 220;
  const h = 64;
  const noise = [];
  for (let i = 0; i < 8; i++) {
    const x1 = randomInt(0, w);
    const y1 = randomInt(0, h);
    const x2 = randomInt(0, w);
    const y2 = randomInt(0, h);
    noise.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9BB4C4" stroke-width="1" opacity=".55"/>`
    );
  }
  for (let i = 0; i < 18; i++) {
    noise.push(
      `<circle cx="${randomInt(4, w - 4)}" cy="${randomInt(4, h - 4)}" r="1.2" fill="#7A93A4" opacity=".45"/>`
    );
  }
  const rotate = randomInt(-4, 4);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Captcha">
  <rect width="100%" height="100%" rx="10" fill="#F4F8FB"/>
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="9" fill="none" stroke="#C9D8E3"/>
  ${noise.join('\n  ')}
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="26" font-weight="700" fill="#0A3A52"
    transform="rotate(${rotate} ${w / 2} ${h / 2})">${escapeXml(text)}</text>
</svg>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function captchaMatches(expected, provided) {
  if (expected == null || expected === '') return false;
  const a = String(expected).trim();
  const b = String(provided || '').trim();
  if (!a || !b) return false;
  return a === b;
}

module.exports = {
  createMathCaptcha,
  captchaMatches,
};
