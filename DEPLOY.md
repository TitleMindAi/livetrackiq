# LiveTrackIQ — Deployment Guide

## Prerequisites
- Node.js 18+ installed
- Cloudflare account (wrangler CLI authenticated: `npx wrangler login`)
- Google Cloud Console project for OAuth

## Step 1: Install Dependencies
```bash
cd livetrackiq
npm install
```

## Step 2: Create D1 Database
```bash
npx wrangler d1 create livetrackiq-prod
```
Copy the returned `database_id` into `wrangler.toml` (replace `PLACEHOLDER`).

## Step 3: Apply Database Schema
```bash
# Local testing
npm run db:init:local

# Production
npm run db:init
```

## Step 4: Set Up Google OAuth
1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Set Authorized redirect URI: `https://livetrackiq.com/api/auth/callback`
4. Copy Client ID and Client Secret

```bash
# Set environment variables in wrangler.toml:
# GOOGLE_CLIENT_ID = "your-client-id"
# GOOGLE_REDIRECT_URI = "https://livetrackiq.com/api/auth/callback"

# Set the secret:
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

## Step 5: Connect Domain
1. In Cloudflare Dashboard → Workers & Pages → livetrackiq
2. Settings → Custom Domains → Add `livetrackiq.com`
3. Domain must be on Cloudflare DNS (transfer nameservers if not already)

## Step 6: Seed First Admin User
Before anyone can log in, insert Hank as admin:
```bash
npx wrangler d1 execute livetrackiq-prod --command="INSERT INTO offices (name, timezone) VALUES ('Gerdes Agency', 'America/Chicago');"
npx wrangler d1 execute livetrackiq-prod --command="INSERT INTO users (email, name, initials, role, office_id) VALUES ('Hankgerdes@gmail.com', 'Hank Gerdes', 'HG', 'admin', 1);"
```
Then Hank signs in with Google and adds his team from the Admin panel.

## Step 7: Deploy
```bash
npm run deploy
```

## Local Development
```bash
# Terminal 1: Frontend dev server
npm run dev

# Terminal 2: Worker dev server
npm run dev:worker
```

## Architecture Summary
- **Frontend:** React SPA (Vite build → `/dist`)
- **Backend:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite at edge)
- **Auth:** Google OAuth 2.0 → session cookie → D1 sessions table
- **Roles:** agent, team_leader, sales_specialist, admin
- **Desktop-optimized** agent views, mobile-first admin panel

## Transferring to Hank
1. Hank creates a Cloudflare account
2. Transfer `livetrackiq.com` domain to his account
3. Push code to a git repo (GitHub) and deploy from his account
4. Create new D1 database on his account, run schema
5. Set up Google OAuth under his Google Cloud project
6. Export/import D1 data if needed
