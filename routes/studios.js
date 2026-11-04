import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB, dbGuard } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Studio listing routes: browse/search, featured picks, the owner's own
 * listings, and owner-only create/update/delete.
 *
 * Route order matters — literal paths (/featured, /my) are registered before
 * /:id so they are never shadowed by the parametric route.
 */

const router = Router();
router.use(dbGuard);

// The exact category strings the frontend filters on.
const CATEGORIES = ['Photo Studio', 'Film Stage', 'Sound Stage', 'Podcast Lounge', 'Music Suite', 'Art Workshop'];

// Fields a client may change on update. Owner, rating and reviews are never
// writable from the client side.
const UPDATABLE_FIELDS = [
  'title',
  'category',
  'hourlyRate',
  'securityDeposit',
  'maxCapacity',
  'location',
  'image',
  'gallery',
  'amenities',
  'overview',
];

const FIELD_LABELS = {
  title: 'Title',
  category: 'Category',
  hourlyRate: 'Hourly rate',
  securityDeposit: 'Security deposit',
  maxCapacity: 'Max capacity',
  location: 'Location',
  image: 'Image',
  gallery: 'Gallery',
  amenities: 'Amenities',
  overview: 'Overview',
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function toFiniteNumber(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

function toObjectId(id) {
  return typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds the MongoDB filter for the browse endpoint from the query string. */
function buildFilter(query) {
  const filter = {};

  if (isNonEmptyString(query.search)) {
    const pattern = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ title: pattern }, { location: pattern }];
  }

  if (isNonEmptyString(query.category)) filter.category = query.category;

  const hourlyRate = {};
  const minRate = toFiniteNumber(query.minRate);
  const maxRate = toFiniteNumber(query.maxRate);
  if (minRate !== null) hourlyRate.$gte = minRate;
  if (maxRate !== null) hourlyRate.$lte = maxRate;
  if (Object.keys(hourlyRate).length > 0) filter.hourlyRate = hourlyRate;

  return filter;
}

function buildSort(sort) {
  switch (sort) {
    case 'price_asc':
      return { hourlyRate: 1, createdAt: -1 };
    case 'price_desc':
      return { hourlyRate: -1, createdAt: -1 };
    case 'rating':
      return { rating: -1, createdAt: -1 };
    default:
      return { createdAt: -1 }; // 'newest'
  }
}

/** Validates a full studio payload; returns {error} or {fields}. */
function validateNewStudio(body) {
  const requiredStrings = ['title', 'category', 'location', 'image', 'overview'];
  const missing = requiredStrings.filter((field) => !isNonEmptyString(body[field]));
  if (missing.length > 0) return { error: `Missing required fields: ${missing.join(', ')}` };

  if (!CATEGORIES.includes(body.category)) return { error: 'Please select a valid studio category' };

  const numbers = {};
  for (const field of ['hourlyRate', 'maxCapacity']) {
    const value = toFiniteNumber(body[field]);
    if (value === null || value <= 0) {
      return { error: 'Hourly rate and max capacity must be positive numbers' };
    }
    numbers[field] = value;
  }
  const deposit = toFiniteNumber(body.securityDeposit);
  if (deposit === null || deposit < 0) {
    return { error: 'Security deposit must be zero or a positive number' };
  }
  numbers.securityDeposit = deposit;

  if (!Array.isArray(body.amenities) || body.amenities.length === 0 || !body.amenities.every(isNonEmptyString)) {
    return { error: 'Please provide at least one amenity' };
  }
  if (body.gallery !== undefined && !Array.isArray(body.gallery)) {
    return { error: 'Gallery must be an array of image URLs' };
  }

  return {
    fields: {
      title: body.title.trim(),
      category: body.category,
      ...numbers,
      location: body.location.trim(),
      image: body.image.trim(),
      gallery: Array.isArray(body.gallery) ? body.gallery : [body.image.trim()],
      amenities: body.amenities,
      overview: body.overview.trim(),
    },
  };
}

/** Validates a partial update payload; returns {error} or {fields}. */
function readUpdatableFields(body) {
  const fields = {};

  for (const field of UPDATABLE_FIELDS) {
    if (!Object.hasOwn(body, field) || body[field] === undefined) continue;
    const value = body[field];
    const label = FIELD_LABELS[field];

    if (['title', 'location', 'image', 'overview'].includes(field)) {
      if (!isNonEmptyString(value)) return { error: `${label} must be a non-empty string` };
      fields[field] = value.trim();
    } else if (field === 'category') {
      if (!CATEGORIES.includes(value)) return { error: 'Please select a valid studio category' };
      fields[field] = value;
    } else if (['hourlyRate', 'maxCapacity'].includes(field)) {
      const parsed = toFiniteNumber(value);
      if (parsed === null || parsed <= 0) return { error: `${label} must be a positive number` };
      fields[field] = parsed;
    } else if (field === 'securityDeposit') {
      const parsed = toFiniteNumber(value);
      if (parsed === null || parsed < 0) return { error: 'Security deposit must be zero or a positive number' };
      fields[field] = parsed;
    } else if (field === 'gallery') {
      if (!Array.isArray(value)) return { error: 'Gallery must be an array of image URLs' };
      fields[field] = value;
    } else if (field === 'amenities') {
      if (!Array.isArray(value) || value.length === 0 || !value.every(isNonEmptyString)) {
        return { error: 'Amenities must be a non-empty list of strings' };
      }
      fields[field] = value;
    }
  }

  return { fields };
}

// GET /api/studios — paginated, filterable browse list.
router.get('/', async (req, res) => {
  const limit = toPositiveInt(req.query.limit, 9, 100);
  const page = toPositiveInt(req.query.page, 1);
  const filter = buildFilter(req.query);
  const studios = getDB().collection('studios');

  const [total, docs] = await Promise.all([
    studios.countDocuments(filter),
    studios
      .find(filter)
      .sort(buildSort(req.query.sort))
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
  ]);

  res.json({ studios: docs, total, page, pages: Math.ceil(total / limit) });
});

// GET /api/studios/featured — best-rated studios for the landing page.
router.get('/featured', async (req, res) => {
  const studios = await getDB()
    .collection('studios')
    .find({})
    .sort({ rating: -1, createdAt: -1 })
    .limit(6)
    .toArray();
  res.json({ studios });
});

// GET /api/studios/my — the listings owned by the signed-in user.
router.get('/my', requireAuth, async (req, res) => {
  if (req.query.email !== req.user.email) {
    return res.status(403).json({ error: 'You can only view your own listings' });
  }
  const studios = await getDB()
    .collection('studios')
    .find({ ownerEmail: req.user.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ studios });
});

// GET /api/studios/:id — single studio detail (kept after /featured and /my).
router.get('/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  const studio = _id ? await getDB().collection('studios').findOne({ _id }) : null;
  if (!studio) return res.status(404).json({ error: 'Studio not found' });
  res.json({ studio });
});

