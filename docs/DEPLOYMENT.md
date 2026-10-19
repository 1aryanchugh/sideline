# Deploying Sideline

Everything here runs on Cloudflare's free plan. Setup takes about 15 minutes.

## 1. Prerequisites
- [Node.js](https://nodejs.org) LTS (v20 or newer): `node --version`
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up). No domain or payment method is needed.

## 2. Install and log in
```bash
npm install
npx wrangler login
```

## 3. Secrets
Squiggle asks every client to include a contact email in its User-Agent. It's stored as an encrypted secret, never in the code:
```bash
npx wrangler secret put CONTACT_EMAIL
```
Optional: a key for the API-Football backup (only used if ESPN's feed is down; the free plan needs no card):
```bash
npx wrangler secret put API_FOOTBALL_KEY
```
If Wrangler says the Worker doesn't exist yet, deploy once (step 4) and come back.

## 4. Deploy
```bash
npm run deploy
```
The first deploy asks for a `workers.dev` subdomain and prints the app's address, `https://sideline.<subdomain>.workers.dev`.

On a phone, open that address and choose **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android).

## 5. Continuous deployment from GitHub
`.github/workflows/ci.yml` runs the test suite on every push and pull request, and deploys when tests pass on `main`.

1. Push the repository to GitHub (with the `git` CLI, [GitHub Desktop](https://desktop.github.com), or **Add file → Upload files** on github.com). `.gitignore` keeps `node_modules`, `.wrangler` and `.dev.vars` out.
2. Create a Cloudflare API token: **My Profile → API Tokens → Create Token → Edit Cloudflare Workers** template.
3. In the repository, add two secrets under **Settings → Secrets and variables → Actions**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID` (shown on the Workers & Pages page)
4. Push to `main`. The **Actions** tab shows the test and deploy jobs.

## 6. Operating it in public

### Request limits
The app sends a random per-device id with each request. The Worker allows 300 requests a minute per device and 1,200 per network address (`ratelimits` in `wrangler.jsonc`), about six times the heaviest real use. A client that is limited backs off for a few seconds and retries quietly.

If a deploy fails because rate limiting isn't available on the account, remove the `ratelimits` block. The Worker treats a missing limiter as "allow".

### Logs
Workers Logs is enabled (`observability` in `wrangler.jsonc`). Failed requests are logged as JSON with the route and error: **Workers & Pages → sideline → Logs**. Free plan: 200,000 events a day, kept 3 days.

### Uptime alerts
`GET /api/health` returns `200` when ESPN is reachable and `503` when it isn't. Point a free uptime monitor (for example UptimeRobot, HTTP check every 5 minutes) at it for email alerts.

### Capacity
| Free plan limit | Usage |
|---|---|
| Workers: 100,000 requests/day | One person following a live game for 3 hours ≈ 540 requests |
| Durable Objects | The AFL stream is open only while someone is watching |
| Static assets | Free and unmetered |
| API-Football: 100 requests/day | Hard-capped at 90 by the `DailyQuota` Durable Object |
| Workers Logs: 200,000 events/day | Only failures are logged |

Past 100,000 requests a day, the Workers Paid plan is US$5 a month for 10 million.

## Local development
```bash
cp .dev.vars.example .dev.vars   # add your contact email
npm run dev                      # http://localhost:8787
npm test
```
Add `?demo` to the address for the sample board, which works without any network access.
