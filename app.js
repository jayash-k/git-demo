require("dotenv").config();
const fs = require('fs');
const https = require('https');
const express = require("express");
const cors = require("cors");
const mongoose = require('mongoose');
const passport = require("./config/googleAuth");
const bodyParser = require('body-parser');
const session = require("express-session");

const { PORT, MONGO_URI, JWT_SECRET, FRONT_END_URL } = process.env;

const app = express();

// SSL options
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com/fullchain.pem')
};

// Enhanced CORS configuration
app.use(cors({
    origin: FRONT_END_URL,
    methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Enhanced body parsing
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// Secure session configuration
app.use(session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,  // Changed to false for security
    cookie: {
        secure: true, // Required for HTTPS
        httpOnly: true,
        sameSite: 'none', // Important for cross-site requests
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Enhanced MongoDB connection with error handling
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 30000
})
.then(() => {
    console.log('MongoDB connected');
    
    // Handle duplicate key errors
    mongoose.connection.on('error', err => {
        if (err.code === 11000) {
            console.error('Duplicate key error - check your unique indexes');
        }
    });

    // Start HTTPS server
    https.createServer(sslOptions, app).listen(PORT, () => {
        console.log(`Server started on https://api.milestono.com:${PORT}`);
    });
})
.catch(err => {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
});

// Route handlers
app.use('/api', require('./routes/userRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/propertyRoutes'));
app.use('/api', require('./routes/serviceRoutes'));
app.use('/api', require('./routes/accountRoutes'));
app.use('/api', require('./routes/paymentRoutes'));
app.use('/api', require('./routes/otherRoutes'));
app.use('/api', require('./routes/homePageRoutes'));
app.use('/api', require('./routes/enquiryRoutes'));
app.use('/api', require('./routes/feedbackRoutes'));
app.use('/api', require('./routes/projectRoutes'));
app.use('/api', require('./routes/galleryImageRoutes'));
app.use('/api', require('./routes/bankRoutes'));
app.use('/api', require('./routes/agentRoutes'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', dbStatus: mongoose.connection.readyState });
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    if (err.name === 'TokenError') {
        return res.status(400).json({ error: 'Authentication failed' });
    }
    
    if (err.code === 11000) {
        return res.status(400).json({ 
            error: 'Duplicate data',
            field: Object.keys(err.keyPattern)[0],
            value: err.keyValue[Object.keys(err.keyPattern)[0]]
        });
    }
    
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
