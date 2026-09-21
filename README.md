# MySpace

A private, single-user day-to-day portal: tasks, reminders, notes, activities,
a unified calendar with Google Calendar, personal history and search.

There is no registration and no public access. One owner account is created
from environment variables, and everything is stored in PostgreSQL.

**Google Calendar is optional.** Leave its credentials unset and the portal
runs completely without it - the calendar still shows tasks, reminders and
logged activities, and the UI hides the integration rather than prompting you
to configure it. Switch it on later by setting two environment variables and
restarting the backend; no code change, no migration, nothing lost.
See [section 5](#5-google-cloud-oauth-setup).

| | |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · Radix UI |
| **Backend** | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT access tokens + rotating refresh tokens in HttpOnly cookies |
| **Integration** | Google OAuth 2.0 (PKCE) + Google Calendar API v3 *(optional)* |

---

## Contents

1. [Project structure](#project-structure)
2. [Quick start with Docker](#quick-start-with-docker)
3. [Manual local setup](#manual-local-setup)
4. [PostgreSQL setup](#1-postgresql-setup)
5. [Environment variables](#2-environment-variables)
6. [Database migrations](#3-database-migrations)
7. [Initial owner account](#4-initial-owner-account)
8. [Google Cloud OAuth setup](#5-google-cloud-oauth-setup)
9. [Backend deployment](#6-backend-deployment)
10. [Vercel frontend deployment](#7-vercel-frontend-deployment)
11. [Connecting Google Calendar](#8-connecting-google-calendar)
12. [Verifying the production deployment](#9-verifying-the-production-deployment)
13. [Testing](#testing)
14. [Security notes](#security-notes)
15. [Keyboard shortcuts](#keyboard-shortcuts)

---

## Project structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/routes/       auth, tasks, reminders, notes, activities,
│   │   │                     tags, calendar, google, dashboard/search
│   │   ├── core/             settings, security, dependencies, errors, logging
│   │   ├── db/               engine, session, base, portable column types
│   │   ├── models/           user, refresh sessions, content, google
│   │   ├── schemas/          Pydantic request/response models
│   │   ├── services/         auth, google client/sync, dashboard, search,
│   │   │                     calendar feed, tags, activity log, time helpers
│   │   ├── cli.py            owner-account admin commands
│   │   └── main.py           application factory
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       ui primitives, layout, shared, settings
│   │   ├── pages/            the nine pages plus sign-in
│   │   ├── providers/        auth, theme
│   │   ├── hooks/            shortcuts, media queries, debounce
│   │   ├── lib/              api client, queries, date and class helpers
│   │   └── types/            API types
│   ├── vercel.json
│   └── package.json
├── migrations/               Alembic environment and versions
├── tests/                    backend test-suite (pytest)
├── alembic.ini
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Quick start with Docker

The fastest path to a running system. Requires Docker with Compose v2.

```bash
git clone <your-repo-url> myspace
cd myspace

cp .env.example .env
# Edit .env and set at least JWT_SECRET, TOKEN_ENCRYPTION_KEY and OWNER_PASSWORD.
# Generate the two secrets:
#   python -c "import secrets; print(secrets.token_urlsafe(64))"
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

docker compose up --build
```

The API container runs `alembic upgrade head` on start-up, so the schema is
created automatically. Create the owner account once:

```bash
docker compose exec api python -m app.cli create-owner
```

Then open <http://localhost:5173> and sign in with `OWNER_LOGIN_ID` /
`OWNER_PASSWORD`.

| Service | URL |
|---|---|
| Frontend | <http://localhost:5173> |
| API | <http://localhost:8000> |
| API docs | <http://localhost:8000/docs> (non-production only) |
| Health | <http://localhost:8000/health> |

---

## Manual local setup

### Backend

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements-dev.txt

cp .env.example .env               # then edit it

alembic upgrade head               # run from the repository root

cd backend
python -m app.cli create-owner
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

In development the Vite server proxies `/api` to the backend, so the browser
treats the API as same-origin and the refresh cookie needs no `SameSite`
workarounds. Leave `VITE_API_BASE_URL` empty locally.

---

## 1. PostgreSQL setup

### Local (Docker)

`docker compose up db` starts PostgreSQL 16 on port 5432 with the database,
user and password from `.env` (defaults: `myspace` / `myspace` / `myspace`).

### Local (native install)

```bash
psql -U postgres
```
```sql
CREATE USER myspace WITH PASSWORD 'choose-a-password';
CREATE DATABASE myspace OWNER myspace;
GRANT ALL PRIVILEGES ON DATABASE myspace TO myspace;
```

### Managed PostgreSQL (production)

Any managed Postgres works — Neon, Supabase, Render, Railway, RDS. Create a
database and copy its connection string.

**Important:** this project uses the `psycopg` (v3) driver, so the URL scheme
must be `postgresql+psycopg://`, not `postgres://` or `postgresql://`. Most
providers hand you a `postgres://...` URL; rewrite the scheme:

```text
postgres://user:pass@host:5432/db
→ postgresql+psycopg://user:pass@host:5432/db
```

If your provider requires TLS, append `?sslmode=require`:

```text
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db?sslmode=require
```

---

## 2. Environment variables

All backend configuration comes from the environment. Nothing secret is ever
committed; `.env` is git-ignored and `.env.example` is the documented template.

### Backend

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **yes** | – | `postgresql+psycopg://user:pass@host:5432/db` |
| `JWT_SECRET` | **yes** | – | Signs access tokens and keys the refresh-token HMAC. Long and random. |
| `TOKEN_ENCRYPTION_KEY` | **yes in prod** | derived from `JWT_SECRET` | Fernet key encrypting Google tokens at rest. |
| `ENVIRONMENT` | no | `development` | `development` \| `staging` \| `production`. Production disables `/docs`. |
| `DEBUG` | no | `false` | Verbose logging. |
| `ACCESS_TOKEN_TTL_MINUTES` | no | `15` | Access-token lifetime. |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | Refresh-token lifetime. |
| `COOKIE_SECURE` | no | `true` | Must be `true` over HTTPS; `false` for local HTTP. |
| `COOKIE_SAMESITE` | no | `none` | `none` when the frontend is on a different site, else `lax`. |
| `COOKIE_DOMAIN` | no | – | Only set when sharing a cookie across subdomains. |
| `FRONTEND_URL` | **yes** | `http://localhost:5173` | Where the Google callback redirects back to. Also allowed by CORS. |
| `CORS_ORIGINS` | no | localhost dev origins | Comma-separated list of additional allowed origins. |
| `LOGIN_MAX_ATTEMPTS` | no | `8` | Failed sign-ins per window before lockout. |
| `LOGIN_WINDOW_SECONDS` | no | `900` | Rate-limit window. |
| `LOGIN_LOCKOUT_SECONDS` | no | `900` | `Retry-After` returned when locked out. |
| `OWNER_LOGIN_ID` | for bootstrap | – | Read by `python -m app.cli create-owner`. |
| `OWNER_PASSWORD` | for bootstrap | – | Minimum 10 characters. |
| `OWNER_DISPLAY_NAME` | no | `Owner` | Name shown in the greeting. |
| `OWNER_EMAIL` | no | – | Optional. |
| `OWNER_TIMEZONE` | no | `UTC` | IANA name, e.g. `Asia/Kolkata`. Decides what "today" means. |
| `GOOGLE_CLIENT_ID` | **optional** | – | Leave blank to run without Google Calendar. |
| `GOOGLE_CLIENT_SECRET` | **optional** | – | Never exposed to the browser. |
| `GOOGLE_REDIRECT_URI` | with Google | `http://localhost:8000/api/google/callback` | Must match Google exactly. |
| `GOOGLE_SYNC_WINDOW_PAST_DAYS` | no | `30` | How far back to cache events. |
| `GOOGLE_SYNC_WINDOW_FUTURE_DAYS` | no | `120` | How far forward to cache events. |
| `WEB_CONCURRENCY` | no | `2` | Gunicorn workers (Docker image). |
| `PORT` | no | `8000` | Bind port (most hosts set this for you). |

Generate the two secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"                       # JWT_SECRET
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # TOKEN_ENCRYPTION_KEY
```

> Changing `JWT_SECRET` invalidates every active session (access **and** refresh
> tokens). Changing `TOKEN_ENCRYPTION_KEY` makes stored Google tokens
> undecryptable, so you would need to reconnect Google Calendar.

### Frontend

| Variable | Where | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Vercel | Full backend origin, e.g. `https://myspace-api.onrender.com`. Leave **empty** locally. |
| `VITE_API_PROXY_TARGET` | local only | Dev-server proxy target. Default `http://127.0.0.1:8000`. |

Vite inlines `VITE_*` variables at build time, so changing one in Vercel
requires a redeploy, not just a restart.

---

## 3. Database migrations

Alembic is configured at the repository root and reads `DATABASE_URL` from the
environment.

```bash
alembic upgrade head            # apply everything (run from the repo root)
alembic current                 # show the applied revision
alembic history --verbose       # list revisions
alembic downgrade -1            # roll back one revision
alembic check                   # fail if the models have drifted from the schema

# after changing a model:
alembic revision --autogenerate -m "describe the change"
```

In Docker and on the recommended hosts, `alembic upgrade head` runs
automatically on every start, so a deploy never serves an out-of-date schema.

---

## 4. Initial owner account

There is no sign-up. The single account is created from the environment:

```bash
# Locally (from the backend/ directory, with the venv active)
export OWNER_LOGIN_ID=yourname
export OWNER_PASSWORD='a-long-passphrase-you-will-remember'
python -m app.cli create-owner

# In Docker
docker compose exec api python -m app.cli create-owner

# On a deployed host, from its shell / one-off job
python -m app.cli create-owner
```

Other commands:

```bash
python -m app.cli show-owner              # print the current account
python -m app.cli create-owner --force    # reset the password from OWNER_PASSWORD
python -m app.cli reset-password          # same as above
```

`create-owner` is safe to re-run: without `--force` it reports that the account
already exists and changes nothing.

After the first sign-in you can change the password from **Settings →
Security**, which signs out every other device. Once that is done, remove
`OWNER_PASSWORD` from your production environment.

---

## 5. Google Cloud OAuth setup

> **Optional - skip this section entirely if you do not want Google Calendar.**
> With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` unset the portal works
> normally: the Dashboard and Today pages drop their schedule cards, the
> Calendar page shows only Tasks / Reminders / Activities, and **Settings ->
> Google Calendar** simply explains how to turn it on. Come back whenever you
> want it - enabling it later needs only those two variables and a restart.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a project (e.g. *MySpace*).
2. **APIs & Services → Library** → search for **Google Calendar API** →
   **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless you have a Workspace org, in which case
     **Internal** is simpler and skips verification).
   - App name, user support email and developer contact email are required.
   - **Scopes** → add:
     - `openid`
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/calendar.events.readonly`
   - **Test users** → add your own Google address.
   - Leave the app in **Testing**. A personal portal has one user, so there is
     no need to publish or go through verification. Refresh tokens issued by an
     app in Testing expire after 7 days — if you would rather not reconnect
     weekly, press **Publish app**; with only sensitive (not restricted) scopes
     and a single user this is quick.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorised redirect URIs** — add one per environment, matching
     `GOOGLE_REDIRECT_URI` exactly (Google compares character for character):
     - `http://localhost:8000/api/google/callback`
     - `https://your-api-domain.com/api/google/callback`
   - You do **not** need authorised JavaScript origins: the whole flow runs
     server-side.
5. Copy the **Client ID** and **Client secret** into the backend environment as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI`
   to the matching URI. Restart the backend.

The client secret and both OAuth tokens live only on the backend. The frontend
receives connection status and calendar data — never token material.

---

## 6. Backend deployment

The backend is a standard containerised Python service. Build from the
**repository root** so the migrations are in the build context:

```bash
docker build -f backend/Dockerfile -t myspace-api .
docker run -p 8000:8000 --env-file .env myspace-api
```

The image runs migrations and then Gunicorn with Uvicorn workers, as a
non-root user, with a `/health` healthcheck.

### Render (recommended)

1. **New → Web Service** → connect the repository.
2. Runtime **Docker**, Dockerfile path `backend/Dockerfile`, Docker build
   context `.` (the repository root).
3. Health check path: `/health`.
4. Add the environment variables from the table above. For production set:
   - `ENVIRONMENT=production`
   - `COOKIE_SECURE=true`
   - `COOKIE_SAMESITE=none`  ← required, because Vercel and Render are
     different sites and the browser will otherwise drop the refresh cookie
   - `FRONTEND_URL=https://your-app.vercel.app`
   - `GOOGLE_REDIRECT_URI=https://your-api.onrender.com/api/google/callback`
5. Create a **PostgreSQL** instance in Render and use its internal connection
   string as `DATABASE_URL`, rewritten to `postgresql+psycopg://`.
6. Deploy. Then open the service **Shell** and run
   `python -m app.cli create-owner`.

### Railway / Fly.io

Both deploy the same Dockerfile.

```bash
# Railway
railway up                    # set the root Dockerfile path to backend/Dockerfile

# Fly.io
fly launch --dockerfile backend/Dockerfile --no-deploy
fly secrets set DATABASE_URL=... JWT_SECRET=... TOKEN_ENCRYPTION_KEY=...
fly deploy
fly ssh console -C "python -m app.cli create-owner"
```

Railway and Fly both inject `PORT`; the image already honours it.

> Serverless platforms are a poor fit here: the service holds a PostgreSQL
> connection pool and runs migrations at start-up. A small always-on container
> is both cheaper and simpler.

---

## 7. Vercel frontend deployment

The frontend is a static SPA. `frontend/vercel.json` already sets the build,
the SPA fallback rewrite and security headers.

### Via the dashboard

1. **Add New → Project** → import the repository.
2. **Root Directory: `frontend`** ← this is the setting people miss. Vercel
   must build from inside `frontend/`, not the repository root.
3. Framework preset: **Vite** (detected). Build command `npm run build`,
   output directory `dist` — both already in `vercel.json`.
4. **Environment Variables** → add `VITE_API_BASE_URL` =
   `https://your-api-domain.com` (no trailing slash) for Production, Preview
   and Development.
5. **Deploy.**

### Via the CLI

```bash
cd frontend
npm i -g vercel
vercel link
vercel env add VITE_API_BASE_URL production   # paste your API origin
vercel --prod
```

### After deploying

Point the backend at the real frontend origin, then redeploy the backend:

```bash
FRONTEND_URL=https://your-app.vercel.app
CORS_ORIGINS=https://your-app.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

Vercel preview deployments get their own generated URLs. Either add them to
`CORS_ORIGINS` as needed, or use preview builds only against a staging backend.

#### Why `SameSite=None`

`your-app.vercel.app` and `your-api.onrender.com` are different sites, so the
refresh cookie is cross-site and must be `SameSite=None; Secure` or browsers
will silently drop it — sessions would appear to work until the first token
refresh, then log you out.

If you prefer a same-site setup, put the API behind a subdomain of your own
domain (`app.example.com` and `api.example.com`), set
`COOKIE_DOMAIN=.example.com` and `COOKIE_SAMESITE=lax`.

---

## 8. Connecting Google Calendar

1. Sign in and open **Settings → Google Calendar**.
2. Press **Connect Google Calendar**. You are redirected to Google's consent
   screen (the backend generates the URL with a one-time `state` and a PKCE
   challenge).
3. Approve read-only calendar access.
4. Google returns you to `/api/google/callback`, which exchanges the code for
   tokens, encrypts and stores them, performs a first sync, and redirects to
   `/settings?google=connected`.
5. Use the **Calendars** list to choose which calendars appear. Turning one off
   also removes its cached events.
6. **Sync now** refreshes the cache. Expired access tokens are refreshed
   automatically before each sync, so you should rarely need to reconnect.
7. **Disconnect** revokes the grant with Google and deletes the connection,
   calendars and all cached events locally.

Your Google events then appear on the Calendar page, on Today, and in the
dashboard's schedule card, alongside tasks, reminders and activities.

### If Google stops syncing

Settings shows the last sync error. The usual causes:

- **The app is in Testing** and the refresh token expired after 7 days →
  reconnect, or publish the consent screen.
- **The redirect URI changed** → it must match Google exactly, including scheme
  and trailing path.
- **Access was revoked** in your Google account → disconnect and reconnect.

---

## 9. Verifying the production deployment

Run these against your real deployment once it is live.

**1. The API is up and the database is reachable**

```bash
curl -s https://your-api-domain.com/health
# {"status":"ok","environment":"production","database":"up","google_configured":true}
```

`"database":"down"` means `DATABASE_URL` is wrong or the database is
unreachable. `"google_configured":false` means the Google credentials are not
set.

**2. Migrations are applied**

```bash
alembic current     # from the host's shell; should print a revision, not empty
```

**3. Sign-in works and sets a hardened cookie**

```bash
curl -i -X POST https://your-api-domain.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login_id":"yourname","password":"your-password"}'
```

Expect `200` with an `access_token`, and a `Set-Cookie` header containing
`HttpOnly`, `Secure`, `SameSite=none` and `Path=/api/auth`.

**4. Wrong passwords are rejected and rate limited**

```bash
for i in $(seq 1 9); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://your-api-domain.com/api/auth/login \
    -H 'Content-Type: application/json' -d '{"login_id":"yourname","password":"wrong"}'
done
# eight 401s, then 429
```

**5. Protected routes reject anonymous callers**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://your-api-domain.com/api/dashboard   # 401
```

**6. API docs are disabled in production**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://your-api-domain.com/docs            # 404
```

**7. The frontend loads and deep links work**

Open `https://your-app.vercel.app/settings` directly in a fresh browser. You
should be redirected to the sign-in screen, and after signing in land back on
Settings — that confirms the SPA rewrite is configured.

**8. Sessions survive a reload**

Sign in, hard-refresh the page. You should stay signed in — this proves the
refresh cookie is reaching the backend. If you are logged out, `COOKIE_SAMESITE`
/ `COOKIE_SECURE` or `CORS_ORIGINS` is wrong.

**9. Create, complete and search**

Add a task via Quick add, tick it off, then search for its title. It should
appear under Tasks in the results, and the completion should show in Activities.

**10. Google Calendar (only if you enabled it)**

`/health` reports `"google_configured"`. If it is `false`, the integration is
off and the UI will not mention it - that is the expected state when you have
not set the credentials.

If it is `true`, connect from Settings, then confirm events appear on the
Calendar page and that **Sync now** reports the number of events updated.

---

## Testing

### Backend

```bash
pytest                       # 77 tests
pytest -v                    # verbose
pytest tests/test_auth.py    # one file
ruff check .                 # lint
```

The suite runs against a throwaway SQLite database built **from the Alembic
migrations**, so the migration chain is exercised alongside the code. It covers:

- **Auth** — login, wrong passwords, unknown users, case-insensitive ids, rate
  limiting and lockout, protected routes, malformed tokens, profile updates.
- **Refresh rotation** — a refresh rotates the token; replaying a rotated token
  is treated as theft and revokes the entire token family.
- **Logout** — single session, all sessions, and password changes invalidating
  every other device.
- **CRUD** — tasks, reminders (including repeats rolling forward, snooze and
  dismiss), notes, activities, tags, and quick add for every kind.
- **Authorisation** — unknown tag ids rejected, automatic history entries not
  editable, validation errors shaped consistently.
- **Dashboard, Today, calendar feed and search** — including that typed `%`
  wildcards are matched literally rather than acting as LIKE wildcards.
- **Google** — the whole lifecycle against a stubbed Google API: connect, state
  replay rejection, denied consent, event caching, transparent access-token
  refresh, missing refresh token, calendar toggles, sync diffing, disconnect,
  and that no token material ever appears in an API response.
- **Google switched off** - every page and endpoint still works with no
  credentials configured, the API reports `google_configured: false` so the UI
  can hide the integration, and the flags flip once credentials are present.
- **Migrations** — upgrade, downgrade, re-upgrade, and every model column
  present in the migrated schema.
- **Security primitives** — Argon2 hashing, JWT expiry, refresh-token hashing,
  Fernet encryption, PKCE, and timezone-aware datetimes round-tripping as UTC.

### Frontend

```bash
cd frontend
npm run lint                 # tsc --noEmit
npm run build                # type-check and production build
npm run preview              # serve the built bundle
```

---

## Security notes

- **Passwords** are hashed with Argon2id. A sign-in attempt for an unknown id
  still performs a hash so response timing does not reveal whether the account
  exists.
- **Access tokens** are short-lived JWTs (15 minutes by default) held only in
  the browser's memory — never in `localStorage`.
- **Refresh tokens** are opaque 384-bit values. Only an HMAC digest is stored,
  so a database leak does not yield usable tokens. They are delivered in an
  `HttpOnly`, `Secure` cookie scoped to `/api/auth`, so JavaScript cannot read
  them and they are not sent to any other endpoint.
- **Rotation and reuse detection**: every refresh issues a new token and revokes
  the old one. Presenting an already-rotated token revokes the whole family
  descended from that login, which cuts off a stolen token even if the attacker
  used it first.
- **Login rate limiting** is enforced per IP *and* per login id from a persisted
  table, so it survives restarts and neither dimension can be used to bypass the
  other.
- **Google tokens** are encrypted at rest with Fernet and never leave the
  backend. The OAuth flow uses PKCE plus a single-use `state` row.
- **CORS** is restricted to configured origins with credentials enabled.
- **API docs** are disabled when `ENVIRONMENT=production`.
- The frontend sends `X-Robots-Tag: noindex, nofollow` and a `noindex` meta tag;
  this is a private portal and should not be indexed.

---

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl`/`Cmd` + `K` | Command palette (search and jump) |
| `N` | Quick add |
| `/` | Go to search |
| `?` | Show shortcuts |
| `G` then `D` | Dashboard |
| `G` then `T` | Today |
| `G` then `K` | Tasks |
| `G` then `C` | Calendar |
| `G` then `R` | Reminders |
| `G` then `N` | Notes |
| `G` then `A` | Activities |
| `G` then `S` | Settings |

Shortcuts are ignored while you are typing in a field.

---

## Troubleshooting

**Signed out after every page reload.** The refresh cookie is not reaching the
backend. Over HTTPS across two sites you need `COOKIE_SECURE=true` and
`COOKIE_SAMESITE=none`; locally over HTTP you need `COOKIE_SECURE=false` and
`COOKIE_SAMESITE=lax`. Also confirm the frontend origin is in `CORS_ORIGINS`.

**`sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects.postgres`.**
The URL scheme must be `postgresql+psycopg://`.

**CORS errors in the browser console.** Add the exact frontend origin — scheme,
host and port, no trailing slash — to `CORS_ORIGINS`, and redeploy.

**`redirect_uri_mismatch` from Google.** `GOOGLE_REDIRECT_URI` and the URI
registered in Google Cloud must be byte-identical.

**A 404 on every route except `/` on Vercel.** The Root Directory is not set to
`frontend`, so `vercel.json` and its SPA rewrite are not being picked up.

**`alembic: command not found`.** Activate the virtualenv, or use
`python -m alembic`.

---

## Licence

Private and personal. Not intended for redistribution.
