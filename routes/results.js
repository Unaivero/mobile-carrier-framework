const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Import services
const DatabaseService = require('../services/database');
const Logger = require('../services/logger');

const logger = new Logger();
const dbService = new DatabaseService();

// Get Test Results Summary
router.get('/summary', async (req, res) => {
    try {
        const { 
            startDate, 
            endDate, 
            testType, 
            limit = 100 
        } = req.query;

        const statistics = await dbService.getTestStatistics();
        const recentTests = await dbService.getRecentTests(limit);

        res.json({
            statistics,
            recentTests,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Get results summary error:', error);
        res.status(500).json({
            error: 'Failed to get results summary',
            message: error.message
        });
    }
});

// Get Detailed Test Results
router.get('/test/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        const { limit = 100 } = req.query;

        const testConfig = await dbService.getTestStatus(testId);
        if (!testConfig) {
            return res.status(404).json({
                error: 'Test not found'
            });
        }

        const testResults = await dbService.getTestResults(testId, limit);

        res.json({
            testId,
            config: testConfig,
            results: testResults,
            totalResults: testResults.length
        });

    } catch (error) {
        logger.error('Get detailed test results error:', error);
        res.status(500).json({
            error: 'Failed to get test results',
            message: error.message
        });
    }
});

// Export Test Results
router.post('/export', async (req, res) => {
    try {
        const { 
            format = 'json',
            testIds = [],
            startDate,
            endDate,
            includeConfig = true
        } = req.body;

        const supportedFormats = ['json', 'csv', 'xml', 'pdf', 'html'];
        if (!supportedFormats.includes(format)) {
            return res.status(400).json({
                error: 'Unsupported export format',
                supportedFormats
            });
        }

        logger.info('Exporting test results', { format, testIds: testIds.length });

        let exportData;
        
        if (testIds.length > 0) {
            // Export specific tests
            exportData = await exportSpecificTests(testIds, includeConfig);
        } else {
            // Export by date range
            exportData = await exportByDateRange(startDate, endDate, includeConfig);
        }

        const exportResult = await generateExport(exportData, format);
        
        res.json({
            success: true,
            format,
            filename: exportResult.filename,
            size: exportResult.size,
            recordCount: exportData.length,
            downloadUrl: `/api/results/download/${exportResult.filename}`
        });

    } catch (error) {
        logger.error('Export test results error:', error);
        res.status(500).json({
            error: 'Failed to export test results',
            message: error.message
        });
    }
});

// Download Exported File
router.get('/download/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../data/exports', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                error: 'File not found'
            });
        }

        res.download(filePath, filename, (err) => {
            if (err) {
                logger.error('File download error:', err);
                res.status(500).json({
                    error: 'Failed to download file'
                });
            }
        });

    } catch (error) {
        logger.error('Download file error:', error);
        res.status(500).json({
            error: 'Failed to download file',
            message: error.message
        });
    }
});

