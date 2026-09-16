require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDb, setSetting, getSetting } = require('../src/db');

const PAGES_DIR = path.join(__dirname, '..', 'content', 'pages');

const DEFAULT_FOOTER = {
  company: 'Instacertify Labs Private Limited',
  address: 'PK-01, Sector 63A, Noida, Uttar Pradesh 201301, India',
  cin: 'CIN U74999UP2022PTC170291',
  phone: '+91 99991 18039',
  phoneHref: 'tel:+919999118039',
  email: 'contact@instacertify.com',
  offices: ['Noida, Delhi NCR', 'Vadodara, Gujarat', 'Kalyan, Maharashtra'],
  alsoHandles:
    'Also handle: CDSCO, EPR, WPC, TEC, ISI, CRS, FMCS, Scheme X, Legal Metrology, MSDS / SDS',
  policies: [
    { label: 'Privacy Policy', href: 'https://instacertify.com/privacy-policy' },
    { label: 'Terms of Service', href: 'https://instacertify.com/terms-of-service' },
    { label: 'Refund Policy', href: 'https://instacertify.com/refund-policy' },
  ],
  legal:
    'Instacertify Labs Private Limited is a private compliance consultancy. We are not a government department. Licences and registrations are granted solely by the competent authority. Information on this site is general guidance and is not legal advice. © 2026 Instacertify Labs Private Limited.',
};

const DEFAULT_SITE = {
  brandName: 'Instacertify',
  brandTagline: 'Certifications made simple',
  baseUrl: process.env.BASE_URL || 'https://consult.instacertify.com',
  hubTitle: 'Choose your certification path',
  hubDescription:
    'Pick the compliance path that matches your product — BIS, LMPC, MSDS, IMEI, EPR, IP, EMC, or G-Mark. Fast quotes from Instacertify.',
  hubEyebrow: 'Instacertify Consult',
  hubSupport:
    'Not sure which path you need? Call us and we will map it in one conversation.',
  whatsappNumber: '919999118039',
  defaultPhone: '+91 99991 18039',
  defaultPhoneHref: 'tel:+919999118039',
  leadEmail: 'contact@instacertify.com',
  googleAdsId: 'AW-XXXXXXXXX',
  gtmId: '',
  gaId: '',
  customHeadHtml: '',
  customBodyHtml: '',
  robotsDefault: 'index, follow',
};

