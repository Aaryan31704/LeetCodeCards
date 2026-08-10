# LeetPlacards

Mobile-first flashcard app that **automatically** turns your LeetCode solutions into revision cards. Log in with GitHub, connect your repo, and every push creates or updates placards—no worker to run.

## Architecture

```
User logs in with GitHub (OAuth) in the Expo app
    ↓
User connects their LeetCode repo (owner/name)
    ↓
Backend creates a webhook on that repo
    ↓
User pushes solutions (e.g. via LeetHub) → GitHub sends push event to backend
    ↓
Backend fetches new/changed files → LLM (Groq/Llama) → placard stored per user
    ↓
Expo app shows user's placards (list + flashcard view)
```

- **No background worker:** Placards are created when GitHub sends a webhook on push, or when the user triggers a sync (e.g. pull-to-refresh).
- **Per-user:** Each user has their own placards; auth is GitHub OAuth + JWT.

## Tech Stack

- **Backend:** Python, FastAPI, asyncpg, JWT, GitHub OAuth & webhooks
- **Database:** Supabase (PostgreSQL)
- **LLM:** Groq API (Llama 3) for summary/approach from code
- **Mobile:** Expo (React Native) with auth, connect-repo, and flashcard UI

---

## 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → Database**, copy the **Connection string** (URI).
3. Tables are created automatically on backend startup (`users`, `worker_state`, `placards`).

---

## 2. Backend

### Setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

