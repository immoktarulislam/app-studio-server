/**
 * StudioSpace seed script — wipes and rebuilds the `studiospace` collections
 * (users, studios, bookings) with realistic demo data. Idempotent: running it
 * twice produces the same result.
 *
 * Run with: npm run seed
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, closeDB } from '../config/db.js';

const SEED_PASSWORD = 'Demo1234';
const WIPED_COLLECTIONS = ['users', 'studios', 'bookings'];

// --- Small date helpers (seed data always looks sensible relative to "now") --
const NOW = new Date();

function daysAgo(days) {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  return date;
}

function daysAhead(days) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date;
}

function toYMD(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function unsplash(photoId) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1400&q=80`;
}

function avatar(image) {
  return `https://i.pravatar.cc/150?img=${image}`;
}

// --- Users ------------------------------------------------------------------
const seedUsers = [
  { name: 'Sarah Chen', email: 'sarah@studiospace.io', photo: avatar(47) },
  { name: 'Marcus Reed', email: 'marcus@studiospace.io', photo: avatar(12) },
  { name: 'Aisha Patel', email: 'aisha@studiospace.io', photo: avatar(32) },
];

// --- Studios (two per category, six categories) ------------------------------
// `owner` is an email from seedUsers; ownerName is resolved at insert time.
const seedStudios = [
  {
    title: 'Golden Hour Photo Loft',
    category: 'Photo Studio',
    hourlyRate: 95,
    securityDeposit: 250,
    maxCapacity: 12,
    location: 'Brooklyn, NY',
    owner: 'sarah@studiospace.io',
    image: unsplash('photo-1554048612-b6a482bc67e5'),
    gallery: [
      unsplash('photo-1554048612-b6a482bc67e5'),
      unsplash('photo-1508700115892-45ecd05ae2ad'),
      unsplash('photo-1452587925148-ce544e77e70d'),
    ],
    amenities: ['Cyc Wall', 'Blackout Curtains', 'Ring Lights', 'Makeup Station', 'Freight Elevator', 'Wi-Fi'],
    overview:
      'A sun-drenched converted warehouse loft with a 14-foot cyc wall and blackout blinds for total light control. A favorite for fashion editorials, product shoots, and portrait sessions.',
    rating: 4.9,
    reviews: [
      {
        name: 'Priya Nair',
        avatarId: 45,
        rating: 5,
        comment: 'The cyc wall is spotless and the blackout blinds make lighting a breeze. We booked eight hours and never once fought the space.',
        daysAgo: 24,
      },
      {
        name: 'Daniel Ortiz',
        avatarId: 14,
        rating: 5,
        comment: 'The freight elevator made load-in easy, and the makeup station kept our talent comfortable between setups.',
        daysAgo: 52,
      },
      {
        name: 'Emily Foster',
        avatarId: 26,
        rating: 4,
        comment: 'Beautiful light and a responsive host. Street parking can be tight, but the studio itself delivered everything we needed.',
        daysAgo: 80,
      },
    ],
  },
  {
    title: 'Daylight Studio 42',
    category: 'Photo Studio',
    hourlyRate: 75,
    securityDeposit: 200,
    maxCapacity: 10,
    location: 'Seattle, WA',
    owner: 'marcus@studiospace.io',
    image: unsplash('photo-1516035069371-29a1b244cc32'),
    gallery: [
      unsplash('photo-1516035069371-29a1b244cc32'),
      unsplash('photo-1542038784456-1ea8e935640e'),
      unsplash('photo-1567443024551-f3e3cc2be870'),
    ],
    amenities: ['North-Facing Windows', 'Seamless Paper Backdrops', 'C-Stands', 'Changing Room', 'Coffee Bar'],
    overview:
      'Soft, consistent north light pours through floor-to-ceiling windows in this quiet studio near Pike Place. A favorite for lifestyle brands and lookbook photography.',
    rating: 4.7,
    reviews: [
      {
        name: 'Tom Beckett',
        avatarId: 33,
        rating: 5,
        comment: 'Consistent north light all afternoon — exactly what our lookbook needed. The seamless rolls are well stocked.',
        daysAgo: 40,
      },
      {
        name: 'Nina Alvarez',
        avatarId: 44,
        rating: 4,
        comment: 'Quiet neighborhood and a friendly front desk. The changing room is small but works fine for small crews.',
        daysAgo: 66,
      },
      {
        name: 'Chris Palmer',
        avatarId: 51,
        rating: 5,
        comment: 'Booked it for a two-day product shoot and the coffee bar earned its keep. We will be back.',
        daysAgo: 95,
      },
    ],
  },
  {
    title: 'Silverline Film Stage',
    category: 'Film Stage',
    hourlyRate: 210,
    securityDeposit: 500,
    maxCapacity: 40,
    location: 'Los Angeles, CA',
    owner: 'marcus@studiospace.io',
    image: unsplash('photo-1485846234645-a62644f84728'),
    gallery: [
      unsplash('photo-1485846234645-a62644f84728'),
      unsplash('photo-1517604931442-7e0c8ed2963c'),
      unsplash('photo-1536440136628-849c177e76a1'),
    ],
    amenities: ['Green Screen', '4K Cinema Cameras', 'Lighting Grid', 'Production Office', 'Silent HVAC', 'Drive-In Access'],
    overview:
      'A full-service sound stage with a 30-foot green screen, catwalk lighting grid, and drive-in access for large set pieces. Used for commercials, music videos, and indie features.',
    rating: 5.0,
    reviews: [
      {
        name: 'Jordan Blake',
        avatarId: 15,
        rating: 5,
        comment: 'The green screen is evenly lit edge to edge and the grid gave us every angle we wanted. A genuine production stage.',
        daysAgo: 18,
      },
      {
        name: 'Sofia Marino',
        avatarId: 20,
        rating: 5,
        comment: 'The production office and silent HVAC made a 12-hour shoot feel organized instead of chaotic.',
        daysAgo: 44,
      },
      {
        name: 'Andre Whitfield',
        avatarId: 53,
        rating: 5,
        comment: 'Drive-in access saved us a day of set building. Our crew booked it again the following month.',
        daysAgo: 70,
      },
      {
        name: 'Maya Lindqvist',
        avatarId: 68,
        rating: 5,
        comment: 'Clean, professional, and the house team knows the gear cold. Best stage we have used in LA.',
        daysAgo: 100,
      },
    ],
  },
  {
    title: 'Backlot Black Box',
    category: 'Film Stage',
    hourlyRate: 165,
    securityDeposit: 400,
    maxCapacity: 30,
    location: 'Atlanta, GA',
    owner: 'aisha@studiospace.io',
    image: unsplash('photo-1478720568477-152d9b164e26'),
    gallery: [
      unsplash('photo-1478720568477-152d9b164e26'),
      unsplash('photo-1440404653325-ab127d49abc1'),
      unsplash('photo-1524985069026-dd778a71c7b4'),
    ],
    amenities: ['Blackout Drapes', 'Dolly Track', 'Lighting Grid', 'Makeup Room'],
    overview:
      'A flexible black box stage that goes from raw concrete to fully dressed in hours. Built for dialogue scenes, tabletop shoots, and dark-mood photography.',
    rating: 4.5,
    reviews: [
      {
        name: 'Rachel Kim',
        avatarId: 9,
        rating: 5,
        comment: 'We went from bare concrete to a dressed set in one morning. The dolly track is a nice bonus.',
        daysAgo: 30,
      },
      {
        name: 'Owen Castillo',
        avatarId: 36,
        rating: 4,
        comment: 'Great flexibility for dialogue work. Would love a slightly larger makeup room, otherwise excellent.',
        daysAgo: 62,
      },
      {
        name: 'Tessa Morgan',
        avatarId: 48,
        rating: 4,
        comment: 'The blackout drapes are heavy duty — total darkness whenever we needed it.',
        daysAgo: 91,
      },
    ],
  },
  {
    title: 'Neon Cinema Sound Stage',
    category: 'Sound Stage',
    hourlyRate: 220,
    securityDeposit: 500,
    maxCapacity: 36,
    location: 'Los Angeles, CA',
    owner: 'aisha@studiospace.io',
    image: unsplash('photo-1501386761578-eac5c94b800a'),
    gallery: [
      unsplash('photo-1501386761578-eac5c94b800a'),
      unsplash('photo-1470229722913-7c0e2dbbafd3'),
      unsplash('photo-1492691527719-9d1e07e534b4'),
    ],
    amenities: ['Isolation Booth', '5.1 Monitoring', 'Neumann Microphones', 'Acoustic Panels', 'Silent HVAC'],
    overview:
      'A purpose-built scoring and ADR stage with double-wall isolation and a calibrated 5.1 monitoring room. Directors book it for dubbing passes and original score sessions.',
    rating: 4.8,
    reviews: [
      {
        name: 'Ben Okafor',
        avatarId: 56,
        rating: 5,
        comment: 'The iso booth is genuinely quiet — you can hear a pin drop on the other side of the glass.',
        daysAgo: 21,
      },
      {
        name: 'Lena Petrov',
        avatarId: 16,
        rating: 5,
        comment: 'Our ADR session ran long and the staff never rushed us. The 5.1 monitoring is calibrated beautifully.',
        daysAgo: 48,
      },
      {
        name: 'Marco Ruiz',
        avatarId: 64,
        rating: 5,
        comment: 'Booked a scoring date with a nine-piece ensemble. Everything worked exactly as promised.',
        daysAgo: 77,
      },
      {
        name: 'Chloe Bennett',
        avatarId: 25,
        rating: 4,
        comment: 'Premium pricing, but the isolation and silent HVAC are worth it for serious audio work.',
        daysAgo: 108,
      },
    ],
  },
  {
    title: 'Riverfront Live Sound Stage',
    category: 'Sound Stage',
    hourlyRate: 140,
    securityDeposit: 350,
    maxCapacity: 40,
    location: 'Nashville, TN',
    owner: 'marcus@studiospace.io',
    image: unsplash('photo-1493225457124-a3eb161ffa5f'),
    gallery: [
      unsplash('photo-1493225457124-a3eb161ffa5f'),
      unsplash('photo-1516280440614-37939bbacd81'),
      unsplash('photo-1502920917128-1aa500764cbd'),
    ],
    amenities: ['Stage Monitor System', 'PA System', 'Acoustic Panels', 'Green Room', 'Loading Dock'],
    overview:
      'A live room with a river view, a house PA, and a proper green room for full-band rehearsals and filmed performances. Load-in runs straight through the dock doors.',
    rating: 4.6,
    reviews: [
      {
        name: 'Darius Cole',
        avatarId: 11,
        rating: 5,
        comment: 'The house PA is loud and clean, and load-in through the dock took ten minutes flat.',
        daysAgo: 27,
      },
      {
        name: 'Hannah Brooks',
        avatarId: 41,
        rating: 5,
        comment: 'Perfect for our filmed showcase — the green room kept the band relaxed between sets.',
        daysAgo: 58,
      },
      {
        name: 'Felix Nguyen',
        avatarId: 59,
        rating: 4,
        comment: 'A room with real character. The acoustic treatment handles a full drum kit well.',
        daysAgo: 86,
      },
    ],
  },
  {
    title: 'Velvet Wave Podcast Suite',
    category: 'Podcast Lounge',
    hourlyRate: 60,
    securityDeposit: 150,
    maxCapacity: 6,
    location: 'Austin, TX',
    owner: 'aisha@studiospace.io',
    image: unsplash('photo-1590602847861-f357a9332bbc'),
    gallery: [
      unsplash('photo-1590602847861-f357a9332bbc'),
      unsplash('photo-1589903308904-1010c2294adc'),
      unsplash('photo-1560439514-4e9645039924'),
    ],
    amenities: ['Neumann Microphones', 'Acoustic Panels', 'Silent HVAC', 'Ring Lights', 'Streaming PC'],
    overview:
      'A cozy four-seat podcast lounge with broadcast-ready microphones and treated walls for clean, dead-quiet takes. Book it by the block for interview days and live shows.',
    rating: 4.9,
    reviews: [
      {
        name: 'Ivy Thompson',
        avatarId: 23,
        rating: 5,
        comment: 'Plugged in, hit record, and the takes came out broadcast-clean. The treated walls make all the difference.',
        daysAgo: 15,
      },
      {
        name: 'Samir Haddad',
        avatarId: 38,
        rating: 5,
        comment: 'Four seats, five mics, zero background noise. Our interview series has never sounded better.',
        daysAgo: 43,
      },
      {
        name: 'Grace Lin',
        avatarId: 49,
        rating: 5,
        comment: 'Hosts leave the room exactly how they found it, and the ring lights make video clips easy.',
        daysAgo: 72,
      },
      {
        name: 'Peter Walsh',
        avatarId: 55,
        rating: 4,
        comment: 'Cozy without feeling cramped. Booking by the block is a fair deal for longer sessions.',
        daysAgo: 104,
      },
    ],
  },
  {
    title: 'Echo Chamber Podcast Lounge',
    category: 'Podcast Lounge',
    hourlyRate: 55,
    securityDeposit: 150,
    maxCapacity: 8,
    location: 'Chicago, IL',
    owner: 'sarah@studiospace.io',
    image: unsplash('photo-1598550476439-6847785fcea6'),
    gallery: [
      unsplash('photo-1598550476439-6847785fcea6'),
      unsplash('photo-1524758631624-e2822e304c36'),
      unsplash('photo-1497215728101-856f4ea42174'),
    ],
    amenities: ['Shure SM7B Microphones', 'Acoustic Panels', 'Video Cameras', 'Coffee Bar'],
    overview:
      'A warm, wood-paneled lounge built for video podcasts, with four-camera presets and a kitchenette for long recording days. Two blocks from the Loop.',
    rating: 4.4,
    reviews: [
      {
        name: 'Alicia Grant',
        avatarId: 18,
        rating: 5,
        comment: 'The wood paneling looks fantastic on camera and the four-camera preset saved our editor hours.',
        daysAgo: 33,
      },
      {
        name: 'Victor Ramos',
        avatarId: 60,
        rating: 4,
        comment: 'Solid mics and a warm room. The kitchenette is small but the coffee is always fresh.',
        daysAgo: 65,
      },
      {
        name: 'Dana Whitfield',
        avatarId: 7,
        rating: 4,
        comment: 'Great value near the Loop. Some street noise during setup, but the doors seal it out once you record.',
        daysAgo: 97,
      },
    ],
  },
  {
    title: 'Blue Note Rehearsal Suite',
    category: 'Music Suite',
    hourlyRate: 120,
    securityDeposit: 300,
    maxCapacity: 15,
    location: 'New Orleans, LA',
    owner: 'sarah@studiospace.io',
    image: unsplash('photo-1598488035139-bdbb2231ce04'),
    gallery: [
      unsplash('photo-1598488035139-bdbb2231ce04'),
      unsplash('photo-1519892300165-cb5542fb47c7'),
      unsplash('photo-1513364776144-60967b0f800f'),
    ],
    amenities: ['Grand Piano', 'Drum Kit', 'Guitar Amps', 'Acoustic Panels', '5.1 Monitoring'],
    overview:
      'A character-filled rehearsal suite with a well-maintained grand piano and a backline of tube amps. Horn sections and singer-songwriters rehearse here before tour.',
    rating: 4.8,
    reviews: [
      {
        name: 'Ellis Turner',
        avatarId: 13,
        rating: 5,
        comment: 'That grand piano is tuned and maintained — our pianist refused to leave.',
        daysAgo: 20,
      },
      {
        name: 'Rosa Delgado',
        avatarId: 46,
        rating: 5,
        comment: 'The backline amps sounded great and the room takes a full horn section without turning to mud.',
        daysAgo: 51,
      },
      {
        name: 'Kofi Mensah',
        avatarId: 62,
        rating: 5,
        comment: 'We rehearsed here for three weeks before tour. Fair rates and zero neighbor complaints.',
        daysAgo: 83,
      },
      {
        name: 'Bella Rossi',
        avatarId: 5,
        rating: 4,
        comment: 'Comfortable room with plenty of outlets. Parking is limited on weekends.',
        daysAgo: 112,
      },
    ],
  },
  {
    title: 'Analog Room Music Suite',
    category: 'Music Suite',
    hourlyRate: 85,
    securityDeposit: 250,
    maxCapacity: 10,
    location: 'Portland, OR',
    owner: 'marcus@studiospace.io',
    image: unsplash('photo-1478737270239-2f02b77fc618'),
    gallery: [
      unsplash('photo-1478737270239-2f02b77fc618'),
      unsplash('photo-1470225620780-dba8ba36b745'),
      unsplash('photo-1487180144351-b8472da7d491'),
    ],
    amenities: ['Analog Console', 'Nearfield Monitors', 'Vocal Booth', 'Acoustic Panels', 'Guitar Amps'],
    overview:
      'A tracking room built around a vintage analog console and a tight vocal booth. Ideal for demos, overdubs, and warm-sounding EPs without the big-studio price tag.',
    rating: 4.3,
    reviews: [
      {
        name: 'Jack Ferrell',
        avatarId: 17,
        rating: 5,
        comment: 'The console has real warmth — our demos finally sounded like records.',
        daysAgo: 37,
      },
      {
        name: 'Mira Kapoor',
        avatarId: 57,
        rating: 4,
        comment: 'The vocal booth is tight but well treated. Great for quick overdubs on a budget.',
        daysAgo: 68,
      },
      {
        name: 'Leo Fontaine',
        avatarId: 66,
        rating: 4,
        comment: 'Straightforward booking and a well-kept room. The monitors translate nicely.',
        daysAgo: 99,
      },
    ],
  },
  {
    title: 'Clay & Canvas Workshop',
    category: 'Art Workshop',
    hourlyRate: 70,
    securityDeposit: 200,
    maxCapacity: 14,
    location: 'Santa Fe, NM',
    owner: 'aisha@studiospace.io',
    image: unsplash('photo-1493106641515-6b5631de4bb9'),
    gallery: [
      unsplash('photo-1493106641515-6b5631de4bb9'),
      unsplash('photo-1565193566173-7a0ee3dbe261'),
      unsplash('photo-1502790671504-542ad42d5189'),
    ],
    amenities: ['Pottery Wheels', 'Kiln Access', 'Sink Stations', 'Natural Light', 'Easels'],
    overview:
      'A hands-on workshop with six pottery wheels, a shared kiln, and deep sinks for easy cleanup. Hosts weekend classes, maker residencies, and team retreats.',
    rating: 4.7,
    reviews: [
      {
        name: 'June Harper',
        avatarId: 21,
        rating: 5,
        comment: 'Six wheels in good condition and plenty of sink space — our class ran without a hitch.',
        daysAgo: 29,
      },
      {
        name: 'Diego Santos',
        avatarId: 42,
        rating: 5,
        comment: 'Kiln access and clear instructions made firing our pieces painless. Great for team events.',
        daysAgo: 60,
      },
      {
        name: 'Amara Osei',
        avatarId: 50,
        rating: 4,
        comment: 'Beautiful natural light for painting sessions. Would love more drying racks.',
        daysAgo: 93,
      },
    ],
  },
  {
    title: "Maker's Loft Art Studio",
    category: 'Art Workshop',
    hourlyRate: 45,
    securityDeposit: 100,
    maxCapacity: 8,
    location: 'Asheville, NC',
    owner: 'sarah@studiospace.io',
    image: unsplash('photo-1460661419201-fd4cecdf8a8b'),
    gallery: [
      unsplash('photo-1460661419201-fd4cecdf8a8b'),
      unsplash('photo-1541961017774-22349e4a1262'),
      unsplash('photo-1513475382585-d06e58bcb0e0'),
    ],
    amenities: ['Easels', 'Wash-Out Sinks', 'Natural Light', 'Work Tables', 'Wi-Fi'],
    overview:
      'A bright loft studio with long communal tables, wash-out sinks, and plenty of natural light for painting and mixed-media classes. Flexible half-day bookings welcome.',
    rating: 4.1,
    reviews: [
      {
        name: 'Cora Blake',
        avatarId: 10,
        rating: 5,
        comment: 'Bright, affordable, and the long tables are perfect for workshops. Half-day booking was easy.',
        daysAgo: 45,
      },
      {
        name: 'Nate Sullivan',
        avatarId: 63,
        rating: 4,
        comment: 'Simple and clean with good light. Bring your own easel clamps if you have a favorite.',
        daysAgo: 75,
      },
    ],
  },
];

// --- Bookings for the demo account (sarah@studiospace.io) -------------------
const seedBookings = [
  {
    studioTitle: 'Golden Hour Photo Loft',
    status: 'Confirmed',
    dateOffset: 30,
    startTime: '10:00',
    endTime: '13:00',
    createdAtOffset: 5,
  },
  {
    studioTitle: 'Velvet Wave Podcast Suite',
    status: 'Pending',
    dateOffset: 14,
    startTime: '14:00',
    endTime: '17:00',
    createdAtOffset: 2,
  },
  {
    studioTitle: 'Blue Note Rehearsal Suite',
    status: 'Completed',
    dateOffset: -30,
    startTime: '09:00',
    endTime: '12:00',
    createdAtOffset: 35,
  },
];

// --- Seed execution ---------------------------------------------------------
async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('[seed] MONGODB_URI is not set. Add it to .env and run the seed again.');
    process.exit(1);
  }

  const db = await connectDB();
  if (!db) {
    console.error('[seed] Could not reach MongoDB — aborting without changes.');
    process.exit(1);
  }

  // Wipe existing data so repeated runs stay consistent.
  for (const name of WIPED_COLLECTIONS) {
    try {
      await db.dropCollection(name);
    } catch (err) {
      if (err?.codeName !== 'NamespaceNotFound') throw err;
    }
  }

  // --- Users (same demo password for every account) ------------------------
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const users = db.collection('users');
  await users.insertMany(
    seedUsers.map((user) => ({
      ...user,
      password: passwordHash,
      provider: 'local',
      wishlist: [],
      createdAt: daysAgo(180),
    })),
  );
  await users.createIndex({ email: 1 }, { unique: true });

  // --- Studios -------------------------------------------------------------
  const ownerNameByEmail = new Map(seedUsers.map((user) => [user.email, user.name]));
  const studios = db.collection('studios');
  const studioDocs = seedStudios.map((seed, index) => {
    const createdAt = daysAgo(130 - index * 7);
    return {
      title: seed.title,
      category: seed.category,
      hourlyRate: seed.hourlyRate,
      securityDeposit: seed.securityDeposit,
      maxCapacity: seed.maxCapacity,
      location: seed.location,
      image: seed.image,
      gallery: seed.gallery,
      amenities: seed.amenities,
      overview: seed.overview,
      ownerName: ownerNameByEmail.get(seed.owner),
      ownerEmail: seed.owner,
      rating: seed.rating,
      reviews: seed.reviews.map((review) => ({
        name: review.name,
        avatar: avatar(review.avatarId),
        rating: review.rating,
        comment: review.comment,
        date: daysAgo(review.daysAgo),
      })),
      createdAt,
      updatedAt: createdAt,
    };
  });
  await studios.insertMany(studioDocs);

  // --- Bookings (studio fields are copied from the seeded studio) ----------
  const sarah = seedUsers[0];
  const bookingDocs = seedBookings.map((seed) => {
    const studio = studioDocs.find((doc) => doc.title === seed.studioTitle);
    const hours = Math.max(1, Math.ceil((toMinutes(seed.endTime) - toMinutes(seed.startTime)) / 60));
    const date = seed.dateOffset >= 0 ? daysAhead(seed.dateOffset) : daysAgo(-seed.dateOffset);
    return {
      studioId: studio._id.toString(),
      studioTitle: studio.title,
      studioImage: studio.image,
      studioLocation: studio.location,
      userEmail: sarah.email,
      userName: sarah.name,
      date: toYMD(date),
      startTime: seed.startTime,
      endTime: seed.endTime,
      hours,
      totalPrice: hours * studio.hourlyRate,
      status: seed.status,
      createdAt: daysAgo(seed.createdAtOffset),
    };
  });
  await db.collection('bookings').insertMany(bookingDocs);

  console.log(
    `[seed] Inserted ${seedUsers.length} users, ${studioDocs.length} studios and ${bookingDocs.length} bookings.`,
  );
  console.log(`[seed] Demo login — email: ${sarah.email} / password: ${SEED_PASSWORD}`);

  await closeDB();
}

main().catch(async (err) => {
  console.error('[seed] Failed:', err);
  await closeDB().catch(() => {});
  process.exit(1);
});
