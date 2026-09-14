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
    removed: Array.isArray(catalog.removed) ? catalog.removed : [],
    overrides: Array.isArray(catalog.overrides) ? catalog.overrides : [],
  };
}

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function normKey(scheme, standard, name) {
  return `${String(scheme || 'isi').toLowerCase()}::${norm(standard)}::${norm(name)}`;
}

function rowIdentity(scheme, row) {
  if (scheme === 'crs') {
    return { scheme: 'crs', name: row[0] || '', standard: row[1] || '' };
  }
  return { scheme: 'isi', standard: row[0] || '', name: row[1] || '' };
}

function sameScheme(a, b) {
  return String(a || 'isi').toLowerCase() === String(b || 'isi').toLowerCase();
}

/**
 * Removal rules:
 * - scope "standard": hide every product under that scheme + IS number
 * - scope "product" (default when name present): hide one product (scheme + name, and standard when given)
 */
function matchesRemoval(identity, removed) {
  const std = norm(identity.standard);
  const name = norm(identity.name);
  return removed.some((r) => {
    if (!r || !sameScheme(r.scheme, identity.scheme)) return false;
    const rs = norm(r.standard);
    const rn = norm(r.name || r.product_name);
    const scope = r.scope || (rn ? 'product' : 'standard');

    if (scope === 'standard') {
      return Boolean(rs && std && rs === std);
    }

    if (rn && name && rn === name) {
      if (rs) return rs === std;
      return true;
    }
    return false;
  });
}

function findOverride(identity, overrides) {
  const std = norm(identity.standard);
  const name = norm(identity.name);
  const list = Array.isArray(overrides) ? overrides : [];

  const byId = list.find((o) => o && identity.id && o.id && o.id === identity.id);
  if (byId) return byId;

  const exact = list.find((o) => {
    if (!o || !sameScheme(o.scheme, identity.scheme)) return false;
    const os = norm(o.match_standard != null ? o.match_standard : o.standard);
    const on = norm(o.match_name || o.product_name || o.name);
    return os && on && os === std && on === name;
  });
  if (exact) return exact;

  return (
    list.find((o) => {
      if (!o || !sameScheme(o.scheme, identity.scheme)) return false;
      const on = norm(o.match_name || o.product_name || o.name);
      const os = norm(o.match_standard != null ? o.match_standard : o.standard);
      // Name-only match when match_standard was empty at save time
      if (on && name && on === name && (!os || os === std)) return true;
      return false;
    }) || null
  );
}

function applyOverrideToRow(scheme, row, override) {
  if (!override) return row;
  const next = row.slice();
  if (scheme === 'crs') {
    if (override.product_name || override.name) {
      next[0] = String(override.product_name || override.name);
    }
    if (override.standard != null && String(override.standard).trim() !== '') {
      next[1] = String(override.standard).trim();
    }
    if (override.test_lo != null && override.test_lo !== '') {
      next[8] = Number(override.test_lo) || 0;
    }
    if (override.test_hi != null && override.test_hi !== '') {
      next[9] = Number(override.test_hi) || 0;
    }
    if (override.labs != null && override.labs !== '') {
      next[10] = Number(override.labs) || 0;
    }
  } else {
    if (override.standard != null && String(override.standard).trim() !== '') {
      next[0] = String(override.standard).trim();
    }
    if (override.product_name || override.name) {
      next[1] = String(override.product_name || override.name);
    }
    if (override.test_lo != null && override.test_lo !== '') {
      next[11] = Number(override.test_lo) || 0;
    }
    if (override.test_hi != null && override.test_hi !== '') {
      next[12] = Number(override.test_hi) || 0;
    }
    if (override.labs != null && override.labs !== '') {
      next[13] = Number(override.labs) || 0;
    }
  }
  return next;
}

function parseBisDataFromHtml(html) {
  if (!html) return null;
  try {
    if (typeof html === 'string' && html.trim().startsWith('{')) {
      return JSON.parse(html);
    }
  } catch {
    /* fall through */
  }
  return null;
}

