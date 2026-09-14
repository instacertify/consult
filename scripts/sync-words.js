/**
 * Reload editable words from each page's HTML source into the CMS DB.
 */
require('dotenv').config();
const { listPages, updatePage } = require('../src/services/pages');
const { extractPageMetaFromHtml, readSourceHtml, clearPageCache } = require('../src/services/htmlAdapter');

const pages = listPages();
for (const page of pages) {
  try {
    const html = readSourceHtml(page);
    const meta = extractPageMetaFromHtml(html, page.slug);
    updatePage(page.id, {
      // keep existing title if already customized with CMS marker? Always sync from HTML on this script.
      title: page.title && page.title.includes('Updated meta') ? page.title : meta.title,
      meta_description:
        page.meta_description && page.meta_description.includes('Updated meta')
          ? page.meta_description
          : meta.meta_description,
      hero_h1: page.hero_h1 && page.hero_h1.includes('updated from CMS') ? page.hero_h1 : meta.hero_h1,
      hero_lede: meta.hero_lede,
      form_heading: meta.form_heading || page.form_heading,
      role_options: meta.role_options.length ? meta.role_options : JSON.parse(page.role_options || '[]'),
      content_json: meta.content_json,
      og_title: meta.og_title,
      og_description: meta.og_description,
    });
    console.log('Synced words:', page.slug, 'sections=', (meta.content_json.sections || []).length);
  } catch (err) {
    console.error('Failed', page.slug, err.message);
  }
}
clearPageCache();
console.log('Done');
