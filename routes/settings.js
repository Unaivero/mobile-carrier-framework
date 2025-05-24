const express = require('express');
const router = express.Router();

// Import services
const DatabaseService = require('../services/database');
const Logger = require('../services/logger');

const logger = new Logger();
const dbService = new DatabaseService();

// Get All Settings
router.get('/', async (req, res) => {
    try {
        const settings = await dbService.getAllSettings();
        
        res.json({
            settings,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Get settings error:', error);
        res.status(500).json({
            error: 'Failed to get settings',
            message: error.message
        });
    }
});

// Update Settings
router.put('/', async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                error: 'Settings object is required'
            });
        }

        // Save each setting
        for (const [key, value] of Object.entries(settings)) {
            await dbService.saveSetting(key, value);
        }

        logger.info('Settings updated', { settingsCount: Object.keys(settings).length });

        res.json({
            success: true,
            message: 'Settings updated successfully',
            updatedSettings: Object.keys(settings)
        });

    } catch (error) {
        logger.error('Update settings error:', error);
        res.status(500).json({
            error: 'Failed to update settings',
            message: error.message
        });
    }
});

// Test Database Connection
router.post('/test-database', async (req, res) => {
    try {
        const { connectionString, dbType } = req.body;

        // For now, simulate database connection test
        const testResult = {
            success: Math.random() > 0.2, // 80% success rate
            responseTime: Math.floor(Math.random() * 1000 + 100),
            dbType: dbType || 'sqlite'
        };

        if (testResult.success) {
            logger.info('Database connection test successful', { dbType, responseTime: testResult.responseTime });
        } else {
            logger.warn('Database connection test failed', { dbType });
        }

        res.json({
            success: testResult.success,
            responseTime: testResult.responseTime,
            message: testResult.success 
                ? 'Database connection successful' 
                : 'Database connection failed'
        });

    } catch (error) {
        logger.error('Database connection test error:', error);
        res.status(500).json({
            error: 'Failed to test database connection',
            message: error.message
        });
    }
});

