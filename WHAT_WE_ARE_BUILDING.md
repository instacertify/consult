/**
 * WHAT WE ARE BUILDING
 * ====================
 *
 * Domain: consult.instacertify.com
 *
 * Public site (SEO + fast):
 *   /                        Hub — customer path chooser (BIS / LMPC / MSDS + more)
 *   /bis-certification       Original BIS landing (adapted)
 *   /lmpc-certificate        Original LMPC landing (adapted)
 *   /msds-certificate        Original MSDS landing (adapted)
 *   /p/:slug                 Any extra HTML page uploaded via admin
 *   /sitemap.xml /robots.txt SEO helpers
 *
 * Simple backend CMS (/admin):
 *   • Edit site settings, footer, phone, WhatsApp, email
 *   • Edit each page: title, meta, hero, URLs/slugs, robots, dropdown options
 *   • Upload a standalone HTML landing → auto-adapted into the site
 *   • Change page URL/slug and enable/disable pages
 *   • View all form leads collected from the site
 *
 * Lead pipeline:
 *   Form POST → saved in SQLite admin → emailed to contact@instacertify.com
 *   Compatible endpoints: /api/leads, /bis-submit, /lmpc-submit, /msds-submit
 *
 * HTML adapter (on serve + on upload):
 *   Injects form → /api/leads, rewrites canonical/phone/footer from CMS,
 *   adds hub link, forces SEO robots when configured, caches result.
 */
