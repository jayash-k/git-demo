const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// ======================
// 1. Configuration
// ======================
const { 
  MONGO_URI, 
  PORT = 6005,
  JWT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SSL_CERT_DIR = '/etc/letsencrypt/live/api.milestono.com-0003'
} = process.env;

// ======================
// 2. SSL Setup with Correct Path
// ======================
const sslOptions = {
  key: fs.readFileSync(path.join(SSL_CERT_DIR, 'privkey.pem')),
  cert: fs.readFileSync(path.join(SSL_CERT_DIR, 'fullchain.pem')),
  ca: fs.readFileSync(path.join(SSL_CERT_DIR, 'chain.pem'))
};

// Verify SSL files exist
[sslOptions.key, sslOptions.cert, sslOptions.ca].forEach((file, i) => {
  if (!file) {
    const files = ['privkey.pem', 'fullchain.pem', 'chain.pem'];
    console.error(`Missing SSL file: ${path.join(SSL_CERT_DIR, files[i])}`);
    process.exit(1);
  }
});

// ======================
// 3. Database Models
// ======================
const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true },
  displayName: String,
  email: { type: String, unique: true },
  verified: { type: Boolean, default: false }
}, { timestamps: true });

const VerifiedAgentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  licenseNumber: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  documents: [{
    type: { type: String, enum: ['license', 'id', 'other'] },
    url: String
  }],
  verifiedAt: Date
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const VerifiedAgent = mongoose.model('VerifiedAgent', VerifiedAgentSchema);

// ======================
// 4. Authentication Setup
// ======================
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

app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `https://api.milestono.com:${PORT}/auth/google/callback`,
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ $or: [{ googleId: profile.id }, { email: profile.emails[0].value }] });
      
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          displayName: profile.displayName,
          email: profile.emails[0].value
        });
      } else if (!user.googleId) {
        user.googleId = profile.id;
        await user.save();
      }
      
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

// Session Serialization
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ======================
// 5. Route Handlers
// ======================
app.use(express.json());

// Auth Routes
app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: '/login',
    successRedirect: '/profile',
    session: true 
  })
);

// API Routes
const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Verified Agent Endpoints
apiRouter.post('/verified-agents', async (req, res) => {
  try {
    const agent = await VerifiedAgent.create({
      userId: req.user._id,
      ...req.body
    });
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/verified-agents', async (req, res) => {
  try {
    const agents = await VerifiedAgent.find({ userId: req.user._id });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User Profile
app.get('/profile', (req, res) => {
  if (!req.user) return res.redirect('/auth/google');
  res.json({ 
    user: req.user,
    agents: req.user.verifiedAgents || []
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    ssl: true,
    auth: req.user ? 'authenticated' : 'unauthenticated'
  });
});

app.use('/api', apiRouter);

// ======================
// 6. Server Initialization
// ======================
async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000
    });
    
    console.log('MongoDB connected successfully');

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

  } catch (err) {
    console.error('Server startup failed:', err);
    process.exit(1);
  }
}

startServer();

// ======================
// 7. Error Handling
// ======================
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app;