// Get Historical Analytics
router.get('/analytics', async (req, res) => {
    try {
        const { 
            period = '7d',
            testType,
            metric = 'all'
        } = req.query;

        const analytics = await generateAnalytics(period, testType, metric);

        res.json({
            period,
            testType: testType || 'all',
            metric,
            analytics,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Get analytics error:', error);
        res.status(500).json({
            error: 'Failed to get analytics',
            message: error.message
        });
    }
});

// Get Coverage Heatmap Data
router.get('/coverage-heatmap', async (req, res) => {
    try {
        const { 
            bounds,
            carrierId,
            startDate,
            endDate
        } = req.query;

        if (!bounds) {
            return res.status(400).json({
                error: 'Geographic bounds are required'
            });
        }

        const boundsArray = bounds.split(',').map(Number);
        if (boundsArray.length !== 4) {
            return res.status(400).json({
                error: 'Bounds should be in format: south,west,north,east'
            });
        }

        const [south, west, north, east] = boundsArray;
        const boundsObj = { south, west, north, east };

        const coverageData = await dbService.getCoverageData(boundsObj, carrierId);

        // Process data for heatmap
        const heatmapData = coverageData.map(point => ({
            lat: point.latitude,
            lng: point.longitude,
            intensity: normalizeSignalStrength(point.signal_strength),
            networkType: point.network_type,
            timestamp: point.timestamp
        }));

        res.json({
            bounds: boundsObj,
            carrierId: carrierId || 'all',
            dataPoints: heatmapData.length,
            heatmapData
        });

    } catch (error) {
        logger.error('Get coverage heatmap error:', error);
        res.status(500).json({
            error: 'Failed to get coverage heatmap data',
            message: error.message
        });
    }
});

// Generate Performance Report
router.post('/performance-report', async (req, res) => {
    try {
        const {
            testIds = [],
            includeCharts = true,
            includeRawData = false,
            format = 'html'
        } = req.body;

        if (testIds.length === 0) {
            return res.status(400).json({
                error: 'At least one test ID is required'
            });
        }

        logger.info('Generating performance report', { 
            testIds: testIds.length, 
            format 
        });

        const reportData = await generatePerformanceReport(
            testIds, 
            includeCharts, 
            includeRawData
        );

        const report = await formatReport(reportData, format);

        res.json({
            success: true,
            format,
            filename: report.filename,
            size: report.size,
            downloadUrl: `/api/results/download/${report.filename}`,
            summary: reportData.summary
        });

    } catch (error) {
        logger.error('Generate performance report error:', error);
        res.status(500).json({
            error: 'Failed to generate performance report',
            message: error.message
        });
    }
});

// Implementation functions
async function exportSpecificTests(testIds, includeConfig) {
    const exportData = [];
    
    for (const testId of testIds) {
        const testConfig = includeConfig ? await dbService.getTestStatus(testId) : null;
        const testResults = await dbService.getTestResults(testId);
        
        exportData.push({
            testId,
            config: testConfig,
            results: testResults,
            exportedAt: new Date().toISOString()
        });
    }
    
    return exportData;
}

async function exportByDateRange(startDate, endDate, includeConfig) {
    // Implementation would query database by date range
    // For now, return sample data
    return [];
}

async function generateExport(data, format) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-${timestamp}.${format}`;
    const exportPath = path.join(__dirname, '../data/exports', filename);

    // Ensure exports directory exists
    const exportsDir = path.dirname(exportPath);
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }

    let content;

    switch (format) {
        case 'json':
            content = JSON.stringify(data, null, 2);
            break;
        case 'csv':
            content = convertToCSV(data);
            break;
        case 'xml':
            content = convertToXML(data);
            break;
        case 'html':
            content = convertToHTML(data);
            break;
        default:
            throw new Error(`Unsupported format: ${format}`);
    }

    fs.writeFileSync(exportPath, content);

    return {
        filename,
        size: fs.statSync(exportPath).size
    };
}

function convertToCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => 
                JSON.stringify(row[header] || '')
            ).join(',')
        )
    ].join('\n');
    
    return csvContent;
}

function convertToXML(data) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testResults>\n';
    
    data.forEach(item => {
        xml += '  <test>\n';
        Object.entries(item).forEach(([key, value]) => {
            xml += `    <${key}>${escapeXML(JSON.stringify(value))}</${key}>\n`;
        });
        xml += '  </test>\n';
    });
    
    xml += '</testResults>';
    return xml;
}

function convertToHTML(data) {
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Results Export</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .summary { background-color: #e7f3ff; padding: 15px; margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <h1>Test Results Export</h1>
        <div class="summary">
            <h2>Summary</h2>
            <p>Total Records: ${data.length}</p>
            <p>Generated: ${new Date().toISOString()}</p>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Test ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Results Count</th>
                    <th>Created</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.forEach(item => {
        html += `
                <tr>
                    <td>${item.testId}</td>
                    <td>${item.config?.type || 'N/A'}</td>
                    <td>${item.config?.status || 'N/A'}</td>
                    <td>${item.results?.length || 0}</td>
                    <td>${item.config?.created_at || 'N/A'}</td>
                </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    </body>
    </html>
    `;
    
    return html;
}

function escapeXML(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function generateAnalytics(period, testType, metric) {
    // Mock analytics data - replace with actual database queries
    const now = new Date();
    const analytics = {
        summary: {
            totalTests: Math.floor(Math.random() * 1000 + 100),
            successRate: Math.floor(Math.random() * 20 + 80),
            averageResponseTime: Math.floor(Math.random() * 100 + 50),
            errorRate: Math.floor(Math.random() * 5 + 1)
        },
        trends: {
            daily: generateTrendData(7),
            hourly: generateTrendData(24)
        },
        testTypes: {
            network: Math.floor(Math.random() * 100 + 20),
            localization: Math.floor(Math.random() * 50 + 10),
            api: Math.floor(Math.random() * 75 + 15)
        }
    };
    
    return analytics;
}

function generateTrendData(points) {
    return Array.from({ length: points }, (_, i) => ({
        timestamp: new Date(Date.now() - (points - i) * 24 * 60 * 60 * 1000).toISOString(),
        value: Math.floor(Math.random() * 100 + 20)
    }));
}

function normalizeSignalStrength(signalStrength) {
    // Convert signal strength (-120 to -30 dBm) to intensity (0 to 1)
    const min = -120;
    const max = -30;
    return Math.max(0, Math.min(1, (signalStrength - min) / (max - min)));
}

async function generatePerformanceReport(testIds, includeCharts, includeRawData) {
    const reportData = {
        summary: {
            testCount: testIds.length,
            generatedAt: new Date().toISOString(),
            totalDuration: 0,
            averageSuccessRate: 0
        },
        tests: [],
        charts: includeCharts ? [] : null,
        rawData: includeRawData ? [] : null
    };
    
    // Process each test
    for (const testId of testIds) {
        const testConfig = await dbService.getTestStatus(testId);
        const testResults = await dbService.getTestResults(testId, 1000);
        
        if (testConfig && testResults.length > 0) {
            const testSummary = {
                testId,
                type: testConfig.type,
                status: testConfig.status,
                startTime: testConfig.created_at,
                endTime: testConfig.updated_at,
                resultCount: testResults.length,
                metrics: calculateTestMetrics(testResults)
            };
            
            reportData.tests.push(testSummary);
            
            if (includeRawData) {
                reportData.rawData.push({
                    testId,
                    results: testResults
                });
            }
        }
    }
    
    // Calculate overall summary
    reportData.summary.averageSuccessRate = reportData.tests.length > 0
        ? reportData.tests.reduce((acc, test) => acc + (test.metrics.successRate || 0), 0) / reportData.tests.length
        : 0;
    
    return reportData;
}

function calculateTestMetrics(results) {
    if (!results.length) return {};
    
    const successfulResults = results.filter(r => 
        r.result_data && 
        (JSON.parse(r.result_data).success !== false)
    );
    
    return {
        totalResults: results.length,
        successfulResults: successfulResults.length,
        successRate: (successfulResults.length / results.length) * 100,
        firstResult: results[results.length - 1].timestamp,
        lastResult: results[0].timestamp
    };
}

async function formatReport(reportData, format) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `performance-report-${timestamp}.${format}`;
    const reportPath = path.join(__dirname, '../data/exports', filename);

    let content;

    switch (format) {
        case 'json':
            content = JSON.stringify(reportData, null, 2);
            break;
        case 'html':
            content = generateHTMLReport(reportData);
            break;
        case 'pdf':
            // For PDF generation, you would use a library like puppeteer or pdfkit
            content = generateHTMLReport(reportData); // Fallback to HTML
            break;
        default:
            throw new Error(`Unsupported report format: ${format}`);
    }

    fs.writeFileSync(reportPath, content);

    return {
        filename,
        size: fs.statSync(reportPath).size
    };
}

function generateHTMLReport(reportData) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Performance Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            .header { background: linear-gradient(45deg, #00d4ff, #7c3aed); color: white; padding: 20px; border-radius: 10px; }
            .summary { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; }
            .metric { display: inline-block; margin: 10px 20px 10px 0; }
            .metric-value { font-size: 2em; font-weight: bold; color: #00d4ff; }
            .metric-label { font-size: 0.9em; color: #666; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .status-success { color: #22c55e; font-weight: bold; }
            .status-failed { color: #ef4444; font-weight: bold; }
            .status-running { color: #f59e0b; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Mobile Carrier Testing Framework</h1>
            <h2>Performance Report</h2>
            <p>Generated: ${reportData.summary.generatedAt}</p>
        </div>
        
        <div class="summary">
            <h2>Summary</h2>
            <div class="metric">
                <div class="metric-value">${reportData.summary.testCount}</div>
                <div class="metric-label">Total Tests</div>
            </div>
            <div class="metric">
                <div class="metric-value">${reportData.summary.averageSuccessRate.toFixed(1)}%</div>
                <div class="metric-label">Average Success Rate</div>
            </div>
        </div>
        
        <h2>Test Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Test ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Results</th>
                    <th>Success Rate</th>
                    <th>Start Time</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.tests.map(test => `
                    <tr>
                        <td>${test.testId}</td>
                        <td>${test.type}</td>
                        <td class="status-${test.status}">${test.status}</td>
                        <td>${test.resultCount}</td>
                        <td>${test.metrics.successRate?.toFixed(1) || 'N/A'}%</td>
                        <td>${new Date(test.startTime).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em;">
            <p>Report generated by Mobile Carrier Testing Framework</p>
        </div>
    </body>
    </html>
    `;
}

module.exports = router;