// POST /api/studios — create a listing; ownership comes from the JWT, not the body.
router.post('/', requireAuth, async (req, res) => {
  const { error, fields } = validateNewStudio(req.body ?? {});
  if (error) return res.status(400).json({ error });

  const now = new Date();
  const studio = {
    ...fields,
    ownerName: req.user.name,
    ownerEmail: req.user.email,
    rating: 0,
    reviews: [],
    createdAt: now,
    updatedAt: now,
  };

  const result = await getDB().collection('studios').insertOne(studio);
  studio._id = result.insertedId;
  return res.status(201).json({ studio });
});

// PUT /api/studios/:id — owner-only update of allowed fields.
router.put('/:id', requireAuth, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const studios = getDB().collection('studios');
  const studio = _id ? await studios.findOne({ _id }) : null;
  if (!studio) return res.status(404).json({ error: 'Studio not found' });
  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).json({ error: 'You are not authorized to update this studio' });
  }

  const { error, fields } = readUpdatableFields(req.body ?? {});
  if (error) return res.status(400).json({ error });
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No updatable fields were provided' });

  const updatedAt = new Date();
  await studios.updateOne({ _id }, { $set: { ...fields, updatedAt } });
  return res.json({ studio: { ...studio, ...fields, updatedAt } });
});

// DELETE /api/studios/:id — owner-only removal.
router.delete('/:id', requireAuth, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const studios = getDB().collection('studios');
  const studio = _id ? await studios.findOne({ _id }) : null;
  if (!studio) return res.status(404).json({ error: 'Studio not found' });
  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).json({ error: 'You are not authorized to delete this studio' });
  }

  await studios.deleteOne({ _id });
  return res.json({ message: 'Studio deleted successfully' });
});

export default router;
