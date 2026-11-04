# StudioSpace API

**Live API:** https://app-studio-server.vercel.app
**Frontend:** https://app-studio-client.vercel.app

The REST API behind StudioSpace, a peer-to-peer marketplace for creative studios. It is a plain **Express 5** application (ESM) backed by **MongoDB Atlas**, serving authentication, studio listings, bookings and wishlists to the Next.js client.

Open the live URL in a browser and you get a JSON description of the API — every real endpoint lives under `/api`.

## ✨ Features

- **Auth in HTTPOnly cookies** — JWT session cookie (`studiospace_token`, 7-day lifetime) is `HttpOnly` and `Secure`, and switches to `SameSite=None` in production so the cross-site client can send it. Client-side scripts can never read the token.
- **Local + Google sign-in** — bcrypt-hashed passwords with uppercase/lowercase/6+ validation, and Google ID tokens verified server-side against `iss`, `aud` and Google's `tokeninfo` endpoint before an account is upserted.
- **Studio CRUD with ownership checks** — create, edit and delete listings; `PUT`/`DELETE` only succeed for the authenticated owner, and the payload is validated field-by-field against a whitelist.
- **Double-booking protection** — a booking is rejected with `409` when its slot overlaps an existing `Pending`/`Confirmed` reservation for the same studio and date.
- **Filterable, paginated browse** — free-text search across title/location, category, min/max hourly rate, four sort orders and page-based pagination.
- **Serverless-ready** — exports the app as the default handler, skips `listen()` on Vercel, and `dbGuard` waits for MongoDB on a cold start instead of answering `503`. Local development is unchanged (`npm run dev`).
- **Resilient by design** — a down database never crashes the process: failures are logged and retried while the API keeps serving; centralized 404 and error handlers return JSON for every route.

## 🛠 Tech Stack

| Layer | Technologies |
| --- | --- |
| Runtime | Node.js (ESM, `"type": "module"`) |
| Web framework | Express 5 |
| Database | MongoDB Atlas via the official `mongodb` driver |
| Auth | `jsonwebtoken` + `bcryptjs`, cookie session |
| CORS | `cors` with a comma-separated origin allow-list |
| Config | `dotenv` (local only — Vercel env vars in production) |
| Hosting | Vercel (zero-config Express Function) |

## 📁 Project Structure

```
app-studio-server/
├── index.js            # Express entry point: middleware, routes, 404/error handlers, boot
├── config/
│   └── db.js           # Shared MongoClient, connectDB()/dbGuard()/closeDB()
├── middleware/
│   └── auth.js         # JWT sign/verify, cookie helpers, requireAuth/optionalAuth
├── routes/
│   ├── auth.js         # /api/auth      — register, login, google, logout, me
│   ├── studios.js      # /api/studios   — browse, featured, CRUD
│   ├── bookings.js     # /api/bookings  — create, list, cancel (overlap-safe)
│   └── wishlist.js     # /api/wishlist  — per-user saved studios
├── seed/
│   └── seed.js         # Wipes & rebuilds demo data (npm run seed)
├── .env.example        # Template for local environment variables
├── .vercelignore       # Keeps .env and local artifacts off Vercel
└── DEPLOY.md           # Step-by-step Vercel deployment guide + troubleshooting
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20 or newer
- A MongoDB database (local `mongod` or a free Atlas cluster)

### 1. Install

```bash
cd app-studio-server
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | MongoDB connection string. The database name is taken from its path. |
| `MONGODB_DB` | ✅ for Atlas URIs without a path | Overrides the database name (e.g. `studiospace`). Wins over the URI path. |
| `JWT_SECRET` | ✅ | Long random string used to sign session cookies. |
| `CLIENT_URL` | ✅ | Comma-separated CORS allow-list, e.g. `https://app-studio-client.vercel.app,http://localhost:3000`. |
| `PORT` | optional | Local port, defaults to `5000`. |
| `GOOGLE_CLIENT_ID` | optional | OAuth Web client ID; enables Google sign-in verification. |

