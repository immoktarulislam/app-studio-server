import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB, dbGuard } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Booking routes. Every booking belongs to the signed-in user (taken from the
 * JWT), and overlapping slots for the same studio/day are rejected up front —
 * the core double-booking prevention of this project.
 */

const router = Router();
router.use(requireAuth, dbGuard);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Statuses that occupy a time slot (Cancelled bookings do not).
const ACTIVE_STATUSES = ['Pending', 'Confirmed'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toObjectId(id) {
  return typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Today's local date as YYYY-MM-DD (same format the API stores). */
function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// POST /api/bookings — reserve a slot (with overlap prevention).
router.post('/', async (req, res) => {
  const { studioId, date, startTime, endTime } = req.body ?? {};

  if (!isNonEmptyString(studioId)) return res.status(400).json({ error: 'Studio id is required' });
  const _id = toObjectId(studioId);
  const studio = _id ? await getDB().collection('studios').findOne({ _id }) : null;
  if (!studio) return res.status(404).json({ error: 'Studio not found' });

  // --- Date validation -----------------------------------------------------
  if (!isNonEmptyString(date)) return res.status(400).json({ error: 'Booking date is required' });
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
    return res.status(400).json({ error: 'Booking date must be a valid date in YYYY-MM-DD format' });
  }
  if (date < todayString()) return res.status(400).json({ error: 'Booking date cannot be in the past' });

  // --- Time validation -----------------------------------------------------
  if (!isNonEmptyString(startTime)) return res.status(400).json({ error: 'Start time is required' });
  if (!isNonEmptyString(endTime)) return res.status(400).json({ error: 'End time is required' });
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return res.status(400).json({ error: 'Start and end times must use HH:MM format' });
  }
  if (endTime <= startTime) return res.status(400).json({ error: 'End time must be after start time' });

  const hours = Math.max(1, Math.ceil((toMinutes(endTime) - toMinutes(startTime)) / 60));
  const totalPrice = hours * studio.hourlyRate;

  // --- Double-booking prevention -------------------------------------------
  // Overlap rule: existing.start < new.end AND existing.end > new.start.
  // Zero-padded HH:MM strings compare correctly with < and >.
  const bookings = getDB().collection('bookings');
  const overlap = await bookings.findOne({
    studioId: studio._id.toString(),
    date,
    status: { $in: ACTIVE_STATUSES },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });
  if (overlap) {
    return res.status(409).json({
      error: 'This time slot is already booked for the selected date. Please choose another time.',
    });
  }

  const booking = {
    studioId: studio._id.toString(),
    studioTitle: studio.title,
    studioImage: studio.image,
    studioLocation: studio.location,
    userEmail: req.user.email,
    userName: req.user.name,
    date,
    startTime,
    endTime,
    hours,
    totalPrice,
    status: 'Pending',
    createdAt: new Date(),
  };

  const result = await bookings.insertOne(booking);
  booking._id = result.insertedId;
  return res.status(201).json({ booking });
});

// GET /api/bookings — the signed-in user's bookings, newest first.
router.get('/', async (req, res) => {
  if (req.query.email !== req.user.email) {
    return res.status(403).json({ error: 'You can only view your own bookings' });
  }
  const bookings = await getDB()
    .collection('bookings')
    .find({ userEmail: req.user.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ bookings });
});

// PATCH /api/bookings/:id/cancel — owner may cancel while still Pending.
router.patch('/:id/cancel', async (req, res) => {
  const _id = toObjectId(req.params.id);
  const bookings = getDB().collection('bookings');
  const booking = _id ? await bookings.findOne({ _id }) : null;
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.userEmail !== req.user.email) {
    return res.status(403).json({ error: 'You are not authorized to cancel this booking' });
  }
  if (booking.status !== 'Pending') return res.status(400).json({ error: 'Only pending bookings can be cancelled' });

  await bookings.updateOne({ _id }, { $set: { status: 'Cancelled' } });
  booking.status = 'Cancelled';
  return res.json({ booking });
});

export default router;
