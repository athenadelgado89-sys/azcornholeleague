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
