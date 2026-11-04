import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB, dbGuard } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Wishlist routes — a per-user array of saved studio ids stored on the user
 * document. Toggling is idempotent: POST flips the membership of the list.
 */

const router = Router();
router.use(requireAuth, dbGuard);

function toObjectId(id) {
  return typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Reads the signed-in user's wishlist array (empty when missing). */
async function readWishlist(email) {
  const user = await getDB().collection('users').findOne({ email }, { projection: { wishlist: 1 } });
  return Array.isArray(user?.wishlist) ? user.wishlist : [];
}

// GET /api/wishlist/studios — full studio documents for every saved id.
// Registered before the parametric POST route for clarity.
router.get('/studios', async (req, res) => {
  const ids = (await readWishlist(req.user.email)).map(toObjectId).filter(Boolean);
  const studios =
    ids.length > 0
      ? await getDB()
          .collection('studios')
          .find({ _id: { $in: ids } })
          .sort({ createdAt: -1 })
          .toArray()
      : [];
  res.json({ studios });
});

// GET /api/wishlist — just the saved studio ids.
router.get('/', async (req, res) => {
  res.json({ wishlist: await readWishlist(req.user.email) });
});

// POST /api/wishlist/:studioId — add/remove a studio from the wishlist.
router.post('/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const users = getDB().collection('users');

  const user = await users.findOne({ email: req.user.email });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const wishlist = Array.isArray(user.wishlist) ? user.wishlist : [];
  const added = !wishlist.includes(studioId);

  await users.updateOne(
    { email: req.user.email },
    added ? { $addToSet: { wishlist: studioId } } : { $pull: { wishlist: studioId } },
  );

  const nextWishlist = added ? [...wishlist, studioId] : wishlist.filter((id) => id !== studioId);
  return res.json({ wishlist: nextWishlist, added });
});

export default router;
