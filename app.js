const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Configuration
const { MONGO_URI, JWT_SECRET, PORT } = process.env;

// SSL Setup
const sslOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com-0003/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com-0003/fullchain.pem')
};

// Middleware
app.use(express.json());
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 1. Model Definition - Completely self-contained
const VerifiedAgent = mongoose.model('VerifiedAgent') || mongoose.model('VerifiedAgent', 
  new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    status: { type: String, default: 'pending' },
    verifiedAt: { type: Date },
    documents: [{ type: String }]
  }, { timestamps: true })
);

// 2. Controller Logic - Embedded directly in app.js
const verifiedAgentController = {
  create: async (req, res) => {
    try {
      const agent = await VerifiedAgent.create(req.body);
      res.status(201).json(agent);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  getAll: async (req, res) => {
    try {
      const agents = await VerifiedAgent.find();
      res.json(agents);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  getById: async (req, res) => {
    try {
      const agent = await VerifiedAgent.findById(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      res.json(agent);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

// 3. Route Setup - Self-contained routing
app.use('/api/verified-agents', express.Router()
  .post('/', verifiedAgentController.create)
  .get('/', verifiedAgentController.getAll)
  .get('/:id', verifiedAgentController.getById)
);

// Database Connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000
})
.then(() => {
  console.log('MongoDB connected');
  
  // Health Check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      models: ['VerifiedAgent'],
      dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
  });

  // Start Server
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server running on https://api.milestono.com:${PORT}`);
    console.log('Available routes:');
    console.log('- POST /api/verified-agents');
    console.log('- GET /api/verified-agents');
    console.log('- GET /api/verified-agents/:id');
  });
})
.catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

module.exports = app;
