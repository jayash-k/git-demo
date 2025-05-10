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
    key: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com-0003/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com-0003/fullchain.pem')
};

// Enhanced CORS configuration
app.use(cors({
    origin: FRONT_END_URL,
    methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Enhanced body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// Secure session configuration
app.use(session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,  // Changed for security
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

// Enhanced MongoDB connection with duplicate key error handling
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 30000,
    retryWrites: true,
    w: 'majority'
})
.then(() => {
    console.log('MongoDB connected successfully');
    
    // Handle connection events
    mongoose.connection.on('error', err => {
        console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
    });

    // Start HTTPS server
    https.createServer(sslOptions, app).listen(PORT, () => {
        console.log(`Server started on https://api.milestono.com:${PORT}`);
    });
})
.catch(err => {
    console.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
});

// Health check endpoint with DB status
app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.status(200).json({ 
        status: 'OK', 
        database: dbStatus,
        timestamp: new Date().toISOString()
    });
});

// Apply phone normalization middleware to all relevant routes
app.use((req, res, next) => {
    if (req.body && req.body.phone !== undefined) {
        req.body.phone = req.body.phone === "" ? null : req.body.phone;
    }
    next();
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

// Enhanced error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);

    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        const message = field === 'phone' 
            ? 'Phone number already exists. Leave blank or use a different number.'
            : `${field} must be unique. Please provide a different value.`;
        
        return res.status(409).json({
            error: 'Duplicate data',
            field,
            value: err.keyValue[field],
            message,
            solution: field === 'phone' 
                ? 'Either remove the phone number or provide a unique one'
                : 'Please provide a unique value for this field'
        });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(el => el.message);
        return res.status(400).json({
            error: 'Validation failed',
            messages: errors,
            solution: 'Please check your input data'
        });
    }

    // Default error handler
    res.status(500).json({ 
        error: 'Internal server error',
        requestId: req.id,
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
