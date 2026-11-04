import { MongoClient } from 'mongodb';

/**
 * Shared MongoDB connection.
 *
 * The API is built to boot even when the database is unreachable: a failed
 * connection is logged (and retried) while the server keeps serving requests.
 * Routes that need data answer 503 until the connection lands.
 */

// let client = null;
// let db = null;
// let attempts = 0;
// /** In-flight connection attempt, so concurrent callers share one MongoClient. */
// let pending = null;

// const RETRY_INTERVAL_MS = 15000;

/** Derives the database name from MONGODB_URI's path, defaulting to "studiospace". */
function resolveDbName() {
  // MONGODB_DB wins when set, so a URI without a path can still target a database.
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  const uri = process.env.MONGODB_URI;
  if (!uri) return 'studiospace';
  try {
    const { pathname } = new URL(uri);
    const name = decodeURIComponent(pathname.replace(/^\/+/, '')).split('/')[0];
    return name || 'studiospace';
  } catch {
    return 'studiospace';
  }
}

/**
 * Opens the shared client.
 * Resolves with the db handle, or null on failure — never throws, so a down
 * database can never take the process with it.
 */
export async function connectDB() {
  if (db) return db;
  // Boot and the first request can race — share one attempt instead of
  // opening two clients (the loser would leak a connection pool).
  if (pending) return pending;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn(
      '[db] MONGODB_URI is not set — running without a database. Data routes return 503 until it is configured and the server restarted.',
    );
    return null;
  }

  attempts += 1;
  const nextClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  pending = (async () => {
    try {
      await nextClient.connect();
      client = nextClient;
      db = client.db(resolveDbName());
      console.log(`[db] Connected to MongoDB (database "${db.databaseName}")`);
      return db;
    } catch (err) {
      await nextClient.close().catch(() => { });
      console.warn(
        `[db] MongoDB connection failed (attempt ${attempts}): ${err.message}. ` +
        'The server stays up; data routes return 503 until MongoDB is reachable.',
      );
      return null;
    } finally {
      pending = null;
    }
  })();

  return pending;
}

/** Connects now and keeps retrying on an interval until MongoDB is reachable. */
export async function connectWithRetry(intervalMs = RETRY_INTERVAL_MS) {
  // Without a URI there is nothing to retry — connectDB logs the warning once.
  if (!process.env.MONGODB_URI) return connectDB();
  for (; ;) {
    const database = await connectDB();
    if (database) return database;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** The live database handle, or null when not connected. */
export function getDB() {
  return db;
}

/** True once the database connection is established. */
export function dbReady() {
  return db !== null;
}

/**
 * Express guard: waits briefly for the database on a cold start, then rejects
 * with 503 if MongoDB is still unreachable. Serverless functions boot per
 * invocation, so without this wait the very first request would 503 while the
 * connection is still being established.
 */
const BOOT_WAIT_MS = 10000;

export async function dbGuard(req, res, next) {
  if (!db) {
    // connectDB() shares one in-flight attempt, so parallel cold-start
    // requests wait on the same connection rather than opening their own.
    let timer;
    await Promise.race([
      connectDB(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, BOOT_WAIT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

/** Closes the shared client (used by the seed script for a clean exit). */
export async function closeDB() {
  const openClient = client;
  client = null;
  db = null;
  attempts = 0;
  pending = null;
  if (openClient) await openClient.close();
}
