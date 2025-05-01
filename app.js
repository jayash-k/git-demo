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

// SSL options
const sslOptions = {
    key: fs.readFileSync('path/to/private.key'),
    cert: fs.readFileSync('path/to/certificate.crt')
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

// MongoDB connection
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,  // Increase the connection timeout
    socketTimeoutMS: 30000    // Increase the socket timeout
})
.then(() => {
    console.log('MongoDB connected');

    // Start the HTTPS server only after the connection is established
    https.createServer(sslOptions, app).listen(PORT, () => {
        console.log(`Server started on https://api.milestono.com:${PORT}`);
    });
})
.catch(err => {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);  // Exit the process with a failure
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
app.use('/api', require('./routes/verifiedAgentRoutes'));
app.use('/api', require('./routes/agentDashboardRoutes'));

module.exports = app;
