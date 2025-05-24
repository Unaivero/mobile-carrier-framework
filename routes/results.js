const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// Import services
const DatabaseService = require('../services/database');
const Logger = require('../services/logger');

const logger = new Logger();
const dbService = new DatabaseService();

// Get all test results with pagination
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            type = null, 
            status = null,
            startDate = null,
            endDate = null 
        } = req.query;

        const offset = (page - 1) * limit;
        
        let sql = `SELECT * FROM test_configs WHERE 1=1`;
        const params = [];

        if (type) {
            sql += ` AND type = ?`;
            params.push(type);
        }

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        if (startDate) {
            sql += ` AND created_at >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            sql += ` AND created_at <= ?`;
            params.push(endDate);
        }

        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const tests = await dbService.db.all(sql, params);
        
        // Get total count
        let countSql = `SELECT COUNT(*) as total FROM test_configs WHERE 1=1`;
        const countParams = [];
        
        if (type) {
            countSql += ` AND type = ?`;
            countParams.push(type);
        }
        if (status) {
            countSql += ` AND status = ?`;
            countParams.push(status);
        }
        if (startDate) {
            countSql += ` AND created_at >= ?`;
            countParams.push(startDate);
        }
        if (endDate) {
            countSql += ` AND created_at <= ?`;
            countParams.push(endDate);
        }

        const countResult = await dbService.db.get(countSql, countParams);

        res.json({
            tests: tests.map(test => ({
                ...test,
                config: JSON.parse(test.config)
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult.total,
                pages: Math.ceil(countResult.total / limit)
            }
        });

    } catch (error) {
        logger.error('Get test results error:', error);
        res.status(500).json({
            error: 'Failed to get test results',
            message: error.message
        });
    }
});

// Get specific test results
router.get('/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        const { limit = 100 } = req.query;

        const testConfig = await dbService.getTestStatus(testId);
        if (!testConfig) {
            return res.status(404).json({
                error: 'Test not found'
            });
        }

        const results = await dbService.getTestResults(testId, limit);

        res.json({
            testId,
            config: testConfig,
            results,
            resultCount: results.length
        });

    } catch (error) {
        logger.error('Get specific test results error:', error);
        res.status(500).json({
            error: 'Failed to get test results',
            message: error.message
        });
    }
});

// Export test results
router.post('/export/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        const { format = 'json', includeConfig = true } = req.body;

        const testConfig = await dbService.getTestStatus(testId);
        if (!testConfig) {
            return res.status(404).json({
                error: 'Test not found'
            });
        }

        const results = await dbService.getTestResults(testId);

        const exportData = {
            testId,
            exportedAt: new Date().toISOString(),
            ...(includeConfig && { config: testConfig }),
            results
        };

        const exportDir = path.join(__dirname, '../data/exports');
        await fs.mkdir(exportDir, { recursive: true });

        let filename, content, mimeType;

        switch (format.toLowerCase()) {
            case 'json':
                filename = `test-${testId}-${Date.now()}.json`;
                content = JSON.stringify(exportData, null, 2);
                mimeType = 'application/json';
                break;

            case 'csv':
                filename = `test-${testId}-${Date.now()}.csv`;
                content = await convertToCSV(results);
                mimeType = 'text/csv';
                break;

            case 'xml':
                filename = `test-${testId}-${Date.now()}.xml`;
                content = await convertToXML(exportData);
                mimeType = 'application/xml';
                break;

            case 'html':
                filename = `test-${testId}-${Date.now()}.html`;
                content = await convertToHTML(exportData);
                mimeType = 'text/html';
                break;

            default:
                return res.status(400).json({
                    error: 'Unsupported format',
                    supportedFormats: ['json', 'csv', 'xml', 'html']
                });
        }

        const filepath = path.join(exportDir, filename);
        await fs.writeFile(filepath, content);

        logger.info(`Test results exported: ${filepath}`);

        res.json({
            success: true,
            filename,
            filepath: `/api/results/download/${filename}`,
            format,
            size: content.length
        });

    } catch (error) {
        logger.error('Export test results error:', error);
        res.status(500).json({
            error: 'Failed to export test results',
            message: error.message
        });
    }
});

// Download exported file
router.get('/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filepath = path.join(__dirname, '../data/exports', filename);

        // Security check - ensure filename doesn't contain path traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({
                error: 'Invalid filename'
            });
        }

        try {
            await fs.access(filepath);
        } catch (accessError) {
            return res.status(404).json({
                error: 'File not found'
            });
        }

        const stats = await fs.stat(filepath);
        const ext = path.extname(filename).toLowerCase();
        
        const mimeTypes = {
            '.json': 'application/json',
            '.csv': 'text/csv',
            '.xml': 'application/xml',
            '.html': 'text/html'
        };

        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);

        const fileStream = require('fs').createReadStream(filepath);
        fileStream.pipe(res);

    } catch (error) {
        logger.error('Download file error:', error);
        res.status(500).json({
            error: 'Failed to download file',
            message: error.message
        });
    }
});

// Get test statistics
router.get('/stats/summary', async (req, res) => {
    try {
        const stats = await dbService.getTestStatistics();
        
        // Additional statistics
        const recentTests = await dbService.getRecentTests(10);
        
        // Get test type distribution
        const typeDistribution = await dbService.db.all(`
            SELECT type, COUNT(*) as count 
            FROM test_configs 
            GROUP BY type 
            ORDER BY count DESC
        `);

        // Get status distribution
        const statusDistribution = await dbService.db.all(`
            SELECT status, COUNT(*) as count 
            FROM test_configs 
            GROUP BY status
        `);

        // Get hourly test activity for last 24 hours
        const hourlyActivity = await dbService.db.all(`
            SELECT 
                strftime('%H', created_at) as hour,
                COUNT(*) as count
            FROM test_configs 
            WHERE created_at >= datetime('now', '-24 hours')
            GROUP BY strftime('%H', created_at)
            ORDER BY hour
        `);

        res.json({
            ...stats,
            recentTests,
            typeDistribution,
            statusDistribution,
            hourlyActivity,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Get test statistics error:', error);
        res.status(500).json({
            error: 'Failed to get test statistics',
            message: error.message
        });
    }
});

// Delete test results
router.delete('/:testId', async (req, res) => {
    try {
        const { testId } = req.params;

        const testConfig = await dbService.getTestStatus(testId);
        if (!testConfig) {
            return res.status(404).json({
                error: 'Test not found'
            });
        }

        // Stop test if it's running
        if (testConfig.status === 'running') {
            const TestingEngine = require('../services/testing-engine');
            const testingEngine = new TestingEngine();
            await testingEngine.stopTest(testId);
        }

        // Delete test results
        await dbService.db.run('DELETE FROM test_results WHERE test_id = ?', [testId]);
        await dbService.db.run('DELETE FROM api_test_results WHERE test_id = ?', [testId]);
        await dbService.db.run('DELETE FROM test_configs WHERE id = ?', [testId]);

        logger.info(`Test ${testId} deleted`);

        res.json({
            success: true,
            testId,
            message: 'Test results deleted successfully'
        });

    } catch (error) {
        logger.error('Delete test results error:', error);
        res.status(500).json({
            error: 'Failed to delete test results',
            message: error.message
        });
    }
});

// Bulk delete tests
router.post('/bulk-delete', async (req, res) => {
    try {
        const { testIds, olderThan } = req.body;

        let deletedCount = 0;

        if (testIds && Array.isArray(testIds)) {
            // Delete specific tests
            for (const testId of testIds) {
                await dbService.db.run('DELETE FROM test_results WHERE test_id = ?', [testId]);
                await dbService.db.run('DELETE FROM api_test_results WHERE test_id = ?', [testId]);
                await dbService.db.run('DELETE FROM test_configs WHERE id = ?', [testId]);
                deletedCount++;
            }
        }

        if (olderThan) {
            // Delete tests older than specified date
            const cutoffDate = new Date(olderThan).toISOString();
            
            const oldTests = await dbService.db.all(
                'SELECT id FROM test_configs WHERE created_at < ?',
                [cutoffDate]
            );

            for (const test of oldTests) {
                await dbService.db.run('DELETE FROM test_results WHERE test_id = ?', [test.id]);
                await dbService.db.run('DELETE FROM api_test_results WHERE test_id = ?', [test.id]);
                await dbService.db.run('DELETE FROM test_configs WHERE id = ?', [test.id]);
                deletedCount++;
            }
        }

        logger.info(`Bulk deleted ${deletedCount} tests`);

        res.json({
            success: true,
            deletedCount,
            message: `Successfully deleted ${deletedCount} test(s)`
        });

    } catch (error) {
        logger.error('Bulk delete error:', error);
        res.status(500).json({
            error: 'Failed to bulk delete tests',
            message: error.message
        });
    }
});

// Helper functions for export formats

async function convertToCSV(results) {
    if (results.length === 0) return 'No data available';

    // Get all unique keys from all results
    const allKeys = new Set();
    results.forEach(result => {
        const data = result.result_data || result;
        Object.keys(data).forEach(key => allKeys.add(key));
    });

    const headers = Array.from(allKeys).join(',');
    const rows = results.map(result => {
        const data = result.result_data || result;
        return Array.from(allKeys).map(key => {
            const value = data[key];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value).replace(/"/g, '""');
        }).map(v => `"${v}"`).join(',');
    });

    return [headers, ...rows].join('\n');
}

async function convertToXML(data) {
    function objectToXML(obj, rootName = 'root') {
        let xml = `<${rootName}>`;
        
        for (const [key, value] of Object.entries(obj)) {
            if (Array.isArray(value)) {
                xml += `<${key}>`;
                value.forEach((item, index) => {
                    if (typeof item === 'object') {
                        xml += objectToXML(item, `item_${index}`);
                    } else {
                        xml += `<item_${index}>${escapeXML(String(item))}</item_${index}>`;
                    }
                });
                xml += `</${key}>`;
            } else if (typeof value === 'object' && value !== null) {
                xml += objectToXML(value, key);
            } else {
                xml += `<${key}>${escapeXML(String(value || ''))}</${key}>`;
            }
        }
        
        xml += `</${rootName}>`;
        return xml;
    }

    function escapeXML(str) {
        return str.replace(/[<>&'"]/g, function(c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case "'": return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + objectToXML(data, 'testResults');
}

async function convertToHTML(data) {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Results - ${data.testId}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1, h2, h3 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f8f9fa; font-weight: 600; }
            .status-running { color: #007bff; }
            .status-completed { color: #28a745; }
            .status-failed { color: #dc3545; }
            .json-data { background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; font-size: 12px; }
            .header-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .info-card { background: #f8f9fa; padding: 15px; border-radius: 8px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Test Results Report</h1>
            
            <div class="header-info">
                <div class="info-card">
                    <h3>Test ID</h3>
                    <p>${data.testId}</p>
                </div>
                <div class="info-card">
                    <h3>Export Date</h3>
                    <p>${new Date(data.exportedAt).toLocaleString()}</p>
                </div>
                <div class="info-card">
                    <h3>Results Count</h3>
                    <p>${data.results.length}</p>
                </div>
                ${data.config ? `
                <div class="info-card">
                    <h3>Test Status</h3>
                    <p class="status-${data.config.status}">${data.config.status.toUpperCase()}</p>
                </div>
                ` : ''}
            </div>

            ${data.config ? `
            <h2>Test Configuration</h2>
            <div class="json-data">${JSON.stringify(JSON.parse(data.config.config), null, 2)}</div>
            ` : ''}

            <h2>Test Results</h2>
            ${data.results.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Result Data</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.results.map(result => `
                    <tr>
                        <td>${new Date(result.timestamp).toLocaleString()}</td>
                        <td><div class="json-data">${JSON.stringify(result.result_data, null, 2)}</div></td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<p>No results available.</p>'}
        </div>
    </body>
    </html>`;

    return html;
}

module.exports = router;