const SEED_PAGES = [
  {
    slug: 'bis-certification',
    title: 'BIS Certification | ISI, CRS & FMCS | Instacertify',
    meta_description:
      'Check if your product needs BIS. Search by name, IS number or HSN, then get a clear quote for ISI, CRS or FMCS.',
    canonical_path: '/bis-certification',
    robots: 'index, follow',
    og_title: 'BIS Certification | Instacertify',
    og_description:
      'Free product checker for BIS. See if ISI or CRS applies, then request a detailed quote.',
    hero_h1: 'BIS certification— ISI, CRS, FMCS & Scheme X.',
    hero_lede: '',
    form_heading: 'Get your BIS quote',
    whatsapp_text: 'Hi, I need BIS certification help.',
    phone: '+91 99991 18039',
    role_options: [
      "In India — I'm the manufacturer",
      "Outside India — I'm the manufacturer",
      "Outside India — I'm the Indian importer",
      "I'm a brand owner, made by a third party",
      'Not sure — please advise',
    ],
    enabled: 1,
    sort_order: 1,
    hub_label: 'BIS Certification',
    hub_blurb:
      'ISI, CRS, FMCS & Scheme X — free product checker and end-to-end filing.',
    hub_badge: 'Most searched',
    source_file: 'bis-certification.html',
    source_type: 'seed',
  },
  {
    slug: 'lmpc-certificate',
    title: 'LMPC Certificate in 1 Working Day | Instacertify',
    meta_description:
      'Get your LMPC certificate in about one working day. One Legal Metrology registration for importers, manufacturers and packers across India.',
    canonical_path: '/lmpc-certificate',
    robots: 'index, follow',
    og_title: 'LMPC Certificate | Instacertify',
    og_description: 'Legal Metrology (LMPC) registration, typically in one working day.',
    hero_h1: 'LMPC certificate & Legal Metrology registration— typically in 1 working day.',
    hero_lede: '',
    form_heading: 'Get your LMPC quote',
    whatsapp_text: 'Hi, I need an LMPC certificate.',
    phone: '+91 99991 18039',
    role_options: [
      'Importer of pre-packaged goods',
      'Manufacturer',
      'Packer / repacker',
      'E-commerce seller / marketplace brand',
      'Dealer or repairer of weighing instruments',
      'Not sure — please advise',
    ],
    enabled: 1,
    sort_order: 2,
    hub_label: 'LMPC Certificate',
    hub_blurb:
      'Legal Metrology registration — typically 1 working day, clear all-inclusive pricing.',
    hub_badge: '1 working day',
    source_file: 'lmpc-certificate.html',
    source_type: 'seed',
  },
  {
    slug: 'msds-certificate',
    title: 'MSDS / SDS Certificate in 24 Hours | Instacertify',
    meta_description:
      'Need an MSDS for shipping or marketplace listings? We prepare a full 16-section GHS Safety Data Sheet within 24 hours.',
    canonical_path: '/msds-certificate',
    robots: 'index, follow',
    og_title: 'MSDS Certificate | Instacertify',
    og_description: 'Full GHS Safety Data Sheet (MSDS) prepared within 24 hours.',
    hero_h1: 'MSDS certificate— shipping-ready in 24 hours.',
    hero_lede: '',
    form_heading: 'Get your MSDS quote',
    whatsapp_text: 'Hi, I need an MSDS / SDS certificate.',
    phone: '+91 99991 18039',
    role_options: [
      'Export shipment — buyer or forwarder asked for it',
      'Selling on Amazon, Flipkart or another marketplace',
      'A buyer has asked for it',
      'Shipping — courier, airline or transporter asked',
      'Import into India',
      'Single substance',
      'Mixture or formulation',
      'Updating or correcting an existing SDS',
      'Batteries / UN 38.3 related',
      'Not sure — please advise',
    ],
    enabled: 1,
    sort_order: 3,
    hub_label: 'MSDS / SDS',
    hub_blurb:
      'Full 16-section GHS Safety Data Sheet — shipping-ready, typically in 24 hours.',
    hub_badge: '24 hours',
    source_file: 'msds-certificate.html',
    source_type: 'seed',
  },
  {
    slug: 'imei-icdr',
    title: 'IMEI ICDR & TAC Allocation | Instacertify',
    meta_description:
      'IMEI ICDR registration for importers and manufacturers, plus GSMA brand registration and TAC allocation. Clear mapping of which path you need.',
    canonical_path: '/imei-icdr',
    robots: 'index, follow',
    og_title: 'IMEI ICDR & TAC | Instacertify',
    og_description:
      'ICDR compliance and TAC allocation for devices with IMEI numbers — importers and manufacturers.',
    hero_h1: 'IMEI ICDR compliance & TAC allocation— for device makers and importers.',
    hero_lede: '',
    form_heading: 'Get your ICDR / TAC quote',
    whatsapp_text: 'Hi, I need IMEI ICDR / TAC help.',
    phone: '+91 99991 18039',
    role_options: [
      'ICDR registration — importing devices with IMEIs',
      'ICDR registration — manufacturing and selling in India',
      'Own IMEI numbers — brand registration and TAC',
      'Brand name approval with GSMA',
      'Both — TAC and ICDR',
      'Additional TAC for a new model or variant',
      'An application has been rejected or queried',
      'Not sure — please advise',
    ],
    enabled: 1,
    sort_order: 4,
    hub_label: 'IMEI ICDR & TAC',
    hub_blurb:
      'ICDR registration for Indian networks, plus GSMA brand / TAC allocation for new IMEIs.',
    hub_badge: 'Devices',
    source_file: 'imei-icdr.html',
    source_type: 'seed',
  },
  {
    slug: 'epr-registration',
    title: 'EPR Registration & Annual Compliance | Instacertify',
    meta_description:
      'EPR registration with CPCB for plastic, e-waste, battery, used oil and waste tyre — plus annual returns and ongoing compliance.',
    canonical_path: '/epr-registration',
    robots: 'index, follow',
    og_title: 'EPR Registration | Instacertify',
    og_description:
      'Plastic, e-waste, battery, used oil and tyre EPR — filed right, with annual returns handled.',
    hero_h1: 'EPR registration— filed right, and kept right after that.',
    hero_lede: '',
    form_heading: 'Get your EPR quote',
    whatsapp_text: 'Hi, I need EPR registration help.',
    phone: '+91 99991 18039',
    role_options: [
      'EPR — Plastic packaging',
      'EPR — E-waste',
      'EPR — Battery waste',
      'EPR — Used oil',
      'EPR — Waste tyre',
      'More than one category',
      'Annual return or renewal only',
      'Registration done wrong — need it corrected',
      'Not sure — please advise',
    ],
    enabled: 1,
    sort_order: 5,
    hub_label: 'EPR Registration',
    hub_blurb:
      'Plastic, e-waste, battery, oil & tyre EPR with CPCB — registration plus annual compliance.',
    hub_badge: 'CPCB',
    source_file: 'epr-registration.html',
    source_type: 'seed',
  },
  {
    slug: 'ip-testing',
    title: 'IP Testing IEC 60529 — IP65, IP67, IP68, IP 69K | Instacertify',
    meta_description:
      'Ingress protection testing to IEC 60529 — dust and water ratings including IP 69K. Right rating, NABL / BIS-recognised labs, design review before samples.',
    canonical_path: '/ip-testing',
    robots: 'index, follow',
    og_title: 'IP Testing to IEC 60529 | Instacertify',
    og_description:
      'IP65–IP68 and IP 69K testing booked at labs that can run the method. Free rating guidance before samples ship.',
    hero_h1: 'IP testing to IEC 60529— booked at the lab that can actually run it.',
    hero_lede: '',
    form_heading: 'Get your IP testing quote',
    whatsapp_text: 'Hi, I need IP testing / IEC 60529 help.',
    phone: '+91 99991 18039',
    role_options: [
      'Not sure — advise me',
      'IP54',
      'IP55',
      'IP65',
      'IP66',
      'IP67',
      'IP68',
      'IP 69K',
      'IPX4 only',
      'Other / specified by my buyer',
    ],
    enabled: 1,
    sort_order: 6,
    hub_label: 'IP Testing',
    hub_blurb:
      'IEC 60529 ingress testing — IP65 to IP 69K at labs that can run the method.',
    hub_badge: 'IEC 60529',
    source_file: 'ip-testing.html',
    source_type: 'seed',
  },
  {
    slug: 'emc-testing',
    title: 'EMI & EMC Testing — CISPR & IEC 61000 | Instacertify',
    meta_description:
      'EMI and EMC testing for electronics, appliances, lighting, EV, telecom and industrial gear. Emission and immunity to CISPR and IEC 61000 at NABL / TEC labs.',
    canonical_path: '/emc-testing',
    robots: 'index, follow',
    og_title: 'EMI & EMC Testing — Right Standard, Right Lab | Instacertify',
    og_description:
      'Find the EMC standard your product gets tested to, then plan emission and immunity at a lab with that scope.',
    hero_h1: 'EMI & EMC testing— planned properly, so you pay for one campaign.',
    hero_lede: '',
    form_heading: 'Get your EMC test plan',
    whatsapp_text: 'Hi, I need EMI / EMC testing help.',
    phone: '+91 99991 18039',
    role_options: [
      'India only',
      'India and export',
      'European Union',
      'United States',
      'United Kingdom',
      'Gulf / GCC',
      'Several — not sure yet',
    ],
    enabled: 1,
    sort_order: 7,
    hub_label: 'EMC Testing',
    hub_blurb:
      'EMI / EMC emission & immunity — CISPR and IEC 61000 at NABL / TEC labs.',
    hub_badge: 'CISPR / IEC',
    source_file: 'emc-testing.html',
    source_type: 'seed',
  },
  {
    slug: 'gmark-certification',
    title: 'G-Mark Certification for the GCC | Gulf Conformity Mark | Instacertify',
    meta_description:
      'G-Mark for low voltage equipment, appliances and toys across the GCC — plus SABER and ECAS registration each country wants on top.',
    canonical_path: '/gmark-certification',
    robots: 'index, follow',
    og_title: 'G-Mark Certification — and What Each Gulf State Wants On Top',
    og_description:
      'G-Mark does not get goods through Saudi customs alone. Check what your product needs for each Gulf market before you ship.',
    hero_h1: 'G-Mark certification— and everything the destination asks for after it.',
    hero_lede: '',
    form_heading: 'Get your Gulf market quote',
    whatsapp_text: 'Hi, I need G-Mark / Gulf conformity help.',
    phone: '+91 99991 18039',
    role_options: [
      'Saudi Arabia',
      'United Arab Emirates',
      'Kuwait',
      'Qatar',
      'Bahrain',
      'Oman',
      'All GCC states',
      'Not decided yet',
    ],
    enabled: 1,
    sort_order: 8,
    hub_label: 'G-Mark',
    hub_blurb:
      'Gulf Conformity Mark for LVE, appliances and toys — plus SABER / ECAS where needed.',
    hub_badge: 'GCC',
    source_file: 'gmark-certification.html',
    source_type: 'seed',
  },
];

