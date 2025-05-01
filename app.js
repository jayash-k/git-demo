const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Configuration
const { 
  MONGO_URI, 
  PORT = 6005,
  JWT_SECRET = 'default-secret-please-change',
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
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
  googleId: { type: String, unique: true, sparse: true },
  displayName: String,
  email: { type: String, unique: true },
  verified: { type: Boolean, default: false }
}, { timestamps: true }));

const VerifiedAgent = mongoose.model('VerifiedAgent', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  licenseNumber: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  documents: [{
    type: { type: String, enum: ['license', 'certificate', 'other'] },
    url: String
  }],
  verifiedAt: Date
}, { timestamps: true }));

// Middleware
app.use(express.json());
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Authentication Middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized - Please login first' });
  }
  next();
};

// ======================
// AUTHENTICATION ROUTES
// ======================
const authStates = new Map();

// Google OAuth Initiation
app.get('/auth/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  authStates.set(state, { 
    createdAt: Date.now(),
    redirect: req.query.redirect || '/profile'
  });

  // Clear expired states (5 minutes old)
  authStates.forEach((value, key) => {
    if (Date.now() - value.createdAt > 300000) authStates.delete(key);
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID || 'dummy-client-id');
  authUrl.searchParams.append('redirect_uri', `https://api.milestono.com:${PORT}/auth/google/callback`);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'profile email');
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('prompt', 'select_account');

  res.redirect(authUrl.toString());
});

// Google OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
  try {
    if (!req.query.state || !authStates.has(req.query.state)) {
      throw new Error('Invalid state parameter');
    }

    const state = authStates.get(req.query.state);
    authStates.delete(req.query.state);

    // In production: Exchange code for tokens here
    // This is a simplified implementation
    const user = await User.findOneAndUpdate(
      { email: 'test@example.com' },
      {
        googleId: 'test-google-id-' + crypto.randomBytes(8).toString('hex'),
        displayName: 'Test User',
        email: 'test@example.com',
        verified: true
      },
      { upsert: true, new: true }
    );

    req.session.userId = user._id;
    res.redirect(state.redirect);
  } catch (error) {
    console.error('Authentication error:', error);
    res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// ======================
// APPLICATION ROUTES
// ======================
// Profile
app.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/auth/google');
    }
    res.json({
      user: {
        id: user._id,
        name: user.displayName,
        email: user.email,
        verified: user.verified
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verified Agents
app.post('/api/verified-agents', requireAuth, async (req, res) => {
  try {
    const agent = await VerifiedAgent.create({
      userId: req.session.userId,
      ...req.body
    });
    res.status(201).json(agent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/verified-agents', requireAuth, async (req, res) => {
  try {
    const agents = await VerifiedAgent.find({ userId: req.session.userId });
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    auth: req.session.userId ? 'authenticated' : 'unauthenticated'
  });
});

// ======================
// SERVER INITIALIZATION
// ======================
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000
})
.then(() => {
  console.log('MongoDB connected successfully');
  
  const server = https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server running on https://api.milestono.com:${PORT}`);
    console.log('Available Routes:');
    console.log('- GET    /auth/google');
    console.log('- GET    /auth/google/callback');
    console.log('- POST   /auth/logout');
    console.log('- GET    /profile');
    console.log('- POST   /api/verified-agents');
    console.log('- GET    /api/verified-agents');
    console.log('- GET    /health');
  });

  // Handle server errors
  server.on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
})
.catch(error => {
  console.error('Database connection failed:', error);
  process.exit(1);
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;
