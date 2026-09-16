# Instacertify Consult (`consult.instacertify.com`)

Merged SEO-friendly certification site from the BIS, LMPC and MSDS landings, plus a simple CMS backend.

Read **[WHAT_WE_ARE_BUILDING.md](./WHAT_WE_ARE_BUILDING.md)** for the product map.  
Read **[GMAIL_SETUP.md](./GMAIL_SETUP.md)** for Google Workspace mail configuration.

## Quick start

```bash
cp .env.example .env
npm install
npm run seed
npm start
```

- Site: http://localhost:3000  
- Admin: http://localhost:3000/admin — **one** login unlocks **all** page editors.

### Admin login

Defaults (from `.env.example` / code if env unset):

- **Login ID:** `admin`
- **Password:** `change-me-admin`
- **Captcha:** type the sum result shown on the form

Production uses whatever you set as `ADMIN_USERNAME` / `ADMIN_PASSWORD` on the host. On boot the app syncs those env values into the DB so they stay in sync after deploys.

To force-reset:

```bash
# in .env: ADMIN_RESET_CREDENTIALS=1   (then restart once and remove the flag)
# or:
node scripts/reset-admin.js
```

## Public routes

| URL | Purpose |
|-----|---------|
| `/` | Hub — customer path chooser (dropdown + cards) |
| `/bis-certification` | BIS landing (adapted) |
| `/lmpc-certificate` | LMPC landing (adapted) |
| `/msds-certificate` | MSDS landing (adapted) |
| `/p/:slug` | Alias for any page |
| `/sitemap.xml` `/robots.txt` | SEO |

## Admin CMS

- Edit hub copy, footer, phone, WhatsApp, email
- Edit each page: SEO, H1, form heading, **role dropdown options**, slug/URL, enable/disable
- **Upload HTML** → auto-adapted into the site (SEO extracted, form wired to leads, added to hub)
- View all collected leads

## Leads

Forms POST to `/api/leads` (also `/bis-submit`, `/lmpc-submit`, `/msds-submit`).  
Each lead is stored in SQLite and emailed to `contact@instacertify.com` when SMTP is configured.

## Deploy on subdomain

1. Build/host Node 18+ with `npm start`
2. Set env vars (see `.env.example` + `GMAIL_SETUP.md`)
3. Point `consult.instacertify.com` to the host
4. Put TLS terminator (Caddy/Nginx/Cloudflare) in front
5. Set `BASE_URL=https://consult.instacertify.com`
