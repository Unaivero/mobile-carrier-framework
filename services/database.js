const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

class DatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = process.env.DB_PATH || path.join(__dirname, '../data/database.sqlite');
    }

    async initialize() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Initialize SQLite database
            this.db = new sqlite3.Database(this.dbPath);
            
            // Promisify database methods
            this.db.run = promisify(this.db.run.bind(this.db));
            this.db.get = promisify(this.db.get.bind(this.db));
            this.db.all = promisify(this.db.all.bind(this.db));

            await this.createTables();
            console.log('Database initialized successfully');

        } catch (error) {
            console.error('Database initialization error:', error);
            throw error;
        }
    }

    async createTables() {
        const tables = [
            // Test configurations
            `CREATE TABLE IF NOT EXISTS test_configs (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                config TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Test results
            `CREATE TABLE IF NOT EXISTS test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_id TEXT NOT NULL,
                result_data TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (test_id) REFERENCES test_configs(id)
            )`,

            // System settings
            `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Carrier information
            `CREATE TABLE IF NOT EXISTS carriers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                api_endpoint TEXT,
                auth_config TEXT,
                features TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Coverage data
            `CREATE TABLE IF NOT EXISTS coverage_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                carrier_id TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                signal_strength REAL,
                network_type TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (carrier_id) REFERENCES carriers(id)
            )`,

            // API test results
            `CREATE TABLE IF NOT EXISTS api_test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_id TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                status_code INTEGER,
                response_time REAL,
                success BOOLEAN,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Notifications
            `CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                severity TEXT DEFAULT 'info',
                read BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const tableSQL of tables) {
            await this.db.run(tableSQL);
        }

        // Create indexes
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON test_results(test_id)',
            'CREATE INDEX IF NOT EXISTS idx_test_results_timestamp ON test_results(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_coverage_data_location ON coverage_data(latitude, longitude)',
            'CREATE INDEX IF NOT EXISTS idx_api_test_results_test_id ON api_test_results(test_id)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)'
        ];

        for (const indexSQL of indexes) {
            await this.db.run(indexSQL);
        }
    }

    async saveTestConfig(config) {
        const sql = `INSERT INTO test_configs (id, type, config, status) 
                     VALUES (?, ?, ?, ?)`;
        
        await this.db.run(sql, [
            config.testId,
            config.type,
            JSON.stringify(config),
            'running'
        ]);
    }

    async getTestStatus(testId) {
        const sql = `SELECT * FROM test_configs WHERE id = ?`;
        const result = await this.db.get(sql, [testId]);
        
        if (result) {
            result.config = JSON.parse(result.config);
        }
        
        return result;
    }

    async updateTestStatus(testId, status) {
        const sql = `UPDATE test_configs SET status = ?, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`;
        
        await this.db.run(sql, [status, testId]);
    }

    async saveTestResult(testId, result) {
        const sql = `INSERT INTO test_results (test_id, result_data) VALUES (?, ?)`;
        await this.db.run(sql, [testId, JSON.stringify(result)]);
    }

    async getTestResults(testId, limit = 100) {
        const sql = `SELECT * FROM test_results WHERE test_id = ? 
                     ORDER BY timestamp DESC LIMIT ?`;
        
        const results = await this.db.all(sql, [testId, limit]);
        
        return results.map(row => ({
            ...row,
            result_data: JSON.parse(row.result_data)
        }));
    }

    async getRecentTests(limit = 10) {
        const sql = `SELECT id, type, status, created_at FROM test_configs 
                     ORDER BY created_at DESC LIMIT ?`;
        
        return await this.db.all(sql, [limit]);
    }

    async getTestStatistics() {
        const stats = {};
        
        // Total tests
        const totalTests = await this.db.get(
            'SELECT COUNT(*) as count FROM test_configs'
        );
        stats.totalTests = totalTests.count;

        // Success rate
        const successRate = await this.db.get(`
            SELECT 
                (CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*)) * 100 as rate
            FROM test_configs
        `);
        stats.successRate = successRate.rate || 0;

        // Active tests
        const activeTests = await this.db.get(
            "SELECT COUNT(*) as count FROM test_configs WHERE status = 'running'"
        );
        stats.activeTests = activeTests.count;

        return stats;
    }

    async saveSetting(key, value) {
        const sql = `INSERT OR REPLACE INTO settings (key, value, updated_at) 
                     VALUES (?, ?, CURRENT_TIMESTAMP)`;
        
        await this.db.run(sql, [key, JSON.stringify(value)]);
    }

    async getSetting(key) {
        const sql = `SELECT value FROM settings WHERE key = ?`;
        const result = await this.db.get(sql, [key]);
        
        return result ? JSON.parse(result.value) : null;
    }

    async getAllSettings() {
        const sql = `SELECT key, value FROM settings`;
        const results = await this.db.all(sql);
        
        const settings = {};
        results.forEach(row => {
            settings[row.key] = JSON.parse(row.value);
        });
        
        return settings;
    }

    async saveCarrier(carrier) {
        const sql = `INSERT OR REPLACE INTO carriers 
                     (id, name, api_endpoint, auth_config, features) 
                     VALUES (?, ?, ?, ?, ?)`;
        
        await this.db.run(sql, [
            carrier.id,
            carrier.name,
            carrier.apiEndpoint,
            JSON.stringify(carrier.authConfig || {}),
            JSON.stringify(carrier.features || [])
        ]);
    }

    async getCarriers() {
        const sql = `SELECT * FROM carriers ORDER BY name`;
        const results = await this.db.all(sql);
        
        return results.map(row => ({
            ...row,
            auth_config: JSON.parse(row.auth_config || '{}'),
            features: JSON.parse(row.features || '[]')
        }));
    }

    async saveCoverageData(data) {
        const sql = `INSERT INTO coverage_data 
                     (carrier_id, latitude, longitude, signal_strength, network_type) 
                     VALUES (?, ?, ?, ?, ?)`;
        
        await this.db.run(sql, [
            data.carrierId,
            data.latitude,
            data.longitude,
            data.signalStrength,
            data.networkType
        ]);
    }

    async getCoverageData(bounds, carrierId = null) {
        let sql = `SELECT * FROM coverage_data 
                   WHERE latitude BETWEEN ? AND ? 
                   AND longitude BETWEEN ? AND ?`;
        
        const params = [bounds.south, bounds.north, bounds.west, bounds.east];
        
        if (carrierId) {
            sql += ' AND carrier_id = ?';
            params.push(carrierId);
        }
        
        sql += ' ORDER BY timestamp DESC';
        
        return await this.db.all(sql, params);
    }

    async saveApiTestResult(result) {
        const sql = `INSERT INTO api_test_results 
                     (test_id, endpoint, method, status_code, response_time, success, error_message) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;
        
        await this.db.run(sql, [
            result.testId,
            result.endpoint,
            result.method,
            result.statusCode,
            result.responseTime,
            result.success,
            result.errorMessage
        ]);
    }

    async getApiTestResults(testId) {
        const sql = `SELECT * FROM api_test_results WHERE test_id = ? 
                     ORDER BY timestamp ASC`;
        
        return await this.db.all(sql, [testId]);
    }

    async createNotification(notification) {
        const sql = `INSERT INTO notifications (type, title, message, severity) 
                     VALUES (?, ?, ?, ?)`;
        
        await this.db.run(sql, [
            notification.type,
            notification.title,
            notification.message,
            notification.severity || 'info'
        ]);
    }

    async getNotifications(unreadOnly = false, limit = 50) {
        let sql = `SELECT * FROM notifications`;
        const params = [];
        
        if (unreadOnly) {
            sql += ' WHERE read = FALSE';
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        
        return await this.db.all(sql, params);
    }

    async markNotificationRead(id) {
        const sql = `UPDATE notifications SET read = TRUE WHERE id = ?`;
        await this.db.run(sql, [id]);
    }

    async clearOldData(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const tables = [
            'test_results',
            'api_test_results',
            'coverage_data'
        ];
        
        for (const table of tables) {
            const sql = `DELETE FROM ${table} WHERE timestamp < ?`;
            await this.db.run(sql, [cutoffDate.toISOString()]);
        }
        
        // Also clean up completed test configs older than retention period
        const configSql = `DELETE FROM test_configs 
                          WHERE status IN ('completed', 'failed') 
                          AND created_at < ?`;
        await this.db.run(configSql, [cutoffDate.toISOString()]);
    }

    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = DatabaseService;
