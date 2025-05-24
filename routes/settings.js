const express = require('express');
const router = express.Router();

// Import services
const DatabaseService = require('../services/database');
const Logger = require('../services/logger');

const logger = new Logger();
const dbService = new DatabaseService();

// Get all settings
router.get('/', async (req, res) => {
    try {
        const settings = await dbService.getAllSettings();
        res.json(settings);
    } catch (error) {
        logger.error('Get settings error:', error);
        res.status(500).json({
            error: 'Failed to get settings',
            message: error.message
        });
    }
});

// Get specific setting
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const value = await dbService.getSetting(key);
        
        if (value === null) {
            return res.status(404).json({
                error: 'Setting not found'
            });
        }

        res.json({ key, value });
    } catch (error) {
        logger.error('Get setting error:', error);
        res.status(500).json({
            error: 'Failed to get setting',
            message: error.message
        });
    }
});

// Update setting
router.put('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        await dbService.saveSetting(key, value);
        logger.info(`Setting updated: ${key}`);

        res.json({
            success: true,
            key,
            value,
            message: 'Setting updated successfully'
        });
    } catch (error) {
        logger.error('Update setting error:', error);
        res.status(500).json({
            error: 'Failed to update setting',
            message: error.message
        });
    }
});

// Update multiple settings
router.post('/bulk', async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                error: 'Settings object is required'
            });
        }

        const updatedSettings = {};
        for (const [key, value] of Object.entries(settings)) {
            await dbService.saveSetting(key, value);
            updatedSettings[key] = value;
        }

        logger.info(`Bulk settings update: ${Object.keys(settings).join(', ')}`);

        res.json({
            success: true,
            updatedSettings,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        logger.error('Bulk update settings error:', error);
        res.status(500).json({
            error: 'Failed to update settings',
            message: error.message
        });
    }
});

// Reset settings to default
router.post('/reset', async (req, res) => {
    try {
        const defaultSettings = {
            defaultTimeout: 60,
            retryAttempts: 3,
            parallelLimit: 5,
            autoSchedule: 'disabled',
            notificationEmail: '',
            webhookUrl: '',
            dataRetentionDays: 30,
            logLevel: 'info',
            enableRealTimeUpdates: true,
            maxConcurrentTests: 10,
            apiRateLimit: 100,
            backupEnabled: false,
            backupInterval: 'daily'
        };

        for (const [key, value] of Object.entries(defaultSettings)) {
            await dbService.saveSetting(key, value);
        }

        logger.info('Settings reset to defaults');

        res.json({
            success: true,
            settings: defaultSettings,
            message: 'Settings reset to defaults'
        });
    } catch (error) {
        logger.error('Reset settings error:', error);
        res.status(500).json({
            error: 'Failed to reset settings',
            message: error.message
        });
    }
});

// Get system configuration
router.get('/system/config', async (req, res) => {
    try {
        const config = {
            nodeVersion: process.version,
            platform: process.platform,
            architecture: process.arch,
            memory: {
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                external: Math.round(process.memoryUsage().external / 1024 / 1024)
            },
            uptime: Math.round(process.uptime()),
            environment: process.env.NODE_ENV || 'development',
            databaseConnected: dbService.db ? true : false,
            features: {
                networkTesting: true,
                localizationTesting: true,
                apiTesting: true,
                realTimeUpdates: true,
                dataExport: true,
                scheduling: false
            }
        };

        res.json(config);
    } catch (error) {
        logger.error('Get system config error:', error);
        res.status(500).json({
            error: 'Failed to get system configuration',
            message: error.message
        });
    }
});

// Test notification settings
router.post('/test-notification', async (req, res) => {
    try {
        const { type = 'email', recipient } = req.body;

        if (type === 'email') {
            const NotificationService = require('../services/notification');
            const notificationService = new NotificationService();
            
            await notificationService.sendEmail({
                to: recipient,
                subject: 'Mobile Carrier Framework - Test Notification',
                text: 'This is a test notification to verify your email configuration.',
                html: '<p>This is a test notification to verify your email configuration.</p>'
            });

            res.json({
                success: true,
                message: 'Test email sent successfully'
            });
        } else if (type === 'webhook') {
            const axios = require('axios');
            const testPayload = {
                test: true,
                message: 'This is a test webhook notification',
                timestamp: new Date().toISOString()
            };

            await axios.post(recipient, testPayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            res.json({
                success: true,
                message: 'Test webhook sent successfully'
            });
        } else {
            return res.status(400).json({
                error: 'Invalid notification type',
                supportedTypes: ['email', 'webhook']
            });
        }
    } catch (error) {
        logger.error('Test notification error:', error);
        res.status(500).json({
            error: 'Failed to send test notification',
            message: error.message
        });
    }
});

// Get carriers configuration
router.get('/carriers', async (req, res) => {
    try {
        const carriers = await dbService.getCarriers();
        res.json(carriers);
    } catch (error) {
        logger.error('Get carriers error:', error);
        res.status(500).json({
            error: 'Failed to get carriers',
            message: error.message
        });
    }
});

// Add or update carrier
router.post('/carriers', async (req, res) => {
    try {
        const {
            id,
            name,
            apiEndpoint,
            authConfig = {},
            features = []
        } = req.body;

        if (!id || !name) {
            return res.status(400).json({
                error: 'Carrier ID and name are required'
            });
        }

        const carrier = {
            id,
            name,
            apiEndpoint,
            authConfig,
            features
        };

        await dbService.saveCarrier(carrier);
        logger.info(`Carrier saved: ${name}`);

        res.json({
            success: true,
            carrier,
            message: 'Carrier saved successfully'
        });
    } catch (error) {
        logger.error('Save carrier error:', error);
        res.status(500).json({
            error: 'Failed to save carrier',
            message: error.message
        });
    }
});

// Delete carrier
router.delete('/carriers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await dbService.db.run('DELETE FROM carriers WHERE id = ?', [id]);
        logger.info(`Carrier deleted: ${id}`);

        res.json({
            success: true,
            carrierId: id,
            message: 'Carrier deleted successfully'
        });
    } catch (error) {
        logger.error('Delete carrier error:', error);
        res.status(500).json({
            error: 'Failed to delete carrier',
            message: error.message
        });
    }
});

// Database maintenance
router.post('/maintenance/cleanup', async (req, res) => {
    try {
        const { daysToKeep = 30 } = req.body;
        
        await dbService.clearOldData(daysToKeep);
        logger.info(`Database cleanup completed: kept ${daysToKeep} days`);

        res.json({
            success: true,
            daysToKeep,
            message: 'Database cleanup completed successfully'
        });
    } catch (error) {
        logger.error('Database cleanup error:', error);
        res.status(500).json({
            error: 'Failed to cleanup database',
            message: error.message
        });
    }
});

// System health check
router.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            checks: {
                database: { status: 'healthy', responseTime: 0 },
                memory: { status: 'healthy', usage: 0 }
            }
        };

        // Database check
        const dbStart = Date.now();
        try {
            await dbService.db.get('SELECT 1');
            health.checks.database.responseTime = Date.now() - dbStart;
        } catch (dbError) {
            health.checks.database.status = 'unhealthy';
            health.checks.database.error = dbError.message;
            health.status = 'degraded';
        }

        // Memory check
        const memUsage = process.memoryUsage();
        const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        health.checks.memory.usage = Math.round(memoryUsagePercent);
        
        if (memoryUsagePercent > 90) {
            health.checks.memory.status = 'critical';
            health.status = 'degraded';
        } else if (memoryUsagePercent > 80) {
            health.checks.memory.status = 'warning';
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
        
    } catch (error) {
        logger.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;