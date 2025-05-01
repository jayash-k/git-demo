const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// Configuration
const { 
  MONGO_URI, 
  PORT = 6005,
  JWT_SECRET = 'default-secret',
  SSL_CERT_DIR = '/etc/letsencrypt/live/api.milestono.com-0003'
} = process.env;

// SSL Configuration
const sslOptions = {
  key: fs.readFileSync(path.join(SSL_CERT_DIR, 'privkey.pem')),
  cert: fs.readFileSync(path.join(SSL_CERT_DIR, 'fullchain.pem')),
  ca: fs.readFileSync(path.join(SSL_CERT_DIR, 'chain.pem'))
};

// Database Models
const User = mongoose.model('User', new mongoose.Schema({
  googleId: String,
  displayName: String,
  email: String
}, { timestamps: true }));

const VerifiedAgent = mongoose.model('VerifiedAgent', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  licenseNumber: String,
  status: { type: String, default: 'pending' }
}, { timestamps: true }));

// Session Middleware
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true }
}));

// ===========================================
// SIMPLE GOOGLE OAUTH IMPLEMENTATION
// ===========================================
const crypto = require('crypto');

// Simple session-based auth state
const authStates = {};

// Google OAuth Routes
app.get('/auth/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  authStates[state] = true;
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${process.env.GOOGLE_CLIENT_ID || 'dummy-client-id'}&` +
    `redirect_uri=${encodeURIComponent(`https://api.milestono.com:${PORT}/auth/google/callback`)}&` +
    `response_type=code&` +
    `scope=profile email&` +
    `state=${state}`;
  
  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    if (!authStates[req.query.state]) {
      throw new Error('Invalid state');
    }
    delete authStates[req.query.state];

    // In a real implementation, you would exchange the code for tokens here
    // This is a simplified version that creates a test user
    const testUser = await User.findOneAndUpdate(
      { email: 'test@example.com' },
      {
        googleId: 'test-google-id',
        displayName: 'Test User',
        email: 'test@example.com'
      },
      { upsert: true, new: true }
    );

    req.session.user = testUser;
    res.redirect('/profile');
  } catch (err) {
    console.error('Auth error:', err);
    res.redirect('/login?error=auth_failed');
  }
});

// ===========================================
// APPLICATION ROUTES
// ===========================================
app.use(express.json());

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Profile route
app.get('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/google');
  res.json({ user: req.session.user });
});

// Verified Agent routes
app.post('/api/verified-agents', requireAuth, async (req, res) => {
  try {
    const agent = await VerifiedAgent.create({
      userId: req.session.user._id,
      ...req.body
    });
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/verified-agents', requireAuth, async (req, res) => {
  try {
    const agents = await VerifiedAgent.find({ userId: req.session.user._id });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    auth: req.session.user ? 'authenticated' : 'unauthenticated'
  });
});

// Database Connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000
})
.then(() => {
  console.log('MongoDB connected');
  
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server running on https://api.milestono.com:${PORT}`);
    console.log('Available Routes:');
    console.log('- GET    /auth/google');
    console.log('- GET    /auth/google/callback');
    console.log('- GET    /profile');
    console.log('- POST   /api/verified-agents');
    console.log('- GET    /api/verified-agents');
    console.log('- GET    /health');
  });
})
.catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

module.exports = app;
