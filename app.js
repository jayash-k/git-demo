const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
const path = require('path');
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

// Model Assurance System
function ensureModel(modelName, schemaDefinition = {}) {
  try {
    require.resolve(`./models/${modelName}`);
    return require(`./models/${modelName}`);
  } catch (err) {
    console.warn(`${modelName} model not found, creating dynamic schema`);
    return mongoose.model(modelName, new mongoose.Schema(schemaDefinition, { strict: false }));
  }
}

// Preload Critical Models
const models = {
  VerifiedAgent: ensureModel('VerifiedAgent', {
    name: String,
    email: { type: String, unique: true },
    status: { type: String, default: 'pending' }
  })
};

// Route Loader with Graceful Degradation
function safeRequireRoute(routePath) {
  try {
    const routeModule = require(routePath);
    return typeof routeModule === 'function' ? routeModule : express.Router().use(routeModule);
  } catch (err) {
    console.error(`Route load failed: ${routePath}`, err.message);
    
    const router = express.Router();
    router.all('*', (req, res) => {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        details: `The ${path.basename(routePath, '.js')} feature is currently disabled`
      });
    });
    return router;
  }
}

// Database Connection with Model Verification
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000
})
.then(() => {
  console.log('MongoDB connected');
  
  // Verify models
  Object.entries(models).forEach(([name, model]) => {
    console.log(`Model status: ${name} - ${model ? 'available' : 'fallback active'}`);
  });

  // Route Setup
  const apiRouter = express.Router();
  
  // Core Routes
  apiRouter.use('/users', safeRequireRoute('./routes/userRoutes'));
  apiRouter.use('/auth', safeRequireRoute('./routes/authRoutes'));
  
  // Feature Routes (with model dependency awareness)
  apiRouter.use('/verified-agents', (req, res, next) => {
    if (models.VerifiedAgent.schema.paths.status) {
      // Proper model exists
      safeRequireRoute('./routes/verifiedAgentRoutes')(req, res, next);
    } else {
      // Fallback mode
      res.status(501).json({
        error: 'Feature unavailable',
        solution: 'VerifiedAgent model implementation required'
      });
    }
  });

  app.use('/api', apiRouter);

  // Health Check
  app.get('/system/health', (req, res) => {
    res.json({
      status: 'operational',
      database: 'connected',
      models: Object.keys(models).map(name => ({
        name,
        status: models[name].schema.paths.status ? 'complete' : 'fallback'
      }))
    });
  });

  // Start Server
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Secure server running on port ${PORT}`);
    console.log('Model status:', Object.keys(models).map(m => `${m}:${models[m].schema.paths.status ? '✓' : '△'}`));
  });
})
.catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

module.exports = app;
