const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const client = new MongoClient(process.env.MONGO_URI);
let db;

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
  await client.connect();
  db = client.db('test');
  console.log('Backend listening on port 3000');
});