> `.env` is ignored by both `.gitignore` and `.vercelignore`, so local secrets are never committed or uploaded. In production these values are set in the Vercel dashboard instead.

### 3. Seed demo data (optional)

```bash
npm run seed
```

Wipes and rebuilds the `users`, `studios` and `bookings` collections with realistic data. The script is idempotent — running it twice produces the same result.

**Demo accounts** (password for all: `Demo1234`)

| Email | Name |
| --- | --- |
| `sarah@studiospace.io` | Sarah Chen |
| `marcus@studiospace.io` | Marcus Reed |
| `aisha@studiospace.io` | Aisha Patel |

Seed contents: **3 users · 12 studios across 6 categories · 3 bookings**.

### 4. Run

```bash
npm run dev     # auto-restart on change (node --watch), http://localhost:5000
npm start       # plain production start
```

Verify: `http://localhost:5000/api/health` → `{"ok":true}`

## 📚 API Reference

All endpoints return JSON. Protected routes require a valid session cookie and answer `401` without one.

### Core

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | — | Human-readable API description |
| GET | `/api/health` | — | Liveness probe, always `{"ok":true}` |

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | Creates a local account. Does **not** sign the user in. |
| POST | `/api/auth/login` | — | Email + password; sets the session cookie. |
| POST | `/api/auth/google` | — | Verifies a Google ID token, upserts the account, sets the cookie. |
| POST | `/api/auth/logout` | — | Clears the session cookie. |
| GET | `/api/auth/me` | ✅ | Current user straight from the JWT. |

**Register body:** `{ name, email, password, photo? }`
Password must contain an uppercase letter, a lowercase letter and be at least 6 characters (`/^(?=.*[a-z])(?=.*[A-Z]).{6,}$/`).

**Responses:** `201` created · `400` validation / duplicate email · `401` bad credentials.

### Studios — `/api/studios`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/studios` | — | Paginated, filterable browse list |
| GET | `/api/studios/featured` | — | Top 6 studios by rating — powers the home page grid |
| GET | `/api/studios/:id` | — | Single studio |
| GET | `/api/studios/my?email=` | ✅ | Studios owned by the signed-in user — `email` must match the session (`403` otherwise) |
| POST | `/api/studios` | ✅ | Create a listing (owner = signed-in user) |
| PUT | `/api/studios/:id` | ✅ owner | Update whitelisted fields |
| DELETE | `/api/studios/:id` | ✅ owner | Delete a listing |

**Query parameters for `GET /api/studios`:**

| Param | Values | Default |
| --- | --- | --- |
| `search` | Regex-escaped match on `title` or `location` | — |
| `category` | `Photo Studio` · `Film Stage` · `Sound Stage` · `Podcast Lounge` · `Music Suite` · `Art Workshop` | — |
| `minRate` / `maxRate` | numeric hourly-rate bounds | — |
| `sort` | `newest` · `price_asc` · `price_desc` · `rating` | `newest` |
| `page` | page number | `1` |
| `limit` | results per page (max 100) | `9` |

**Response shape:** `{ studios, total, page, pages }`

### Bookings — `/api/bookings`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/bookings` | ✅ | Reserve a slot (overlap-safe) |
| GET | `/api/bookings?email=` | ✅ | The signed-in user's bookings, newest first |
| PATCH | `/api/bookings/:id/cancel` | ✅ owner | Cancel a `Pending` booking |

**Create body:** `{ studioId, date, startTime, endTime }` with `date` as `YYYY-MM-DD` and times as `HH:MM`. The server validates the date is not in the past, `endTime > startTime`, computes `hours` and `totalPrice` (`hours × hourlyRate`), and stores status `Pending`.

**Overlap rule:** `existing.start < new.end AND existing.end > new.start` for the same studio/date where status is `Pending` or `Confirmed` → `409 Conflict`.

