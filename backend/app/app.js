// backend/app.js (Native MongoDB connection)

const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo.nat20scheduling.com:27017';
const DB_NAME = process.env.MONGO_DB_NAME || 'test';
const COLLECTION_NAME = process.env.MONGO_COLLECTION || 'people';

let mongoClient;
let collection;

async function initMongo() {
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);
  collection = db.collection(COLLECTION_NAME);
  console.log(`Connected to MongoDB at ${MONGO_URI}`);
}

app.post('/query', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = await collection.findOne({ name });
    res.json(result || {});
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Query failed', detail: err.message });
  }
});

app.listen(3000, async () => {
  try {
    await initMongo();
    console.log('Backend listening on port 3000 (native MongoDB mode)');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
});
