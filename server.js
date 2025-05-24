const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Import route modules
const networkRoutes = require('./routes/network');
const localizationRoutes = require('./routes/localization');
const apiRoutes = require('./routes/api');
const resultsRoutes = require('./routes/results');
const settingsRoutes = require('./routes/settings');

// Import services
const DatabaseService = require('./services/database');
const TestingEngine = require('./services/testing-engine');
const NotificationService = require('./services/notification');
const Logger = require('./services/logger');

// Import middleware
const authMiddleware = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');
const rateLimitMiddleware = require('./middleware/rateLimit');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// Initialize services
const logger = new Logger();
const dbService = new DatabaseService();
const testingEngine = new TestingEngine();
const notificationService = new NotificationService();

// Global state management
const globalState = {
    activeTests: new Map(),
    connectedClients: new Set(),
    systemStatus: {
        testingEngine: 'online',
        apiGateway: 'connected', 
        database: 'active',
        externalTools: 'standby'
    }
};

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for now
}));
app.use(compression());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimitMiddleware);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// API Routes
app.use('/api/network', networkRoutes);
app.use('/api/localization', localizationRoutes);
app.use('/api/testing', apiRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/settings', settingsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        systemStatus: globalState.systemStatus,
        activeTests: globalState.activeTests.size
    });
});

// Dashboard data endpoint
app.get('/api/dashboard', (req, res) => {
    res.json({
        activeTests: globalState.activeTests.size,
        successRate: calculateSuccessRate(),
        avgLatency: calculateAverageLatency(),
        coverageAreas: getCoverageAreasCount(),
        systemStatus: globalState.systemStatus,
        recentActivity: getRecentActivity()
    });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    logger.info('WebSocket client connected', { ip: req.socket.remoteAddress });
    globalState.connectedClients.add(ws);
    
    // Send initial status
    ws.send(JSON.stringify({
        type: 'system_status',
        data: globalState.systemStatus
    }));
    
    ws.on('close', () => {
        globalState.connectedClients.delete(ws);
        logger.info('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        globalState.connectedClients.delete(ws);
    });
});

// Broadcast to all connected WebSocket clients
function broadcast(message) {
    const data = JSON.stringify(message);
    globalState.connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Helper functions
function calculateSuccessRate() {
    // Implementation to calculate success rate from database
    return Math.random() * 30 + 70; // Mock: 70-100%
}

function calculateAverageLatency() {
    // Implementation to calculate average latency
    return Math.random() * 50 + 20; // Mock: 20-70ms
}

function getCoverageAreasCount() {
    // Implementation to get coverage areas count
    return Math.floor(Math.random() * 20 + 5); // Mock: 5-25 areas
}

function getRecentActivity() {
    return [
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'System initialized successfully'
        },
        {
            timestamp: new Date(Date.now() - 1000).toISOString(),
            type: 'success',
            message: 'Connected to carrier APIs'
        }
    ];
}

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found'
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    
    // Close WebSocket server
    wss.close(() => {
        logger.info('WebSocket server closed');
    });
    
    // Close HTTP server
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
});

// Start server
async function startServer() {
    try {
        // Initialize database
        await dbService.initialize();
        logger.info('Database initialized');
        
        // Initialize testing engine
        await testingEngine.initialize();
        logger.info('Testing engine initialized');
        
        // Start HTTP server
        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`WebSocket server running on port ${WS_PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
        
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Export for testing
module.exports = { app, server, wss, globalState, broadcast };

// Start the server if this file is run directly
if (require.main === module) {
    startServer();
}
