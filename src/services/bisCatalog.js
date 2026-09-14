/**
 * Merge CMS-managed categories/products into the BIS checker #bis-data JSON.
 *
 * ISI row: [IS, name, catIdx, hsn4, hsn8, status, orderIdx, feeL, fee?, fee?, fee?, testLo, testHi, labs]
 * CRS row: [name, IS, hsn4, hsn8, orderIdx, feeMicro, feeSmall, feeLarge, testLo, testHi, labs]
 */

function ensureCatalog(content = {}) {
  const catalog = content.bis_catalog || {};
  return {
    categories: Array.isArray(catalog.categories) ? catalog.categories : [],
    products: Array.isArray(catalog.products) ? catalog.products : [],
  };
}

function applyBisCatalog($, content = {}) {
  const $data = $('#bis-data');
  if (!$data.length) return;

  let data;
  try {
    data = JSON.parse($data.html() || '{}');
  } catch {
    return;
  }

  data.c = Array.isArray(data.c) ? data.c.slice() : [];
  data.i = Array.isArray(data.i) ? data.i.slice() : [];
  data.r = Array.isArray(data.r) ? data.r.slice() : [];
  data.o = data.o || {};
  data.f = data.f || { crs: 9999, isi: 20999 };

  const catalog = ensureCatalog(content);

  // Append custom categories
  for (const name of catalog.categories) {
    const n = String(name || '').trim();
    if (n && !data.c.includes(n)) data.c.push(n);
  }

  for (const p of catalog.products) {
    if (!p || !p.name) continue;
    const scheme = (p.scheme || 'isi').toLowerCase();
    const category = String(p.category || '').trim();
    let catIdx = data.c.indexOf(category);
    if (catIdx < 0 && category) {
      data.c.push(category);
      catIdx = data.c.length - 1;
    }

    if (scheme === 'crs') {
      data.r.unshift([
        String(p.name),
        String(p.standard || p.is_number || ''),
        String(p.hsn4 || ''),
        String(p.hsn8 || p.hsn4 || ''),
        Number(p.order_idx || 0),
        Number(p.fee_micro || 7000),
        Number(p.fee_small || 14500),
        Number(p.fee_large || 27000),
        Number(p.test_lo || 0),
        Number(p.test_hi || 0),
        Number(p.labs || 0),
      ]);
    } else {
      data.i.unshift([
        String(p.standard || p.is_number || ''),
        String(p.name),
        catIdx < 0 ? 0 : catIdx,
        String(p.hsn4 || ''),
        String(p.hsn8 || p.hsn4 || ''),
        Number(p.status ?? 0),
        Number(p.order_idx || 0),
        Number(p.fee_large || 46000),
        Number(p.fee_medium || 37000),
        Number(p.fee_small || 23000),
        Number(p.fee_micro || 9200),
        Number(p.test_lo || 0),
        Number(p.test_hi || 0),
        Number(p.labs || 0),
      ]);
    }
  }

  $data.html(JSON.stringify(data));
}

function listBuiltinCategories(htmlOrJson) {
  try {
    const data =
      typeof htmlOrJson === 'string' && htmlOrJson.trim().startsWith('{')
        ? JSON.parse(htmlOrJson)
        : null;
    if (data && Array.isArray(data.c)) return data.c;
  } catch {
    /* ignore */
  }
  return [];
}

module.exports = {
  ensureCatalog,
  applyBisCatalog,
  listBuiltinCategories,
};
