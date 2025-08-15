const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const availabilityRoutes = require('./routes/availability');
const settingsRoutes = require('./routes/settings');
const usersRoutes = require('./routes/users');

// Load models that need indexes created
const Availability = require('./models/availability');

const app = express();

// add (or ensure) once near app creation:
app.set('trust proxy', true);

// replace your current CORS middleware with:
app.use(cors({
  origin: ['https://www.nat20scheduling.com', 'https://nat20scheduling.com'],
  credentials: true
}));


/**
 * Enforce explicit MONGO_URI to avoid accidental use of deprecated/public hosts.
 * The value is provisioned by Terraform/user_data via SSM into .env on the instance.
 */
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('FATAL: MONGO_URI is required but not set. Refusing to start.');
  process.exit(1);
}

const DB_NAME = process.env.MONGO_DB_NAME || 'nat20';
const COLLECTION_NAME = process.env.MONGO_COLLECTION || 'people';

mongoose.connect(MONGO_URI, {
  dbName: DB_NAME,
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log(`Connected to MongoDB`);
  // Ensure indexes exist in production too
  try {
    await Availability.syncIndexes();
    console.log('Availability indexes synced');
  } catch (e) {
    console.error('Failed to sync Availability indexes:', e);
  }
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

// Health check for ALB
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(authRoutes);
// Mount availability router under /availability so endpoints are /availability/get, /availability/save, /availability/get_many
app.use('/availability', availabilityRoutes);
app.use(settingsRoutes);
// users routes (username existence check)
app.use('/users', usersRoutes);

// legacy test endpoint
const personSchema = new mongoose.Schema({
  name: String
}, { collection: COLLECTION_NAME });

const Person = mongoose.model('Person', personSchema);

app.post('/query', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = await Person.findOne({ name }).lean();
    res.json(result || {});
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Query failed', detail: err.message });
  }
});

app.listen(3000, () => {
  console.log('Backend listening on port 3000');
});
