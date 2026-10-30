# Arizona Cornhole League website

The site at **azcornholeleague.com**: club directory, vendor directory and the AZ Events calendar.

- `index.html`, `app.js`: the public site
- `admin.html`, `admin.js`: the admin review page (azcornholeleague.com/admin.html)
- `styles.css`, `common.js`: shared styles and helpers
- `config.js`: the Supabase project URL and public (anon) key
- `supabase/setup.sql`: the database setup, run once in the Supabase SQL Editor
- `assets/`: logo files

Hosting: GitHub Pages (from the `main` branch). Data and uploads: Supabase.
Submissions from clubs, vendors and directors stay hidden until an admin approves them.

## Scoreholio import
`scripts/sync-scoreholio.mjs` runs every hour on GitHub Actions (`.github/workflows/sync-scoreholio.yml`).
It finds public cornhole tournaments in Arizona through the Scoreholio API and adds those from
organizers linked to a club (Admin → Scoreholio tab) to AZ Events.
Setup: run `supabase/02-scoreholio.sql` once, then add repository secrets `SCOREHOLIO_API_KEY`,
`SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Settings → Secrets and variables → Actions).
Neither key may ever go in the website files.
