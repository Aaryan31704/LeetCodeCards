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
| `APP_URL` | Backend base URL (e.g. `http://localhost:8000` or your public URL for webhooks) |
| `JWT_SECRET` | Random secret for JWT (change in production) |
| `GROQ_API_KEY` | From [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | Optional; default `llama-3.1-70b-versatile` |
| `GITHUB_WEBHOOK_SECRET` | Optional; set same value in GitHub repo webhook for verification |

**GitHub OAuth App:** Create an OAuth App with Authorization callback URL: `{APP_URL}/auth/github/callback`. Scopes: `read:user`, `user:email`, `repo`, `admin:repo_hook`.

### Run API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000  
- Docs: http://localhost:8000/docs  

**Webhook (production):** For GitHub to reach your backend on push, use a public URL (e.g. ngrok for local: `ngrok http 8000`, then set `APP_URL` to the ngrok URL). Set the same secret in GitHub repo → Settings → Webhooks → Add webhook → Payload URL `{APP_URL}/webhooks/github`, Content type `application/json`, Secret = `GITHUB_WEBHOOK_SECRET`.

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

Before building, replace `https://api.example.com` in `mobile/eas.json` with your deployed backend domain.

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
| GET | `/placards` | List current user’s placards |
| GET | `/placards/{id}` | Get one placard (with code) |
| POST | `/webhooks/github` | GitHub push webhook (no auth; verified by signature) |
| GET | `/health` | Health check |

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
