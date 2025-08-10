const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const availabilityRoutes = require('./routes/availability');
const settingsRoutes = require('./routes/settings');

const app = express();

app.use(cors({
  origin: 'http://nat20scheduling.com',
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo.nat20scheduling.com:27017/test';
const DB_NAME = process.env.MONGO_DB_NAME || 'test';
const COLLECTION_NAME = process.env.MONGO_COLLECTION || 'people';

mongoose.connect(MONGO_URI, {
  dbName: DB_NAME,
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log(`Connected to MongoDB at ${MONGO_URI}`);
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

app.use(authRoutes);
app.use(availabilityRoutes);
app.use(settingsRoutes);

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
