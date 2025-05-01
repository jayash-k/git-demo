const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Express app
const app = express();

// Configuration
const { 
  MONGO_URI, 
  PORT = 443,
  SSL_CERT_DIR = '/etc/letsencrypt/live/api.milestono.com'
} = process.env;

// ======================
// 1. SSL Configuration
// ======================
const sslConfig = (() => {
  try {
    const certPath = path.join(SSL_CERT_DIR, 'fullchain.pem');
    const keyPath = path.join(SSL_CERT_DIR, 'privkey.pem');
    const caPath = path.join(SSL_CERT_DIR, 'chain.pem');

    // Validate certificate files exist
    if (!fs.existsSync(certPath) throw new Error('Missing certificate file');
    if (!fs.existsSync(keyPath)) throw new Error('Missing private key file');

    // Check certificate expiration
    const certData = fs.readFileSync(certPath, 'utf8');
    const expiryMatch = certData.match(/Not After : (.+)/);
    if (expiryMatch && new Date(expiryMatch[1]) < new Date()) {
      throw new Error('SSL certificate has expired');
    }

    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined
    };
  } catch (error) {
    console.error('SSL Configuration Error:', error.message);
    process.exit(1);
  }
})();

// ======================
// 2. Database Setup
// ======================
const dbConnection = (async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000
    });
    console.log('MongoDB connected successfully');
    return mongoose.connection;
  } catch (error) {
    console.error('Database Connection Error:', error.message);
    process.exit(1);
  }
})();

// ======================
// 3. Model Definitions
// ======================
const models = {
  VerifiedAgent: mongoose.model('VerifiedAgent', new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    verificationDate: { type: Date },
    documents: [{ type: String }]
  }, { timestamps: true }))
};

// ======================
// 4. Controller Logic
// ======================
const controllers = {
  verifiedAgents: {
    create: async (req, res) => {
      try {
        const agent = await models.VerifiedAgent.create(req.body);
        res.status(201).json(agent);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
    list: async (req, res) => {
      try {
        const agents = await models.VerifiedAgent.find();
        res.json(agents);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
    get: async (req, res) => {
      try {
        const agent = await models.VerifiedAgent.findById(req.params.id);
        agent ? res.json(agent) : res.status(404).json({ error: 'Not found' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  }
};

// ======================
// 5. Route Definitions
// ======================
app.use(express.json());

// Verified Agents Routes
app.route('/api/verified-agents')
  .post(controllers.verifiedAgents.create)
  .get(controllers.verifiedAgents.list);

app.get('/api/verified-agents/:id', controllers.verifiedAgents.get);

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    sslValid: sslConfig.cert ? true : false
  });
});

// ======================
// 6. Server Startup
// ======================
dbConnection.then(() => {
  const server = https.createServer(sslConfig, app).listen(PORT, () => {
    console.log(`Server running on https://0.0.0.0:${PORT}`);
    console.log('Available Routes:');
    console.log('- POST /api/verified-agents');
    console.log('- GET /api/verified-agents');
    console.log('- GET /api/verified-agents/:id');
    console.log('- GET /health');
  });

  // Handle server errors
  server.on('error', (error) => {
    console.error('Server Error:', error.message);
    process.exit(1);
  });
});

// ======================
// 7. Error Handling
// ======================
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;
