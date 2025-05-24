const express = require('express');
const router = express.Router();
const speedTest = require('speedtest-net');
const ping = require('ping');
const { v4: uuidv4 } = require('uuid');

// Import services
const TestingEngine = require('../services/testing-engine');
const DatabaseService = require('../services/database');
const Logger = require('../services/logger');

const logger = new Logger();
const testingEngine = new TestingEngine();
const dbService = new DatabaseService();

// Speed Test Endpoint
router.post('/speed', async (req, res) => {
    try {
        const { duration = 30, frequency = 1 } = req.body;
        const testId = uuidv4();

        logger.info(`Starting speed test ${testId}`, { duration, frequency });

        // Validate parameters
        if (duration < 5 || duration > 300) {
            return res.status(400).json({
                error: 'Duration must be between 5 and 300 seconds'
            });
        }

        if (frequency < 0.1 || frequency > 10) {
            return res.status(400).json({
                error: 'Frequency must be between 0.1 and 10 Hz'
            });
        }

        // Start speed test
        const testConfig = {
            testId,
            type: 'speed',
            duration,
            frequency,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Run speed test asynchronously
        runSpeedTest(testId, duration, frequency);

        res.json({
            testId,
            status: 'started',
            estimatedCompletion: new Date(Date.now() + duration * 1000)
        });

    } catch (error) {
        logger.error('Speed test error:', error);
        res.status(500).json({
            error: 'Failed to start speed test',
            message: error.message
        });
    }
});

// Signal Strength Monitoring
router.post('/signal', async (req, res) => {
    try {
        const { interval = 5, threshold = -70, duration = 300 } = req.body;
        const testId = uuidv4();

        logger.info(`Starting signal monitoring ${testId}`, { interval, threshold, duration });

        const testConfig = {
            testId,
            type: 'signal',
            interval,
            threshold,
            duration,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Start signal monitoring
        runSignalMonitoring(testId, interval, threshold, duration);

        res.json({
            testId,
            status: 'started',
            monitoringInterval: interval,
            threshold
        });

    } catch (error) {
        logger.error('Signal monitoring error:', error);
        res.status(500).json({
            error: 'Failed to start signal monitoring',
            message: error.message
        });
    }
});

// Coverage Area Mapping
router.post('/coverage', async (req, res) => {
    try {
        const { bounds, density = 'medium' } = req.body;
        const testId = uuidv4();

        if (!bounds) {
            return res.status(400).json({
                error: 'Geographic bounds are required'
            });
        }

        logger.info(`Starting coverage mapping ${testId}`, { bounds, density });

        const testConfig = {
            testId,
            type: 'coverage',
            bounds,
            density,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Run coverage mapping
        const result = await runCoverageMapping(testId, bounds, density);

        res.json({
            testId,
            status: 'completed',
            result
        });

    } catch (error) {
        logger.error('Coverage mapping error:', error);
        res.status(500).json({
            error: 'Failed to run coverage mapping',
            message: error.message
        });
    }
});

// Roaming Test
router.post('/roaming', async (req, res) => {
    try {
        const { sourceNetwork, targetRegions } = req.body;
        const testId = uuidv4();

        if (!sourceNetwork || !targetRegions) {
            return res.status(400).json({
                error: 'Source network and target regions are required'
            });
        }

        logger.info(`Starting roaming test ${testId}`, { sourceNetwork, targetRegions });

        const testConfig = {
            testId,
            type: 'roaming',
            sourceNetwork,
            targetRegions,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Run roaming test
        runRoamingTest(testId, sourceNetwork, targetRegions);

        res.json({
            testId,
            status: 'started',
            sourceNetwork,
            targetRegions
        });

    } catch (error) {
        logger.error('Roaming test error:', error);
        res.status(500).json({
            error: 'Failed to start roaming test',
            message: error.message
        });
    }
});

// Get Test Status
router.get('/test/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        const testStatus = await dbService.getTestStatus(testId);

        if (!testStatus) {
            return res.status(404).json({
                error: 'Test not found'
            });
        }

        res.json(testStatus);

    } catch (error) {
        logger.error('Get test status error:', error);
        res.status(500).json({
            error: 'Failed to get test status',
            message: error.message
        });
    }
});

// Stop Test
router.delete('/test/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        
        await testingEngine.stopTest(testId);
        await dbService.updateTestStatus(testId, 'stopped');

        logger.info(`Test ${testId} stopped`);

        res.json({
            testId,
            status: 'stopped'
        });

    } catch (error) {
        logger.error('Stop test error:', error);
        res.status(500).json({
            error: 'Failed to stop test',
            message: error.message
        });
    }
});

