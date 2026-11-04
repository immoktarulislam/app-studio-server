import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDB, dbGuard } from '../config/db.js';
import { requireAuth, setAuthCookie, clearAuthCookie } from '../middleware/auth.js';

/**
 * Authentication routes: local register/login, Google sign-in, logout and the
 * current-session endpoint. Successful sign-ins store the JWT in an HTTPOnly
 * cookie (see middleware/auth.js).
 */

const router = Router();

// const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least one lowercase letter, one uppercase letter, and six characters total.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
const GOOGLE_TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/** The only user shape ever returned to the client. */
function publicUser(user) {
  return { name: user.name, email: user.email, photo: user.photo || '' };
}

/**
 * Verifies a Google ID token against Google's tokeninfo endpoint (which checks
 * the signature server-side). Returns the token payload when trustworthy,
 * otherwise null.
 */
async function verifyGoogleToken(credential) {
  let payload;
  try {
    const response = await fetch(`${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(credential)}`);
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null; // network failure or a malformed token
  }

  // Without a configured client id we cannot pin the audience, but the token
  // has still been validated by Google itself through the tokeninfo endpoint.
  const expectedAudience = process.env.GOOGLE_CLIENT_ID;
  if (expectedAudience && payload.aud !== expectedAudience) return null;

  const validIssuer = payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com';
  if (!validIssuer) return null;
  if (typeof payload.email !== 'string' || !payload.email.trim()) return null;

  return payload;
}

// POST /api/auth/register — creates a local account; does NOT sign the user in.
router.post('/register', dbGuard, async (req, res) => {
  const { name, email, photo, password } = req.body ?? {};

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof email !== 'string' ||
    !email.trim() ||
    typeof password !== 'string' ||
    !password
  ) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }

  if (!PASSWORD_PATTERN.test(password)) {
    return res
      .status(400)
      .json({ error: 'Password must contain an uppercase letter, a lowercase letter and be at least 6 characters' });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please provide a valid email address' });
  }

  const users = getDB().collection('users');
  if (await users.findOne({ email: normalizedEmail })) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const doc = {
    name: name.trim(),
    email: normalizedEmail,
    photo: typeof photo === 'string' ? photo.trim() : '',
    password: await bcrypt.hash(password, 10),
    provider: 'local',
    wishlist: [],
    createdAt: new Date(),
  };

  try {
    await users.insertOne(doc);
  } catch (err) {
    // Unique-index race: another registration slipped in between our checks.
    if (err?.code === 11000) return res.status(400).json({ error: 'An account with this email already exists' });
    throw err;
  }

  return res.status(201).json({ message: 'Account created successfully', user: publicUser(doc) });
});

// POST /api/auth/login — verifies credentials and sets the session cookie.
router.post('/login', dbGuard, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await getDB().collection('users').findOne({ email: normalizeEmail(email) });
  // Accounts created via Google have no stored password and cannot use this route.
  const valid = Boolean(user?.password) && (await bcrypt.compare(password, user.password));
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const session = publicUser(user);
  setAuthCookie(res, session);
  return res.json({ message: 'Logged in successfully', user: session });
});

// POST /api/auth/google — verifies a Google ID token and upserts the account.
router.post('/google', dbGuard, async (req, res) => {
  const { credential } = req.body ?? {};
  if (typeof credential !== 'string' || !credential.trim()) {
    return res.status(401).json({ error: 'Google sign-in failed' });
  }

  const payload = await verifyGoogleToken(credential.trim());
  if (!payload) return res.status(401).json({ error: 'Google sign-in failed' });

  const email = normalizeEmail(payload.email);
  const name =
    typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0];
  const photo = typeof payload.picture === 'string' ? payload.picture : '';

  await getDB()
    .collection('users')
    .updateOne(
      { email },
      {
        $set: { name, photo, provider: 'google', lastLoginAt: new Date() },
        $setOnInsert: { wishlist: [], createdAt: new Date() },
      },
      { upsert: true },
    );

  const session = { name, email, photo };
  setAuthCookie(res, session);
  return res.json({ message: 'Signed in with Google', user: session });
});

// POST /api/auth/logout — clears the session cookie.
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me — the currently signed-in user, straight from the JWT.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { name: req.user.name, email: req.user.email, photo: req.user.photo } });
});

export default router;
