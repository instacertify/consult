# Gmail / Google Workspace setup for lead emails

Leads from consult forms are:

1. Saved in the Admin → Leads database
2. Emailed to **contact@instacertify.com** (configurable)

Because `contact@instacertify.com` is on **Google Workspace / Gmail**, use an **App Password** (recommended) or SMTP relay.

## Option A — App Password (recommended)

1. Sign in to Google Admin / the mailbox as `contact@instacertify.com`
2. Turn on **2-Step Verification** for that user  
   https://myaccount.google.com/signinoptions/two-step-verification
3. Create an **App Password**  
   https://myaccount.google.com/apppasswords  
   - App: Mail  
   - Device: Other → `consult.instacertify.com`
4. Copy the 16-character password
5. Set environment variables on the host:

```bash
EMAIL_ENABLED=true
LEAD_TO_EMAIL=contact@instacertify.com
LEAD_FROM_EMAIL=contact@instacertify.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contact@instacertify.com
SMTP_PASS=xxxx xxxx xxxx xxxx
```

6. Restart the Node app
7. Submit a test form on any path page — check:
   - Inbox of `contact@instacertify.com`
   - Admin → Leads (`email_sent = Yes`)

### If App Passwords are blocked by Workspace policy

Ask a Google Workspace admin to allow App Passwords for this user, **or** use Option B.

## Option B — Google Workspace SMTP relay

1. In Google Admin → Apps → Google Workspace → Gmail → **Routing** → SMTP relay
2. Allow the server IP (or require auth)
3. Point env to the relay host Google provides (often `smtp-relay.gmail.com`)

## Option C — OAuth2 (advanced)

Possible with Nodemailer + Google OAuth refresh token. Not required if App Passwords work.

## Local / staging without mail

```bash
EMAIL_ENABLED=false
```

Leads are still collected in the CMS backend.

## DNS note for subdomain

Point `consult.instacertify.com` A/CNAME to your host. No special MX change is required for *sending* via SMTP as `contact@…` if you authenticate as that mailbox. For best deliverability, ensure SPF/DKIM for the Workspace domain already include Google (default for Workspace).
