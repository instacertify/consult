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
    'Pick the compliance path that matches your product — BIS, LMPC / Legal Metrology, or MSDS / GHS Safety Data Sheets. Fast quotes from Instacertify.',
  hubEyebrow: 'Instacertify Consult',
  hubSupport:
    'Not sure which path you need? Call us and we will map it in one conversation.',
  whatsappNumber: '919999118039',
  defaultPhone: '+91 99991 18039',
  defaultPhoneHref: 'tel:+919999118039',
  leadEmail: 'contact@instacertify.com',
  googleAdsId: 'AW-XXXXXXXXX',
  robotsDefault: 'index, follow',
};

const SEED_PAGES = [
  {
    slug: 'bis-certification',
    title:
      'BIS Certification — ISI, CRS, FMCS & Scheme X | Free Product Checker | Instacertify',
    meta_description:
      'Check free whether your product needs BIS certification. Search 1,682 Indian Standards by product, IS number or HSN code and see QCO status and BIS marking fees. ISI, CRS, FMCS and Scheme X handled end to end.',
    canonical_path: '/bis-certification',
    robots: 'index, follow',
    og_title: 'BIS Certification — Free Product Checker | ISI, CRS, FMCS, Scheme X',
    og_description:
      'Search 1,682 Indian Standards by product, IS number or HSN code. See QCO status and real BIS marking fees before you pay anyone.',
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
    title: 'LMPC Certificate in 1 Working Day | ₹3,999 All-Inclusive | Instacertify',
    meta_description:
      'LMPC certificate and Legal Metrology registration for importers, manufacturers and packers — typically issued within 1 working day. ₹3,999 all inclusive.',
    canonical_path: '/lmpc-certificate',
    robots: 'index, follow',
    og_title: 'LMPC Certificate in 1 Working Day | Instacertify',
    og_description:
      'Legal Metrology / LMPC registration typically in 1 working day. Transparent ₹3,999 all-inclusive pricing.',
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
    title: 'MSDS Certificate | GHS Safety Data Sheet in 24 Hours | Instacertify',
    meta_description:
      'MSDS certificate for export, shipping, buyer requirements and Amazon or Flipkart listings. Full 16-section GHS Safety Data Sheet in 24 hours, from ₹2,999.',
    canonical_path: '/msds-certificate',
    robots: 'index, follow',
    og_title: 'MSDS / GHS Safety Data Sheet in 24 Hours | Instacertify',
    og_description:
      'Full 16-section GHS SDS for export, shipping and marketplaces — typically in 24 hours.',
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
];

function seed({ force = false } = {}) {
  const db = getDb();

  if (!getSetting('site')) setSetting('site', DEFAULT_SITE);
  if (!getSetting('footer')) setSetting('footer', DEFAULT_FOOTER);

  const existing = db.prepare('SELECT COUNT(*) AS c FROM pages').get().c;
  if (existing > 0 && !force) {
    console.log('Pages already seeded (' + existing + ') — skipping page insert');
    return;
  }

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
    for (const p of pages) {
      const filePath = path.join(PAGES_DIR, p.source_file);
      if (!fs.existsSync(filePath)) {
        console.warn('Missing page file:', filePath);
        continue;
      }
      insert.run({
        ...p,
        role_options: JSON.stringify(p.role_options),
      });
    }
  });

  tx(SEED_PAGES);
  console.log('Seeded settings +', SEED_PAGES.length, 'pages');
}

if (require.main === module) {
  seed({ force: process.argv.includes('--force') });
}

module.exports = { seed };
