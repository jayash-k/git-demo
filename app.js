const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const app = express();

const { MONGO_URI, JWT_SECRET, PORT } = process.env;

// SSL Configuration
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

// Enhanced Model Loader
function getModel(modelName) {
  try {
    return mongoose.model(modelName);
  } catch {
    console.log(`Creating dynamic ${modelName} model`);
    const schema = new mongoose.Schema({
      // Basic fields that match your requirements
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      status: { type: String, default: 'unverified' },
      metadata: { type: mongoose.Schema.Types.Mixed }
    }, { timestamps: true });
    
    return mongoose.model(modelName, schema);
  }
}

// Initialize Models
const VerifiedAgent = getModel('VerifiedAgent');

// Database Connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000
})
.then(() => {
  console.log('MongoDB connected successfully');
  
  // Model Verification
  console.log('VerifiedAgent schema:', Object.keys(VerifiedAgent.schema.paths));

  // Route Configuration
  const router = express.Router();
  
  // Health Check
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      database: 'connected',
      models: {
        VerifiedAgent: {
          fields: Object.keys(VerifiedAgent.schema.paths),
          isDynamic: !VerifiedAgent.schema.paths.verifiedAt // Example check
        }
      }
    });
  });

  // API Routes
  app.use('/api', router);
  app.use('/api/agents', require('./routes/verifiedAgentRoutes'));

  // Start Server
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server running on https://api.milestono.com:${PORT}`);
    console.log('Model status:', {
      VerifiedAgent: VerifiedAgent.schema.paths.status ? 'complete' : 'basic'
    });
  });
})
.catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

module.exports = app;
