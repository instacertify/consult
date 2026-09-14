# What we are building

Domain: **consult.instacertify.com**

## Independent landing pages (not merged)

BIS, LMPC and MSDS stay **separate landings**, each with its own URL and content:

- `/bis-certification`
- `/lmpc-certificate`
- `/msds-certificate`
- plus any HTML you upload later (own URL)

The home `/` is only a **directory / chooser** that links to those pages. It does **not** merge their content into one page.

## Backend (`/admin`)

- Lists every independent landing
- Shows the **full URL** for each page
- **Open page** and **Edit URL & words** for each
- Editable per page: URL path, SEO title/description, H1, hero paragraphs, section headings, form heading, role dropdown options
- Shared footer / logo / phone settings
- Upload another standalone HTML → becomes a new independent URL
- Leads stored + emailed to `contact@instacertify.com`

## Lead endpoints

`/api/leads`, `/bis-submit`, `/lmpc-submit`, `/msds-submit`
