// backend/app.js

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectMongoWithRetry(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await client.connect();
      db = client.db('test');
      console.log('✅ MongoDB connected');
      return true;
    } catch (err) {
      console.error(`❌ MongoDB connection failed (attempt ${attempt}):`, err.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, 3000));
    }
  }

  // After max retries, trigger GitHub Actions dispatch
  try {
    await axios.post(
      'https://api.github.com/repos/Navotj/Scheduler-v3/dispatches',
      { event_type: 'update-backend-env' },
      {
        headers: {
        Authorization: `Bearer ${process.env.REPO_DISPATCH_PAT}`,
          Accept: 'application/vnd.github+json'
        }
      }
    );
    console.log('📡 Triggered GitHub workflow to update .env');
  } catch (dispatchErr) {
    console.error('⚠️ Failed to trigger GitHub workflow:', dispatchErr.message);
  }

  return false;
}

app.post('/query', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await db.collection('people').findOne({ name });
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: 'Query failed' });
  }
});

app.listen(3000, async () => {
  const ok = await connectMongoWithRetry();
  if (ok) {
    console.log('Backend listening on port 3000');
  } else {
    console.log('🚫 Backend startup failed due to MongoDB connection');
  }
});