**Statuses:** `Pending` → `Confirmed` / `Completed` / `Cancelled`. Only `Pending` bookings can be cancelled.

**Responses:** `201` created · `400` invalid input · `403` not your booking · `404` studio not found · `409` slot taken.

### Wishlist — `/api/wishlist`

All routes require a session. The wishlist is an array of studio ids stored on the user document.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/wishlist` | Just the saved studio ids |
| GET | `/api/wishlist/studios` | Full studio documents for every saved id |
| POST | `/api/wishlist/:studioId` | Idempotent toggle — returns `{ wishlist, added }` |

## 🗄 Data Model

| Collection | Purpose | Notable fields |
| --- | --- | --- |
| `users` | Accounts and saved wishlists | `name`, `email`, `password` (bcrypt, Google users have none), `provider`, `wishlist[]`, `createdAt` |
| `studios` | Listings | `title`, `category`, `location`, `hourlyRate`, `securityDeposit`, `maxCapacity`, `amenities[]`, `gallery[]`, `overview`, `rating`, `ownerName`, `ownerEmail` |
| `bookings` | Reservations | `studioId`, `userEmail`, `date`, `startTime`, `endTime`, `hours`, `totalPrice`, `status` |

`config/db.js` derives the database name from `MONGODB_URI`'s path and falls back to `studiospace` (or the `MONGODB_DB` override). Connections are shared: `connectDB()` de-duplicates concurrent callers so a cold start opens exactly one `MongoClient`.

## 🔐 Authentication & CORS

```js
// middleware/auth.js
{
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure:    process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 days,
}
```

- `requireAuth` rejects with `401`; `optionalAuth` attaches `req.user` when present but never rejects.
- The cookie carries only the public profile (`email`, `name`, `photo`) — no password, no roles.
- `CLIENT_URL` is split on commas into an allow-list, so the deployed client and `localhost` work simultaneously. Requests from unlisted origins receive no CORS headers and are blocked by the browser.

```js
// index.js
const CLIENT_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: CLIENT_ORIGINS, credentials: true }));
```

## 📦 Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with automatic restart on file changes (`node --watch`) |
| `npm start` | Start the server once |
| `npm run seed` | Wipe and rebuild demo data |

## 🚢 Deployment

Vercel detects `index.js` at the project root and runs the app as a single Function — no `vercel.json` is needed. Two serverless-specific details are already handled:

- `export default app` is the handler, and `app.listen()` only runs when `process.env.VERCEL` is unset, so local dev behaves exactly as before.
- `dbGuard` waits up to 10 seconds for MongoDB on a cold start instead of immediately answering `503`.

**Live endpoints**

```
GET https://app-studio-server.vercel.app/            → API description
GET https://app-studio-server.vercel.app/api/health  → {"ok":true}
GET https://app-studio-server.vercel.app/api/studios → Atlas data
```

Full walkthrough, environment variables, Atlas network access and a troubleshooting table: **[DEPLOY.md](./DEPLOY.md)**.

## 🐛 Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `503 {"error":"Database unavailable"}` | `MONGODB_URI`/`MONGODB_DB` missing, or Atlas blocks the caller → allow `0.0.0.0/0` in Network Access |
| `JWT_SECRET environment variable is not set` | Set `JWT_SECRET` (locally in `.env`, on Vercel in Settings → Environment Variables) and restart/redeploy |
| CORS error in the browser | The client origin is missing from `CLIENT_URL` → add it (comma-separated) and **redeploy** |
| Login works locally but not live | Both apps must be `https://`; `SameSite=None; Secure` is applied automatically when `NODE_ENV=production` |
| Data missing after seeding | Confirm the URI path (or `MONGODB_DB`) points at the database you seeded |
| `404 {"error":"Route not found: ..."}` | Wrong path — this host serves the REST API only; try `/` or `/api/health` |

## 📖 Related

- [app-studio-client](../app-studio-client/README.md) — the Next.js frontend
- [DEPLOY.md](./DEPLOY.md) — Vercel deployment guide
