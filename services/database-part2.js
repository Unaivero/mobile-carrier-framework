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

    async getNotifications(limit = 50, unreadOnly = false) {
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

    async clearOldData(days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const tables = [
            'test_results',
            'api_test_results',
            'coverage_data',
            'notifications'
        ];
        
        for (const table of tables) {
            const sql = `DELETE FROM ${table} WHERE timestamp < ?`;
            await this.db.run(sql, [cutoffDate.toISOString()]);
        }
        
        // Also clean up completed test configs older than cutoff
        const configSql = `DELETE FROM test_configs 
                          WHERE status IN ('completed', 'failed') 
                          AND created_at < ?`;
        await this.db.run(configSql, [cutoffDate.toISOString()]);
    }

    async close() {
        return new Promise((resolve) => {
            this.db.close(resolve);
        });
    }
}

module.exports = DatabaseService;
