const { getDb } = require('../db');
const { clearPageCache } = require('./htmlAdapter');

function listPages({ enabledOnly = false } = {}) {
  const sql = enabledOnly
    ? `SELECT * FROM pages WHERE enabled = 1 ORDER BY sort_order ASC, id ASC`
    : `SELECT * FROM pages ORDER BY sort_order ASC, id ASC`;
  return getDb().prepare(sql).all();
}

function getPageBySlug(slug) {
  return getDb().prepare('SELECT * FROM pages WHERE slug = ?').get(slug);
}

function getPageById(id) {
  return getDb().prepare('SELECT * FROM pages WHERE id = ?').get(id);
}

function updatePage(id, fields) {
  const allowed = [
    'slug',
    'title',
    'meta_description',
    'canonical_path',
    'robots',
    'og_title',
    'og_description',
    'hero_h1',
    'hero_lede',
    'form_heading',
    'whatsapp_text',
    'phone',
    'role_options',
    'enabled',
    'sort_order',
    'hub_label',
    'hub_blurb',
    'hub_badge',
    'source_file',
    'source_type',
    'content_json',
  ];

  const sets = [];
  const params = { id };
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] =
      key === 'role_options' || key === 'content_json'
        ? typeof fields[key] === 'string'
          ? fields[key]
          : JSON.stringify(fields[key])
        : fields[key];
  }
  if (!sets.length) return getPageById(id);

  sets.push(`updated_at = datetime('now')`);
  getDb()
    .prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = @id`)
    .run(params);

  const page = getPageById(id);
  clearPageCache(page?.slug);
  clearPageCache(fields.slug);
  return page;
}

function createPage(fields) {
  const info = getDb()
    .prepare(
      `INSERT INTO pages (
        slug, title, meta_description, canonical_path, robots, og_title, og_description,
        hero_h1, hero_lede, form_heading, whatsapp_text, phone, role_options,
        enabled, sort_order, hub_label, hub_blurb, hub_badge, source_file, source_type, content_json
      ) VALUES (
        @slug, @title, @meta_description, @canonical_path, @robots, @og_title, @og_description,
        @hero_h1, @hero_lede, @form_heading, @whatsapp_text, @phone, @role_options,
        @enabled, @sort_order, @hub_label, @hub_blurb, @hub_badge, @source_file, @source_type, @content_json
      )`
    )
    .run({
      slug: fields.slug,
      title: fields.title || fields.slug,
      meta_description: fields.meta_description || '',
      canonical_path: fields.canonical_path || `/${fields.slug}`,
      robots: fields.robots || 'index, follow',
      og_title: fields.og_title || fields.title || '',
      og_description: fields.og_description || fields.meta_description || '',
      hero_h1: fields.hero_h1 || '',
      hero_lede: fields.hero_lede || '',
      form_heading: fields.form_heading || '',
      whatsapp_text: fields.whatsapp_text || 'Hi, I need certification help.',
      phone: fields.phone || '+91 99991 18039',
      role_options: JSON.stringify(fields.role_options || []),
      enabled: fields.enabled ?? 1,
      sort_order: fields.sort_order ?? 99,
      hub_label: fields.hub_label || fields.title || fields.slug,
      hub_blurb: fields.hub_blurb || '',
      hub_badge: fields.hub_badge || 'New',
      source_file: fields.source_file,
      source_type: fields.source_type || 'upload',
      content_json: JSON.stringify(fields.content_json || {}),
    });
  return getPageById(info.lastInsertRowid);
}

function deletePage(id) {
  const page = getPageById(id);
  getDb().prepare('DELETE FROM pages WHERE id = ?').run(id);
  if (page) clearPageCache(page.slug);
}

function createLead(data) {
  const nowIso = data.submitted_at || new Date().toISOString();
  const info = getDb()
    .prepare(
      `INSERT INTO leads (
        page_slug, name, email, country_code, phone, role, product, consent,
        raw_json, ip, user_agent, created_at
      ) VALUES (
        @page_slug, @name, @email, @country_code, @phone, @role, @product, @consent,
        @raw_json, @ip, @user_agent, @created_at
      )`
    )
    .run({
      page_slug: data.page_slug || '',
      name: data.name || '',
      email: data.email || '',
      country_code: data.country_code || '',
      phone: data.phone || '',
      role: data.role || '',
      product: data.product || '',
      consent: data.consent ? 1 : 0,
      raw_json: JSON.stringify(data.raw || data),
      ip: data.ip || '',
      user_agent: data.user_agent || '',
      created_at: nowIso,
    });
  return getDb().prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid);
}

function markLeadEmail(id, { sent, error }) {
  getDb()
    .prepare(
      `UPDATE leads SET email_sent = ?, email_error = ? WHERE id = ?`
    )
    .run(sent ? 1 : 0, error || null, id);
}

function listLeads(limit = 200) {
  return getDb()
    .prepare('SELECT * FROM leads ORDER BY id DESC LIMIT ?')
    .all(limit);
}

module.exports = {
  listPages,
  getPageBySlug,
  getPageById,
  updatePage,
  createPage,
  deletePage,
  createLead,
  markLeadEmail,
  listLeads,
};
