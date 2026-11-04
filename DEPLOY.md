# Deploying the StudioSpace API to Vercel

The server is a plain Express app. Vercel detects `index.js` at the project root
and runs it as a single Function — the file already exports the app as the
default export and skips `app.listen()` when `process.env.VERCEL` is set, so no
extra `vercel.json` is required.

## Order matters

The client and server point at each other, so deploy in this order:

1. **Deploy this server** → note its URL (e.g. `https://studio-space-server.vercel.app`)
2. **Deploy the client** with that URL → note *its* URL
3. **Update this server's `CLIENT_URL`** to the client URL and redeploy
4. Add the client URL to the Google Cloud Console origins

## 1. Link and deploy

```powershell
cd D:\assign08\app-studio-server
vercel            # accept defaults; pick a project name, e.g. studio-space-server
vercel --prod     # first production deployment
```

## 2. Environment variables

Dashboard path: **Project → Settings → Environment Variables**
(pasting the Mongo URI in the dashboard keeps it out of shell history).

| Name | Value | Required |
|---|---|---|
| `MONGODB_URI` | your Atlas connection string | ✅ |
| `MONGODB_DB` | `studiospace` | ✅ |
| `JWT_SECRET` | the same secret used locally | ✅ |
| `CLIENT_URL` | `https://<client-url>` (add `http://localhost:3000` after a comma for local dev) | ✅ |
| `GOOGLE_CLIENT_ID` | `865764286269-j6rlgljipni9grne32ep4eenktvelbju.apps.googleusercontent.com` | optional |

Env changes only take effect on a **redeploy**, so run `vercel --prod` again
after adding them.

> `.env` is excluded by `.vercelignore`, so Vercel never receives your local
> secrets — everything above must be set in the dashboard.

## 3. Verify

```
https://<server-url>/api/health          → {"ok":true}
https://<server-url>/api/studios?limit=1 → JSON with "Maker's Loft Art Studio"
```

The seed data already lives in your Atlas `studiospace` database — **no re-seed
is needed**.

## 4. MongoDB Atlas network access

Vercel's IPs change, so Atlas must allow all IPs:

**Atlas → Network Access → IP Access List → Add IP Address → Allow Access From Anywhere (`0.0.0.0/0`)**

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Opening the URL shows raw source code | Vercel did not auto-detect Express → add the fallback `vercel.json` below |
| `503 {"error":"Database unavailable"}` | `MONGODB_URI`/`MONGODB_DB` missing, or Atlas IP list blocks Vercel |
| Login works locally but not live | `CLIENT_URL` must be exactly the client origin (no trailing slash) |
| CORS error in the browser console | `CLIENT_URL` does not match the client URL, or the server was not redeployed after the change |
| Cookies rejected | Both apps must be on `https://` — Vercel provides that; `SameSite=None; Secure` is already applied when `NODE_ENV=production` |

### Fallback `vercel.json` (only if auto-detection fails)

```json
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/" }]
}
```

## Local development is unchanged

`npm run dev` still starts the normal local server on port 5000 —
`process.env.VERCEL` is absent locally, so `app.listen()` runs as before.