function seed({ force = false } = {}) {
  const db = getDb();

  if (!getSetting('site')) setSetting('site', DEFAULT_SITE);
  if (!getSetting('footer')) setSetting('footer', DEFAULT_FOOTER);

  const existing = db.prepare('SELECT COUNT(*) AS c FROM pages').get().c;
  const insert = db.prepare(`
    INSERT INTO pages (
      slug, title, meta_description, canonical_path, robots, og_title, og_description,
      hero_h1, hero_lede, form_heading, whatsapp_text, phone, role_options,
      enabled, sort_order, hub_label, hub_blurb, hub_badge, source_file, source_type
    ) VALUES (
      @slug, @title, @meta_description, @canonical_path, @robots, @og_title, @og_description,
      @hero_h1, @hero_lede, @form_heading, @whatsapp_text, @phone, @role_options,
      @enabled, @sort_order, @hub_label, @hub_blurb, @hub_badge, @source_file, @source_type
    )
    ON CONFLICT(slug) DO NOTHING
  `);

  const tx = db.transaction((pages) => {
    let added = 0;
    for (const p of pages) {
      const filePath = path.join(PAGES_DIR, p.source_file);
      if (!fs.existsSync(filePath)) {
        console.warn('Missing page file:', filePath);
        continue;
      }
      const info = insert.run({
        ...p,
        role_options: JSON.stringify(p.role_options),
      });
      if (info.changes) added += 1;
    }
    return added;
  });

  if (existing > 0 && !force) {
    const added = tx(SEED_PAGES);
    console.log(
      'Pages already present (' + existing + ') — inserted ' + added + ' missing seed page(s)'
    );
  } else {
    const added = tx(SEED_PAGES);
    console.log('Seeded settings +', added, 'pages');
  }

  // Soft-refresh SEO copy once so existing DBs drop keyword-stuffed / test metas
  if (getSetting('seo_human_v1') !== true) {
    const upd = db.prepare(
      `UPDATE pages SET title = ?, meta_description = ?, og_title = ?, og_description = ?, hub_blurb = ?, updated_at = datetime('now')
       WHERE slug = ? AND source_type = 'seed'`
    );
    for (const p of SEED_PAGES) {
      upd.run(
        p.title,
        p.meta_description,
        p.og_title,
        p.og_description,
        p.hub_blurb,
        p.slug
      );
    }
    setSetting('seo_human_v1', true);
    console.log('Applied human SEO copy (seo_human_v1)');
  }

  // Keep hub directory copy in sync when new landings are added
  if (getSetting('hub_desc_ip_v1') !== true) {
    const site = getSetting('site') || {};
    setSetting('site', {
      ...site,
      hubDescription: DEFAULT_SITE.hubDescription,
    });
    setSetting('hub_desc_ip_v1', true);
    console.log('Updated hub description for IP testing (hub_desc_ip_v1)');
  }

  if (getSetting('hub_desc_emc_v1') !== true) {
    const site = getSetting('site') || {};
    setSetting('site', {
      ...site,
      hubDescription: DEFAULT_SITE.hubDescription,
    });
    setSetting('hub_desc_emc_v1', true);
    console.log('Updated hub description for EMC testing (hub_desc_emc_v1)');
  }

  if (getSetting('hub_desc_gmark_v1') !== true) {
    const site = getSetting('site') || {};
    setSetting('site', {
      ...site,
      hubDescription: DEFAULT_SITE.hubDescription,
    });
    setSetting('hub_desc_gmark_v1', true);
    console.log('Updated hub description for G-Mark (hub_desc_gmark_v1)');
  }

  // Seed editable page visuals into content_json when empty (admin Page visuals)
  try {
    const {
      extractPageMetaFromHtml,
    } = require('../src/services/htmlAdapter');
    const { applyPageVisualDefaults } = require('../src/services/contentEditor');
    const rows = db.prepare(`SELECT id, slug, source_file, content_json FROM pages WHERE source_type = 'seed'`).all();
    const updJson = db.prepare(
      `UPDATE pages SET content_json = ?, updated_at = datetime('now') WHERE id = ?`
    );
    for (const row of rows) {
      let existing = {};
      try {
        existing = JSON.parse(row.content_json || '{}') || {};
      } catch {
        existing = {};
      }
      const hasVisuals =
        String(existing.hero_bg_url || '').trim() &&
        (existing.about || existing.about_bis) &&
        Array.isArray(existing.scheme_visuals) &&
        existing.scheme_visuals.length;
      if (hasVisuals) continue;
      const filePath = path.join(PAGES_DIR, row.source_file || `${row.slug}.html`);
      if (!fs.existsSync(filePath)) continue;
      const html = fs.readFileSync(filePath, 'utf8');
      const meta = extractPageMetaFromHtml(html, row.slug);
      const content = applyPageVisualDefaults(
        { ...(meta.content_json || {}), ...existing },
        row.slug
      );
      updJson.run(JSON.stringify(content), row.id);
    }
  } catch (err) {
    console.warn('content_json seed note:', err.message);
  }
}

if (require.main === module) {
  seed({ force: process.argv.includes('--force') });
}

module.exports = { seed };
