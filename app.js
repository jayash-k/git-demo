const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
const path = require('path'); // Add this
require('dotenv').config();

const app = express();

const { MONGO_URI, JWT_SECRET, PORT } = process.env;

// SSL options
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

// Improved route loading with error handling
function loadRoute(routePath) {
    try {
        return require(routePath);
    } catch (err) {
        console.error(`Failed to load route: ${routePath}`);
        console.error(err);
        // Return a router that responds with 501 for all requests
        const router = express.Router();
        router.all('*', (req, res) => {
            res.status(501).json({ 
                error: 'Service temporarily unavailable',
                details: `Route ${routePath} failed to load`
            });
        });
        return router;
    }
}

// MongoDB connection
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 30000
})
.then(() => {
    console.log('MongoDB connected');

    // Verify critical models exist
    try {
        require.resolve('./models/VerifiedAgent');
        console.log('VerifiedAgent model found');
    } catch (err) {
        console.error('VerifiedAgent model not found!');
        // Handle missing model (create simple one if needed)
        const verifiedAgentSchema = new mongoose.Schema({});
        mongoose.model('VerifiedAgent', verifiedAgentSchema);
        console.warn('Created empty VerifiedAgent model as fallback');
    }

    // Start the HTTPS server
    https.createServer(sslOptions, app).listen(PORT, () => {
        console.log(`Server started on https://api.milestono.com:${PORT}`);
    });
})
.catch(err => {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
});

// Route handlers with error protection
app.use('/api', loadRoute('./routes/userRoutes'));
app.use('/auth', loadRoute('./routes/authRoutes'));
app.use('/api', loadRoute('./routes/propertyRoutes'));
app.use('/api', loadRoute('./routes/serviceRoutes'));
app.use('/api', loadRoute('./routes/accountRoutes'));
app.use('/api', loadRoute('./routes/paymentRoutes'));
app.use('/api', loadRoute('./routes/otherRoutes'));
app.use('/api', loadRoute('./routes/homePageRoutes'));
app.use('/api', loadRoute('./routes/enquiryRoutes'));
app.use('/api', loadRoute('./routes/feedbackRoutes'));
app.use('/api', loadRoute('./routes/projectRoutes'));
app.use('/api', loadRoute('./routes/galleryImageRoutes'));
app.use('/api', loadRoute('./routes/bankRoutes'));
app.use('/api', loadRoute('./routes/agentRoutes'));
app.use('/api', loadRoute('./routes/verifiedAgentRoutes'));
app.use('/api', loadRoute('./routes/agentDashboardRoutes'));

// Fallback for missing routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
