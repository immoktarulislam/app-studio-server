import jwt from 'jsonwebtoken';

/**
 * JWT-in-HTTPOnly-cookie authentication.
 *
 * The token carries the signed-in user's public profile ({email, name, photo})
 * and is stored in an HTTPOnly cookie so client-side scripts can never read it.
 */

export const AUTH_COOKIE = 'studiospace_token';
const TOKEN_TTL = '7d';
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

function baseCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // Cross-site requests (production domains) require SameSite=None + Secure.
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/',
  };
}

function signToken(user) {
  return jwt.sign({ email: user.email, name: user.name, photo: user.photo ?? '' }, getSecret(), {
    expiresIn: TOKEN_TTL,
  });
}

/** Reads and verifies the auth cookie. Returns the user profile or null. */
function readUser(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload?.email) return null;
    return {
      email: payload.email,
      name: payload.name ?? '',
      photo: payload.photo ?? '',
    };
  } catch {
    return null; // expired or tampered token
  }
}

/** Issues the auth cookie for a successful sign-in. */
export function setAuthCookie(res, user) {
  res.cookie(AUTH_COOKIE, signToken(user), { ...baseCookieOptions(), maxAge: TOKEN_MAX_AGE_MS });
}

/** Removes the auth cookie on sign-out. */
export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, baseCookieOptions());
}

/** Requires a valid session — answers 401 otherwise. */
export function requireAuth(req, res, next) {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

/** Attaches req.user when a valid session exists, but never rejects. */
export function optionalAuth(req, res, next) {
  req.user = readUser(req);
  next();
}