function listBuiltinProducts(data, { q = '', scheme = '', limit = 40 } = {}) {
  if (!data) return [];
  const query = norm(q);
  const schemeFilter = String(scheme || '').toLowerCase();
  const out = [];

  const push = (sch, row) => {
    if (schemeFilter && sch !== schemeFilter) return;
    const idn = rowIdentity(sch, row);
    const testLo = sch === 'crs' ? Number(row[8] || 0) : Number(row[11] || 0);
    const testHi = sch === 'crs' ? Number(row[9] || 0) : Number(row[12] || 0);
    const labs = sch === 'crs' ? Number(row[10] || 0) : Number(row[13] || 0);
    const hay = `${idn.name} ${idn.standard} ${row[3] || ''} ${row[2] || ''}`.toLowerCase();
    if (query && !hay.includes(query)) return;
    out.push({
      scheme: sch,
      name: idn.name,
      standard: idn.standard,
      test_lo: testLo,
      test_hi: testHi,
      labs,
      key: normKey(sch, idn.standard, idn.name),
    });
  };

  for (const row of Array.isArray(data.i) ? data.i : []) push('isi', row);
  for (const row of Array.isArray(data.r) ? data.r : []) push('crs', row);

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out.slice(0, Math.max(1, Number(limit) || 40));
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

  for (const name of catalog.categories) {
    const n = String(name || '').trim();
    if (n && !data.c.includes(n)) data.c.push(n);
  }

  data.i = data.i
    .filter((row) => !matchesRemoval(rowIdentity('isi', row), catalog.removed))
    .map((row) => {
      const idn = rowIdentity('isi', row);
      return applyOverrideToRow('isi', row, findOverride(idn, catalog.overrides));
    });

  data.r = data.r
    .filter((row) => !matchesRemoval(rowIdentity('crs', row), catalog.removed))
    .map((row) => {
      const idn = rowIdentity('crs', row);
      return applyOverrideToRow('crs', row, findOverride(idn, catalog.overrides));
    });

  for (const p of catalog.products) {
    if (!p || !p.name) continue;
    const scheme = (p.scheme || 'isi').toLowerCase();
    if (
      matchesRemoval(
        { scheme, standard: p.standard || '', name: p.name || '' },
        catalog.removed
      )
    ) {
      continue;
    }

    const category = String(p.category || '').trim();
    let catIdx = data.c.indexOf(category);
    if (catIdx < 0 && category) {
      data.c.push(category);
      catIdx = data.c.length - 1;
    }

    const patched = findOverride(
      { scheme, standard: p.standard || '', name: p.name || '', id: p.id },
      catalog.overrides
    );
    const eff = { ...p, ...(patched || {}) };

    if (scheme === 'crs') {
      data.r.unshift([
        String(eff.name || eff.product_name || p.name),
        String(eff.standard || p.standard || ''),
        String(eff.hsn4 || p.hsn4 || ''),
        String(eff.hsn8 || p.hsn8 || p.hsn4 || ''),
        Number(eff.order_idx || 0),
        Number(eff.fee_micro || 7000),
        Number(eff.fee_small || 14500),
        Number(eff.fee_large || 27000),
        Number(eff.test_lo || 0),
        Number(eff.test_hi || 0),
        Number(eff.labs || 0),
      ]);
    } else {
      data.i.unshift([
        String(eff.standard || p.standard || ''),
        String(eff.name || eff.product_name || p.name),
        catIdx < 0 ? 0 : catIdx,
        String(eff.hsn4 || p.hsn4 || ''),
        String(eff.hsn8 || p.hsn8 || p.hsn4 || ''),
        Number(eff.status ?? p.status ?? 0),
        Number(eff.order_idx || 0),
        Number(eff.fee_large || 46000),
        Number(eff.fee_medium || 37000),
        Number(eff.fee_small || 23000),
        Number(eff.fee_micro || 9200),
        Number(eff.test_lo || 0),
        Number(eff.test_hi || 0),
        Number(eff.labs || 0),
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
  listBuiltinProducts,
  parseBisDataFromHtml,
  matchesRemoval,
  findOverride,
  normKey,
  rowIdentity,
};
