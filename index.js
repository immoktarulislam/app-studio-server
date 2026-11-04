/**
 * StudioSpace API — Express entry point.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { connectDB, connectWithRetry } from './config/db.js';
import authRouter from './routes/auth.js';
import studiosRouter from './routes/studios.js';
import bookingsRouter from './routes/bookings.js';
import wishlistRouter from './routes/wishlist.js';

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 5000;

// Comma-separated allow-list so localhost and the deployed client can coexist:
// CLIENT_URL=https://my-app.vercel.app,http://localhost:3000
const CLIENT_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// --- Core middleware -------------------------------------------------------
app.use(express.json({ limit: '4mb' }));
app.use(cors({ origin: CLIENT_ORIGINS, credentials: true }));
app.use(cookieParser());

// --- Routes ----------------------------------------------------------------
// Friendly landing so opening the domain directly shows what this is.
app.get('/', (req, res) => {
  res.json({
    name: 'StudioSpace API',
    status: 'ok',
    description: 'Peer-to-peer studio rental marketplace — REST API for auth, studios, bookings and wishlist.',
    health: '/api/health',
    endpoints: ['/api/auth', '/api/studios', '/api/bookings', '/api/wishlist'],
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/studios', studiosRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/wishlist', wishlistRouter);

// --- 404 + centralized error handling --------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    hint: 'This host serves the StudioSpace REST API only. Try / or /api/health.',
  });
});

// Express identifies error handlers by arity — keep all four parameters.
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// --- Boot ------------------------------------------------------------------
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set — sign-in will fail until it is configured.');
}

/**
 * Vercel deploys this file as a single Function and uses the default export as
 * the handler, so `listen()` must only run outside of serverless (locally).
 */
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`StudioSpace API listening on port ${PORT} (client origin: ${CLIENT_ORIGINS.join(', ')})`);
  });
}

// The database is optional at boot: failures are logged and retried while the
// API keeps serving (DB-backed routes answer 503 until the connection lands).
// Vercel runs this per invocation — a single bounded attempt is made here, and
// dbGuard() takes over on demand so a cold start waits instead of answering 503.
if (process.env.VERCEL) {
  void connectDB();
} else {
  void connectWithRetry();
}

// process.on('unhandledRejection', (reason) => {
//   console.error('[process] Unhandled promise rejection:', reason);
// });

// process.on('uncaughtException', (err) => {
//   console.error('[process] Uncaught exception:', err);
// });

export default app;