### Configure `.env`

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `GITHUB_OAUTH_CLIENT_ID` | From GitHub OAuth App (Settings → Developer settings → OAuth Apps) |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth app secret |
| `APP_URL` | Backend base URL. Must be publicly reachable for webhooks to work |
| `JWT_SECRET` | Random secret for JWT. **Must** be changed from the default |
| `GROQ_API_KEY` | From [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | Optional; default `openai/gpt-oss-120b` |
| `GITHUB_WEBHOOK_SECRET` | Optional; set same value in GitHub repo webhook for verification |
| `ALLOWED_REDIRECT_SCHEMES` | Optional; URL schemes allowed to receive the login token |
| `CORS_ALLOW_ORIGINS` | Optional; comma-separated origins, defaults to `*` |
| `JWT_EXPIRE_DAYS` | Optional; token lifetime, default `30` |
| `DEBUG` | Optional; when `true`, 500 responses include exception details |

Generate a JWT secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The backend logs a warning at startup for each missing or insecure setting, so check the console on first run.

> **Groq models get retired.** `llama-3.1-*` and `llama-3.3-70b-versatile` are already decommissioned and return HTTP 400. If placards come back with no description or approach, check [console.groq.com/docs/deprecations](https://console.groq.com/docs/deprecations) and update `GROQ_MODEL`.

**GitHub OAuth App:** Create an OAuth App with Authorization callback URL: `{APP_URL}/auth/github/callback`. Scopes: `read:user`, `user:email`, `repo`, `admin:repo_hook`.

### Run API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000  
- Docs: http://localhost:8000/docs  

### Smoke test

```bash
cd backend
python smoke_test.py
```

Checks auth enforcement, OAuth redirect validation, webhook signature and branch handling, and the parsing helpers. No database required.

**Webhook (local dev):** Prefer the hosted Render backend for webhooks. If you run the API locally and still want push events, expose it with ngrok (`ngrok http 8000`) and set `APP_URL` to that URL. The backend creates the repo webhook itself with `GITHUB_WEBHOOK_SECRET` applied.

---

## 2b. Hosting in the cloud (Render, free)

The repo contains a `render.yaml` blueprint, so the backend can run 24/7 without your laptop:

1. Sign up at [render.com](https://render.com) (log in with GitHub is easiest).
2. Dashboard → **New +** → **Blueprint** → select this repo → **Apply**.
3. Render prompts for the secret env vars (`DATABASE_URL`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GROQ_API_KEY`) — paste them from `backend/.env`. `JWT_SECRET` and `GITHUB_WEBHOOK_SECRET` are generated automatically.
4. After the first deploy, verify the service URL matches `https://leetplacards-api.onrender.com`. If Render assigned a different name, update the `APP_URL` env var in the dashboard, plus `mobile/app.json`, `mobile/eas.json`, and the OAuth callback below.
5. Set your GitHub OAuth App's **Authorization callback URL** to `https://leetplacards-api.onrender.com/auth/github/callback`.
6. Check `https://leetplacards-api.onrender.com/health` returns `{"status":"ok"}`.

Every `git push` to `main` redeploys automatically.

**Free-tier caveat:** the service sleeps after ~15 minutes idle and the next request takes ~1 minute while it wakes. The app's pull-to-refresh sync covers any webhook missed during sleep. To keep it always awake, point a free [UptimeRobot](https://uptimerobot.com) monitor at `/health` every 10 minutes (Render's free 750 instance-hours/month cover one always-on service).

---

## 3. Mobile app (Expo)

```bash
cd mobile
npm install
npx expo start
```

1. **API URL:** Set `EXPO_PUBLIC_API_URL` to your backend URL.  
   - Local dev example: `set EXPO_PUBLIC_API_URL=http://192.168.x.x:8000` (Windows) before `npx expo start`.
   - Travel/production: set `EXPO_PUBLIC_API_URL=https://your-public-api-domain` in EAS profile env vars.
   - `mobile/src/config.js` reads `EXPO_PUBLIC_API_URL` first, then `app.json -> expo.extra.apiUrl`.
2. **Login:** Tap “Login with GitHub”. You’ll be sent to GitHub to authorize; after redirect, the app stores the token.
3. **Connect repo:** Enter the repo owner and name where you push LeetCode solutions (e.g. from LeetHub). The backend will create a webhook and run an initial sync so existing solutions become placards.
4. **Placards:** List and tap a card for flashcard view (front: problem + pattern; back: summary, approach, complexity). Pull to refresh to sync new pushes. Log out from the list header.

Deep link scheme is `leetplacards` so that after GitHub OAuth the backend can redirect to the app with the token.

### Build installable app (for use while travelling)

```bash
cd mobile
npx eas login
npx eas build --platform android --profile preview
# or:
npx eas build --platform ios --profile preview
```

`mobile/eas.json` already points the preview and production profiles at the Render backend (`https://leetplacards-api.onrender.com`), so builds work off your laptop out of the box.

---

## 4. End-to-end flow

1. **LeetHub (optional):** Install [LeetHub](https://github.com/QasimWani/LeetHub) and connect your GitHub repo. Submitting a solution on LeetCode pushes the file to the repo (e.g. `LeetCode/123-two-sum.py`).
2. **App:** Log in with GitHub, connect that repo. Existing files are synced once; new pushes create placards via webhook (or use pull-to-refresh to sync).
3. **Flashcards:** Open a placard to see front (problem name, pattern) and back (summary, approach, time/space). View code in the modal.

---

## API (authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/github` | Redirect to GitHub OAuth |
| GET | `/auth/github/callback` | OAuth callback; redirects to app with token |
| GET | `/me` | Current user (Bearer token) |
| POST | `/me/repo` | Connect repo (body: `repo_owner`, `repo_name`, optional `leetcode_path_prefix`) |
| POST | `/me/sync` | Manually sync placards from connected repo |
| POST | `/me/resync` | Re-process cards missing content (`{"force": true}` for all) |
| GET | `/me/resync/status` | Poll background resync progress |
| GET | `/placards` | List current user’s placards (`?full=true` for deck data) |
| GET | `/placards/{id}` | Get one placard (with code) |
| POST | `/placards/{id}/mastered` | Toggle mastered state |
| POST | `/webhooks/github` | GitHub push webhook (no auth; verified by signature) |
| GET | `/health` | Health check |

Endpoints return `503` when the database is unreachable and `401` for a missing or invalid token.

---

## Project structure

```
backend/
  app/
    main.py
    config.py
    auth.py           # JWT
    deps.py            # get_current_user
    database.py
    models.py         # users, placards, worker_state
    user_service.py
    placard_service.py
    github_service.py  # + create_webhook_for_repo
    leetcode_service.py # problem description via LeetCode GraphQL
    llm_service.py
    routes/
      auth.py         # /auth/github, /auth/github/callback
      me.py           # /me, /me/repo, /me/sync
      placards.py     # /placards (requires auth)
      webhooks.py     # /webhooks/github
  .env.example
  requirements.txt

mobile/
  App.js              # AuthProvider, Login vs Main stack
  src/
    config.js
    api.js            # setAuthToken, fetchPlacards, connectRepo, syncNow
    context/
      AuthContext.js
    screens/
      LoginScreen.js
      ConnectRepoScreen.js
      PlacardListScreen.js
      PlacardViewScreen.js
```
