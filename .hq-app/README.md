# Andbotics HQ — protected business workspace

This application is a separate server hosted at `hq.andbotics.com`. The public GitHub Pages site remains at `www.andbotics.com`. `hq/index.html` redirects visitors from `/hq` to the protected application.

**Do not merge the redirect until the backend, custom domain and login are verified.** GitHub Pages cannot run the Python server. A redirect alone does not deploy HQ.

## Local start

Python 3.9+ is sufficient; no dependencies are required.

```sh
cd .hq-app
python3 configure_password.py
python3 server.py
```

Open http://127.0.0.1:8765/hq/. Enter your chosen workspace password when configuring the local app. Source contains no default password. The server refuses to start if authentication is not configured.

## Hosting setup — owner action required

1. Create a Render account and connect the `Gavand/gavand.github.io` repository. Review the service and storage pricing before provisioning: `render.yaml` requests a **paid starter service with a 1 GB persistent disk**. No paid service has been provisioned by this change.
2. Create a Blueprint using the prepared branch and `render.yaml`. The Docker build uses `.hq-app/` only and excludes all runtime/private data. Automatic deployments are disabled.
3. Set the secret `HQ_AUTH_CONFIG` to the entire JSON content of the **locally generated** `.hq-app/data/auth.json`. Keep that value in Render's secret settings, never in GitHub. This stores a salted PBKDF2 password hash rather than plaintext. Configure your selected password locally to obtain the JSON; do not put the password in a command argument.
4. Add the custom domain `hq.andbotics.com` in Render. At your DNS provider, add the **hq subdomain record Render specifies**, preserving the existing apex/www GitHub Pages records. Wait for verified domain and HTTPS. The configured `HQ_PUBLIC_ORIGIN` is `https://hq.andbotics.com`; login on other hostnames is deliberately rejected. The `/healthz` endpoint exposes readiness only and works for Render health checks.
5. Verify sign-in, sign-out, unauthorized API access, lead persistence after restart, and mobile layouts at the actual HTTPS domain.
6. Transfer private business records separately to the persistent disk. Source starts with **zero leads** and contains no tracker, contact list, private document snapshots or database. For existing records, use an SQLite backup taken while the local server is stopped, transfer it to `/var/data/hq.sqlite3`, and revoke copied sessions. For a fresh import, securely transfer the local `references/business-data.json` to `/var/data/references/business-data.json` and restart. Render documents authenticated SSH/SCP transfers. The import runs once; later restarts preserve edits. Keep all other source snapshots private.
7. Only after the domain and login work, merge the repository branch so GitHub Pages publishes `/hq`. Confirm both `https://www.andbotics.com/hq/` and the apex-to-www redirect reach HQ.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | Hosting provider listening port |
| `HQ_BIND` | `0.0.0.0` inside the host container; loopback by default locally |
| `HQ_PUBLIC_ORIGIN` | Exact public HTTPS origin used for host and CSRF checks |
| `HQ_AUTH_CONFIG` | Secret JSON with salt and password hash |
| `HQ_DATABASE` | Persistent database file; `/var/data/hq.sqlite3` |
| `HQ_REFERENCE_DIR` | Private snapshot location; `/var/data/references` |

SQLite is for one server instance. Keep backups private. The standard-library server is a small single-owner MVP; HTTPS terminates at the hosting proxy. No multi-user access controls or automatic Google integration are implemented.

## Password controls

All dashboard and data routes require a valid server-side session. Sessions expire after eight hours; logout deletes the server-side session. Production cookies are Secure, HttpOnly and SameSite=Strict. Mutations require a CSRF token and exact Origin. Ten recent login attempts lock the shared login for fifteen minutes. Session tokens are stored hashed in SQLite. Static login styling and the logo are public; records and app routes are protected.

Rotate the password by generating a new configuration, updating `HQ_AUTH_CONFIG`, deleting existing rows from the `sessions` table, and redeploying. Local configuration rotation revokes sessions in the default local database automatically. A production secret change also requires explicit session revocation.

## Verification and limitations

```sh
python3 -m unittest discover -s .hq-app/tests -v
```

Research and outreach remain template simulations. Approvals save drafts without sending emails. Gmail, Calendar and Drive integration panels are not live OAuth connections. Finance and materials show read-only private snapshots when imported. The private-data import test is skipped in public source because its fixture contains actual contacts; it passes in the private local bundle.

References: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Render persistent disks](https://render.com/docs/disks), [Render Blueprint specification](https://render.com/docs/blueprint-spec).
