require("dotenv").config();
const fs = require('fs');
const https = require('https');
const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require('mongoose');
const passport = require("./config/googleAuth");
const bodyParser = require('body-parser');
const session = require("express-session");
const swaggerUi = require("swagger-ui-express");
const { swaggerSpec, uiConfig } = require("./swagger");
const { PORT, MONGO_URI, JWT_SECRET, FRONT_END_URL } = process.env;

// SSL options
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com-0003/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/api.milestono.com-0003/fullchain.pem')
};

// Middleware
app.use(cors({
    origin: FRONT_END_URL,
    methods: "GET,POST,PUT,DELETE,PATCH",
    credentials: true
}));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Swagger documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, uiConfig));

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
        console.log(`Swagger docs available at https://api.milestono.com:${PORT}/api-docs`);
    });
})
.catch(err => {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);  // Exit the process with a failure
});

// Routes
app.use('/api', require('./routes/userRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/propertyRoutes'));
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
app.use('/api/vendors', require('./routes/vendorRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;