// Implementation functions
async function runSpeedTest(testId, duration, frequency) {
    try {
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);
        const interval = 1000 / frequency;

        const testData = {
            testId,
            results: [],
            status: 'running'
        };

        const intervalId = setInterval(async () => {
            try {
                // Simulate speed test (replace with actual speed test library)
                const result = {
                    timestamp: new Date(),
                    downloadSpeed: Math.random() * 50 + 25, // 25-75 Mbps
                    uploadSpeed: Math.random() * 20 + 5,    // 5-25 Mbps
                    latency: Math.random() * 50 + 20,       // 20-70 ms
                    jitter: Math.random() * 10 + 2          // 2-12 ms
                };

                testData.results.push(result);
                await dbService.saveTestResult(testId, result);

                // Broadcast real-time update
                const { broadcast } = require('../server');
                broadcast({
                    type: 'test_update',
                    testId,
                    data: result,
                    status: 'running'
                });

                if (Date.now() >= endTime) {
                    clearInterval(intervalId);
                    testData.status = 'completed';
                    await dbService.updateTestStatus(testId, 'completed');
                    
                    broadcast({
                        type: 'test_complete',
                        testId,
                        status: 'completed'
                    });

                    logger.info(`Speed test ${testId} completed`);
                }

            } catch (error) {
                logger.error(`Speed test ${testId} interval error:`, error);
            }
        }, interval);

        // Store interval ID for cleanup
        testingEngine.addActiveTest(testId, intervalId);

    } catch (error) {
        logger.error(`Speed test ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

async function runSignalMonitoring(testId, interval, threshold, duration) {
    try {
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);

        const intervalId = setInterval(async () => {
            try {
                // Simulate signal strength measurement
                const signalStrength = -40 - (Math.random() * 60); // -40 to -100 dBm
                
                const result = {
                    timestamp: new Date(),
                    signalStrength,
                    belowThreshold: signalStrength < threshold
                };

                await dbService.saveTestResult(testId, result);

                const { broadcast } = require('../server');
                broadcast({
                    type: 'signal_update',
                    testId,
                    data: result
                });

                if (result.belowThreshold) {
                    logger.warn(`Signal below threshold: ${signalStrength} dBm`);
                }

                if (Date.now() >= endTime) {
                    clearInterval(intervalId);
                    await dbService.updateTestStatus(testId, 'completed');
                    logger.info(`Signal monitoring ${testId} completed`);
                }

            } catch (error) {
                logger.error(`Signal monitoring ${testId} error:`, error);
            }
        }, interval * 1000);

        testingEngine.addActiveTest(testId, intervalId);

    } catch (error) {
        logger.error(`Signal monitoring ${testId} setup error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

async function runCoverageMapping(testId, bounds, density) {
    try {
        const densityMap = {
            low: 100,
            medium: 500,
            high: 1000
        };

        const samplePoints = densityMap[density] || 500;
        let coveredPoints = 0;

        // Simulate coverage testing
        for (let i = 0; i < samplePoints; i++) {
            // Simulate coverage check (85% coverage rate)
            if (Math.random() > 0.15) {
                coveredPoints++;
            }
        }

        const coveragePercentage = (coveredPoints / samplePoints) * 100;

        const result = {
            testId,
            bounds,
            density,
            samplePoints,
            coveredPoints,
            coverage: coveragePercentage,
            completedAt: new Date()
        };

        await dbService.saveTestResult(testId, result);
        await dbService.updateTestStatus(testId, 'completed');

        logger.info(`Coverage mapping ${testId} completed: ${coveragePercentage.toFixed(1)}% coverage`);

        return result;

    } catch (error) {
        logger.error(`Coverage mapping ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
        throw error;
    }
}

async function runRoamingTest(testId, sourceNetwork, targetRegions) {
    try {
        const regions = targetRegions.split(',').map(r => r.trim());
        const results = [];

        for (const region of regions) {
            // Simulate roaming test (70% success rate)
            const success = Math.random() > 0.3;
            const latency = success ? Math.random() * 100 + 50 : null;

            const result = {
                region,
                success,
                latency,
                timestamp: new Date()
            };

            results.push(result);
            await dbService.saveTestResult(testId, result);

            // Broadcast update
            const { broadcast } = require('../server');
            broadcast({
                type: 'roaming_update',
                testId,
                data: result
            });

            // Add delay between regions
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await dbService.updateTestStatus(testId, 'completed');
        logger.info(`Roaming test ${testId} completed`);

        return results;

    } catch (error) {
        logger.error(`Roaming test ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
        throw error;
    }
}

module.exports = router;
