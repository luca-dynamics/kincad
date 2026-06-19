# Deploying KINCAD to Vercel

KINCAD is a Vite single-page app **plus** a small API backend. On Vercel both ship together:

- **Frontend** → static build (`vite build` → `dist/`), served by Vercel's CDN.
- **Backend** → serverless functions in [`api/`](api/) (`/api/health`, `/api/copilot`), which run the
  same engine-grounded tool loop as the local dev server. Both share [`server/handler.ts`](server/handler.ts).

The browser calls `/api/*` relative paths, so it works identically locally (Vite proxy → Express on :8787)
and on Vercel (→ serverless functions). No code change needed between environments.

## 1. Push to GitHub

```bash
git init && git add . && git commit -m "KINCAD"
gh repo create kincad --public --source=. --push   # or push to an existing repo
```

> `.env`, `node_modules/`, and `dist/` are git-ignored. **Never commit your keys.**

## 2. Import the repo in Vercel

- Go to vercel.com → **Add New… → Project** → import the repo.
- Framework preset is auto-detected as **Vite**. Leave build settings default
  (`vercel.json` already sets the output dir and function limits).

## 3. Add environment variables (Project → Settings → Environment Variables)

Add the keys you have (any subset — providers without a key simply show as "needs key"):

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Claude key |
| `OPENAI_API_KEY` | your OpenAI key |
| `GOOGLE_API_KEY` | your Gemini key |

Apply them to **Production** (and Preview if you want). Redeploy after adding.

## 4. Deploy

Click **Deploy** (or push to the default branch). When it's live, the app is at your Vercel URL and
the model menu will show whichever providers you keyed. Users can also **bring their own key** (BYOK)
from the model menu without any server key.

## Notes

- **Function timeout:** the agent's tool loop can take several model round-trips. `api/copilot.ts`
  requests `maxDuration: 60`. On the Hobby plan Vercel may cap this lower — if long requests 504, keep
  prompts focused or upgrade the plan.
- **Image attachments** are sent as base64 in the request body; very large images can exceed Vercel's
  serverless body limit. Keep uploads reasonably sized.
- **Local dev** is unchanged: `npm run dev:full` (Vite + proxy), keys from `.env`.
- The deterministic engine and CAD builder run **in the browser**; the backend only brokers the LLM
  calls and runs the tool loop — so model keys never reach the client.