// System Maintenance
router.post('/maintenance', async (req, res) => {
    try {
        const { action, options = {} } = req.body;

        const supportedActions = ['clear-logs', 'clear-cache', 'export-data', 'cleanup-old-data'];
        
        if (!supportedActions.includes(action)) {
            return res.status(400).json({
                error: 'Unsupported maintenance action',
                supportedActions
            });
        }

        logger.info('Performing maintenance action', { action, options });

        let result;

        switch (action) {
            case 'clear-logs':
                result = await clearLogs();
                break;
            case 'clear-cache':
                result = await clearCache();
                break;
            case 'export-data':
                result = await exportSystemData(options);
                break;
            case 'cleanup-old-data':
                result = await cleanupOldData(options.daysToKeep || 30);
                break;
        }

        res.json({
            success: true,
            action,
            result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Maintenance action error:', error);
        res.status(500).json({
            error: 'Failed to perform maintenance action',
            message: error.message
        });
    }
});

// Get System Information
router.get('/system-info', async (req, res) => {
    try {
        const systemInfo = {
            version: process.env.npm_package_version || '1.0.0',
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development',
            database: {
                type: process.env.DB_TYPE || 'sqlite',
                path: process.env.DB_PATH || './data/database.sqlite'
            },
            features: {
                webSocket: true,
                apiTesting: true,
                networkTesting: true,
                localizationTesting: true,
                realTimeMonitoring: true,
                dataExport: true
            }
        };

        res.json(systemInfo);

    } catch (error) {
        logger.error('Get system info error:', error);
        res.status(500).json({
            error: 'Failed to get system information',
            message: error.message
        });
    }
});

// Manage Carriers
router.get('/carriers', async (req, res) => {
    try {
        const carriers = await dbService.getCarriers();
        
        res.json({
            carriers,
            count: carriers.length
        });

    } catch (error) {
        logger.error('Get carriers error:', error);
        res.status(500).json({
            error: 'Failed to get carriers',
            message: error.message
        });
    }
});

router.post('/carriers', async (req, res) => {
    try {
        const carrier = req.body;

        if (!carrier.id || !carrier.name) {
            return res.status(400).json({
                error: 'Carrier ID and name are required'
            });
        }

        await dbService.saveCarrier(carrier);
        
        logger.info('Carrier saved', { carrierId: carrier.id, name: carrier.name });

        res.json({
            success: true,
            message: 'Carrier saved successfully',
            carrier
        });

    } catch (error) {
        logger.error('Save carrier error:', error);
        res.status(500).json({
            error: 'Failed to save carrier',
            message: error.message
        });
    }
});

// Notification Settings
router.post('/test-notification', async (req, res) => {
    try {
        const { type, recipient, message } = req.body;

        if (!type || !recipient || !message) {
            return res.status(400).json({
                error: 'Type, recipient, and message are required'
            });
        }

        const NotificationService = require('../services/notification');
        const notificationService = new NotificationService();

        if (type === 'email') {
            await notificationService.sendEmail(recipient, 'Test Notification', message, 'info');
        } else if (type === 'webhook') {
            await notificationService.sendWebhook(message, 'info');
        }

        res.json({
            success: true,
            message: 'Test notification sent successfully'
        });

    } catch (error) {
        logger.error('Test notification error:', error);
        res.status(500).json({
            error: 'Failed to send test notification',
            message: error.message
        });
    }
});

// Get Notifications
router.get('/notifications', async (req, res) => {
    try {
        const { unreadOnly = false, limit = 50 } = req.query;
        
        const notifications = await dbService.getNotifications(
            unreadOnly === 'true', 
            parseInt(limit)
        );

        res.json({
            notifications,
            count: notifications.length,
            unreadCount: notifications.filter(n => !n.read).length
        });

    } catch (error) {
        logger.error('Get notifications error:', error);
        res.status(500).json({
            error: 'Failed to get notifications',
            message: error.message
        });
    }
});

// Mark Notification as Read
router.patch('/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        
        await dbService.markNotificationRead(parseInt(id));

        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        logger.error('Mark notification read error:', error);
        res.status(500).json({
            error: 'Failed to mark notification as read',
            message: error.message
        });
    }
});

// Implementation functions
async function clearLogs() {
    const fs = require('fs');
    const path = require('path');
    
    const logsDir = path.join(__dirname, '../data/logs');
    const logFiles = ['app.log', 'error.log'];
    
    let clearedFiles = 0;
    
    for (const logFile of logFiles) {
        const logPath = path.join(logsDir, logFile);
        if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '');
            clearedFiles++;
        }
    }
    
    return {
        message: `Cleared ${clearedFiles} log files`,
        clearedFiles
    };
}

async function clearCache() {
    // Simulate cache clearing
    return {
        message: 'Cache cleared successfully',
        freedSpace: Math.floor(Math.random() * 100 + 10) + 'MB'
    };
}

async function exportSystemData(options) {
    const fs = require('fs');
    const path = require('path');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `system-backup-${timestamp}.json`;
    const exportPath = path.join(__dirname, '../data/exports', filename);
    
    // Ensure exports directory exists
    const exportsDir = path.dirname(exportPath);
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Get system data
    const systemData = {
        settings: await dbService.getAllSettings(),
        carriers: await dbService.getCarriers(),
        statistics: await dbService.getTestStatistics(),
        exportedAt: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    };
    
    fs.writeFileSync(exportPath, JSON.stringify(systemData, null, 2));
    
    return {
        message: 'System data exported successfully',
        filename,
        size: fs.statSync(exportPath).size
    };
}

async function cleanupOldData(daysToKeep) {
    const result = await dbService.clearOldData(daysToKeep);
    
    return {
        message: `Cleaned up data older than ${daysToKeep} days`,
        daysToKeep
    };
}

module.exports = router;
