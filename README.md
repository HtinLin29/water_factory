# Water Factory Tracker

Next.js 14 app for inventory, driver dispatch, factory sales (with credit tracking), and reports. Database and auth live in Supabase.

## Vercel deploy

Set these **Environment Variables** in the Vercel project (Settings → Environment Variables):

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `CRON_SECRET` | Yes (for nightly data cleanup cron) |
| `SETUP_ENABLED` | `false` in production |

Push to GitHub and import the repo in Vercel. Build command: `npm run build`. No SQL files are bundled — schema is already in your Supabase project.

## Local dev

```bash
npm install
# Create .env.local with the same variables as above
npm run dev
```

## Tech stack

Next.js 14 · React 18 · TailwindCSS · Supabase · Vercel Cron
