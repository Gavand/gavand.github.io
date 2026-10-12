# Andbotics HQ — Cloudflare Free

Cloudflare Worker + D1 persistent database. The existing public website stays on GitHub Pages. Render is unused. The dashboard and logo are retained. Research/outreach are simulated; Google integrations are not connected. No sending endpoint exists, even for approved drafts.

## Setup

Use Node 22+ and install with `npm install` (or `pnpm install`). Run `npx wrangler login` with account/user read, Worker-script write and D1 write scopes. Create the database with `npx wrangler d1 create andbotics-hq` and enter its ID in `wrangler.jsonc`. Initialize it with `npx wrangler d1 execute andbotics-hq --remote --file schema.sql`.

Set `HQ_AUTH_CONFIG` using `npx wrangler secret put HQ_AUTH_CONFIG`. Run this folder's `python3 configure_password.py` and pipe ignored `work.auth.json` to the secret command. Its verifier format differs from the original Python app. Never commit this secret. Set `HQ_PUBLIC_ORIGIN` to the exact HTTPS workers.dev origin, then run `npx wrangler deploy`. Static assets must use `run_worker_first: true`; otherwise authentication could be bypassed for HTML files.

The browser derives a password proof using PBKDF2 SHA-256 with 600,000 iterations over HTTPS. The Worker verifies its SHA-256 against the secret, so the secret does not contain the reusable proof. Treat the proof like a password; do not log or store it. This avoids Cloudflare’s 100,000-round server PBKDF2 cap. The Worker uses server-side hashed sessions, Secure/HttpOnly cookies, eight-hour expiration, CSRF and exact-origin checks. Changing the secret revokes existing sessions. Login attempts are globally limited to 10 per 15 minutes. This conservative single-owner limit can temporarily block everyone after repeated attempts. Verify login under actual Free-plan CPU limits before considering deployment finished.

For local preview, copy configuration to ignored `work.local.json`, set origin to `http://localhost:8787`, create ignored `.dev.vars` containing the contents of the generated verifier file, initialize D1 with `--local`, and run `npx wrangler dev --config work.local.json`. Test with `TEST_PASSWORD` in the environment and `python3 tests/integration.py`. This test writes a local QA lead; never run against the live database unless intentional.

## Private business data

The deployed database starts empty. Obtain approval before transferring private records to Cloudflare. Generate an ignored SQL file with `python3 export_snapshot.py /path/to/private/business-data.json private-import.sql`, then import with `npx wrangler d1 execute andbotics-hq --remote --file private-import.sql`. Existing edited leads are preserved. Never upload the private import to GitHub. Source snapshots and CAD assets stay private on your computer.

## Website link and domain

Start with the free workers.dev address. A custom Worker domain requires the domain's DNS zone on Cloudflare. Do not change nameservers until every existing DNS record (including mail) is inventoried and preserved. `hq.andbotics.com` is optional; `/hq` on GitHub Pages can redirect directly to the workers.dev URL. Enable that redirect only after live login and persistence checks pass.

Stay on Workers Free; no paid upgrade is needed for the MVP. Free quotas can stop requests when exhausted. AI providers may charge separately when added. Export regular private backups with `npx wrangler d1 export andbotics-hq --remote --output private-backup.sql`. Keep backups out of public source. This is a single-owner MVP, not a multi-user platform.
