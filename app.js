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

// Database Connection - must happen before model definition
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000
}).then(() => {
  console.log('MongoDB connected');

  // 1. Model Definition - Proper schema registration
  const verifiedAgentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    status: { type: String, default: 'pending' },
    verifiedAt: { type: Date },
    documents: [{ type: String }]
  }, { timestamps: true });

  const VerifiedAgent = mongoose.models.VerifiedAgent || mongoose.model('VerifiedAgent', verifiedAgentSchema);

  // 2. Controller Logic
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
        agent ? res.json(agent) : res.status(404).json({ error: 'Not found' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  };

  // 3. Route Setup
  app.use('/api/verified-agents', express.Router()
    .post('/', verifiedAgentController.create)
    .get('/', verifiedAgentController.getAll)
    .get('/:id', verifiedAgentController.getById)
  );

  // Health Check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      models: Object.keys(mongoose.models),
      dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
  });

  // Start Server
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server running on https://api.milestono.com:${PORT}`);
    console.log('Available models:', Object.keys(mongoose.models));
  });

}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

module.exports = app;
