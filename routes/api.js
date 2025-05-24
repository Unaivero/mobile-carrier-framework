const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Import services
const TestingEngine = require('../services/testing-engine');
const DatabaseService = require('../services/database');
const Logger = require('../services/logger');

const logger = new Logger();
const testingEngine = new TestingEngine();
const dbService = new DatabaseService();

// API Endpoint Testing
router.post('/test', async (req, res) => {
    try {
        const { 
            endpoints, 
            method = 'GET', 
            headers = {}, 
            payload = null, 
            timeout = 30000,
            iterations = 1,
            interval = 1000
        } = req.body;

        const testId = uuidv4();

        if (!endpoints || !Array.isArray(endpoints) || endpoints.length === 0) {
            return res.status(400).json({
                error: 'At least one endpoint is required'
            });
        }

        logger.info(`Starting API test ${testId}`, { 
            endpointCount: endpoints.length, 
            method, 
            iterations 
        });

        const testConfig = {
            testId,
            type: 'api_test',
            endpoints,
            method,
            headers,
            payload,
            timeout,
            iterations,
            interval,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Run API test
        runApiTest(testId, testConfig);

        res.json({
            testId,
            status: 'started',
            endpointCount: endpoints.length,
            estimatedDuration: Math.ceil((iterations * endpoints.length * interval) / 1000)
        });

    } catch (error) {
        logger.error('API test error:', error);
        res.status(500).json({
            error: 'Failed to start API test',
            message: error.message
        });
    }
});

// Load Testing
router.post('/load', async (req, res) => {
    try {
        const {
            endpoint,
            method = 'GET',
            headers = {},
            payload = null,
            concurrency = 10,
            duration = 60,
            rampUp = 10
        } = req.body;

        const testId = uuidv4();

        if (!endpoint) {
            return res.status(400).json({
                error: 'Endpoint is required for load testing'
            });
        }

        logger.info(`Starting load test ${testId}`, { 
            endpoint, 
            concurrency, 
            duration 
        });

        const testConfig = {
            testId,
            type: 'load_test',
            endpoint,
            method,
            headers,
            payload,
            concurrency,
            duration,
            rampUp,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Run load test
        runLoadTest(testId, testConfig);

        res.json({
            testId,
            status: 'started',
            endpoint,
            concurrency,
            estimatedCompletion: new Date(Date.now() + (duration + rampUp) * 1000)
        });

    } catch (error) {
        logger.error('Load test error:', error);
        res.status(500).json({
            error: 'Failed to start load test',
            message: error.message
        });
    }
});

// Carrier API Integration Test
router.post('/carrier', async (req, res) => {
    try {
        const {
            carrierId,
            testSuite = 'basic',
            authConfig = {}
        } = req.body;

        const testId = uuidv4();

        if (!carrierId) {
            return res.status(400).json({
                error: 'Carrier ID is required'
            });
        }

        // Get carrier configuration
        const carriers = await dbService.getCarriers();
        const carrier = carriers.find(c => c.id === carrierId);

        if (!carrier) {
            return res.status(404).json({
                error: 'Carrier not found'
            });
        }

        logger.info(`Starting carrier API test ${testId}`, { carrierId, testSuite });

        const testConfig = {
            testId,
            type: 'carrier_api_test',
            carrierId,
            carrier,
            testSuite,
            authConfig,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Run carrier API test
        runCarrierApiTest(testId, testConfig);

        res.json({
            testId,
            status: 'started',
            carrier: carrier.name,
            testSuite
        });

    } catch (error) {
        logger.error('Carrier API test error:', error);
        res.status(500).json({
            error: 'Failed to start carrier API test',
            message: error.message
        });
    }
});

// API Health Check
router.post('/health', async (req, res) => {
    try {
        const { endpoints, interval = 30, duration = 300 } = req.body;
        const testId = uuidv4();

        if (!endpoints || !Array.isArray(endpoints)) {
            return res.status(400).json({
                error: 'Endpoints array is required'
            });
        }

        logger.info(`Starting API health check ${testId}`, { 
            endpointCount: endpoints.length, 
            interval, 
            duration 
        });

        const testConfig = {
            testId,
            type: 'api_health_check',
            endpoints,
            interval,
            duration,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);

        // Run health check
        runApiHealthCheck(testId, testConfig);

        res.json({
            testId,
            status: 'started',
            endpoints: endpoints.length,
            checkInterval: interval,
            estimatedCompletion: new Date(Date.now() + duration * 1000)
        });

    } catch (error) {
        logger.error('API health check error:', error);
        res.status(500).json({
            error: 'Failed to start API health check',
            message: error.message
        });
    }
});

// Get API Test Results
router.get('/results/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        const results = await dbService.getApiTestResults(testId);
        
        if (results.length === 0) {
            return res.status(404).json({
                error: 'No results found for this test'
            });
        }

        // Calculate summary statistics
        const summary = calculateApiTestSummary(results);

        res.json({
            testId,
            summary,
            results: results.slice(0, 100) // Limit to latest 100 results
        });

    } catch (error) {
        logger.error('Get API test results error:', error);
        res.status(500).json({
            error: 'Failed to get API test results',
            message: error.message
        });
    }
});

// Implementation Functions

async function runApiTest(testId, config) {
    try {
        const { endpoints, method, headers, payload, timeout, iterations, interval } = config;
        let completedRequests = 0;
        const totalRequests = endpoints.length * iterations;

        for (let iteration = 0; iteration < iterations; iteration++) {
            for (const endpoint of endpoints) {
                try {
                    const startTime = Date.now();
                    
                    const axiosConfig = {
                        method: method.toLowerCase(),
                        url: endpoint,
                        headers,
                        timeout,
                        validateStatus: () => true // Don't throw on HTTP error status
                    };

                    if (payload && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
                        axiosConfig.data = payload;
                    }

                    const response = await axios(axiosConfig);
                    const responseTime = Date.now() - startTime;

                    const result = {
                        testId,
                        endpoint,
                        method,
                        statusCode: response.status,
                        responseTime,
                        success: response.status >= 200 && response.status < 400,
                        responseSize: JSON.stringify(response.data).length,
                        headers: response.headers,
                        timestamp: new Date()
                    };

                    await dbService.saveApiTestResult(result);
                    completedRequests++;

                    // Broadcast real-time update
                    const { broadcast } = require('../server');
                    if (broadcast) {
                        broadcast({
                            type: 'api_test_update',
                            testId,
                            data: result,
                            progress: (completedRequests / totalRequests) * 100
                        });
                    }

                } catch (error) {
                    const result = {
                        testId,
                        endpoint,
                        method,
                        statusCode: 0,
                        responseTime: timeout,
                        success: false,
                        errorMessage: error.message,
                        timestamp: new Date()
                    };

                    await dbService.saveApiTestResult(result);
                    completedRequests++;

                    logger.error(`API test error for ${endpoint}:`, error.message);
                }

                // Wait between requests
                if (interval > 0 && completedRequests < totalRequests) {
                    await new Promise(resolve => setTimeout(resolve, interval));
                }
            }
        }

        await dbService.updateTestStatus(testId, 'completed');
        
        const { broadcast } = require('../server');
        if (broadcast) {
            broadcast({
                type: 'api_test_complete',
                testId,
                completedRequests,
                totalRequests
            });
        }

        logger.info(`API test ${testId} completed: ${completedRequests}/${totalRequests} requests`);

    } catch (error) {
        logger.error(`API test ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

async function runLoadTest(testId, config) {
    try {
        const { endpoint, method, headers, payload, concurrency, duration, rampUp } = config;
        const workers = [];
        const results = [];
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);
        
        // Ramp up workers gradually
        const rampUpInterval = (rampUp * 1000) / concurrency;
        
        for (let i = 0; i < concurrency; i++) {
            setTimeout(() => {
                const worker = createLoadTestWorker(testId, endpoint, method, headers, payload, endTime, results);
                workers.push(worker);
            }, i * rampUpInterval);
        }

        // Monitor and report progress
        const reportInterval = setInterval(async () => {
            if (Date.now() >= endTime) {
                clearInterval(reportInterval);
                
                // Calculate final statistics
                const summary = {
                    totalRequests: results.length,
                    successfulRequests: results.filter(r => r.success).length,
                    failedRequests: results.filter(r => !r.success).length,
                    averageResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
                    minResponseTime: Math.min(...results.map(r => r.responseTime)),
                    maxResponseTime: Math.max(...results.map(r => r.responseTime)),
                    requestsPerSecond: results.length / duration,
                    duration: duration
                };

                await dbService.saveTestResult(testId, summary);
                await dbService.updateTestStatus(testId, 'completed');

                const { broadcast } = require('../server');
                if (broadcast) {
                    broadcast({
                        type: 'load_test_complete',
                        testId,
                        summary
                    });
                }

                logger.info(`Load test ${testId} completed: ${summary.totalRequests} requests, ${summary.requestsPerSecond.toFixed(2)} RPS`);
            } else {
                // Report current progress
                const currentRPS = results.length / ((Date.now() - startTime) / 1000);
                const { broadcast } = require('../server');
                if (broadcast) {
                    broadcast({
                        type: 'load_test_update',
                        testId,
                        data: {
                            totalRequests: results.length,
                            currentRPS: currentRPS.toFixed(2),
                            activeWorkers: workers.length,
                            elapsed: Math.floor((Date.now() - startTime) / 1000)
                        }
                    });
                }
            }
        }, 5000); // Report every 5 seconds

        testingEngine.addActiveTest(testId, reportInterval);

    } catch (error) {
        logger.error(`Load test ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

function createLoadTestWorker(testId, endpoint, method, headers, payload, endTime, results) {
    const worker = setInterval(async () => {
        if (Date.now() >= endTime) {
            clearInterval(worker);
            return;
        }

        try {
            const startTime = Date.now();
            
            const axiosConfig = {
                method: method.toLowerCase(),
                url: endpoint,
                headers,
                timeout: 30000,
                validateStatus: () => true
            };

            if (payload && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
                axiosConfig.data = payload;
            }

            const response = await axios(axiosConfig);
            const responseTime = Date.now() - startTime;

            const result = {
                testId,
                endpoint,
                method,
                statusCode: response.status,
                responseTime,
                success: response.status >= 200 && response.status < 400,
                timestamp: new Date()
            };

            results.push(result);
            await dbService.saveApiTestResult(result);

        } catch (error) {
            const result = {
                testId,
                endpoint,
                method,
                statusCode: 0,
                responseTime: 30000,
                success: false,
                errorMessage: error.message,
                timestamp: new Date()
            };

            results.push(result);
            await dbService.saveApiTestResult(result);
        }
    }, Math.random() * 1000 + 500); // Random interval between 500-1500ms

    return worker;
}

async function runCarrierApiTest(testId, config) {
    try {
        const { carrier, testSuite, authConfig } = config;
        const testSuites = {
            basic: [
                { endpoint: '/status', method: 'GET', description: 'Service status check' },
                { endpoint: '/health', method: 'GET', description: 'Health check' }
            ],
            comprehensive: [
                { endpoint: '/status', method: 'GET', description: 'Service status check' },
                { endpoint: '/health', method: 'GET', description: 'Health check' },
                { endpoint: '/coverage', method: 'GET', description: 'Coverage areas' },
                { endpoint: '/plans', method: 'GET', description: 'Available plans' },
                { endpoint: '/usage', method: 'GET', description: 'Usage statistics' }
            ],
            authentication: [
                { endpoint: '/auth/token', method: 'POST', description: 'Token authentication' },
                { endpoint: '/auth/validate', method: 'GET', description: 'Token validation' },
                { endpoint: '/auth/refresh', method: 'POST', description: 'Token refresh' }
            ]
        };

        const tests = testSuites[testSuite] || testSuites.basic;
        const baseURL = carrier.api_endpoint || carrier.apiEndpoint;

        if (!baseURL) {
            throw new Error('Carrier API endpoint not configured');
        }

        for (const test of tests) {
            try {
                const fullEndpoint = `${baseURL}${test.endpoint}`;
                const startTime = Date.now();

                const axiosConfig = {
                    method: test.method.toLowerCase(),
                    url: fullEndpoint,
                    timeout: 30000,
                    validateStatus: () => true
                };

                // Add authentication if configured
                if (authConfig.apiKey) {
                    axiosConfig.headers = {
                        'Authorization': `Bearer ${authConfig.apiKey}`,
                        'Content-Type': 'application/json'
                    };
                }

                if (test.method.toUpperCase() === 'POST' && test.payload) {
                    axiosConfig.data = test.payload;
                }

                const response = await axios(axiosConfig);
                const responseTime = Date.now() - startTime;

                const result = {
                    testId,
                    endpoint: fullEndpoint,
                    method: test.method,
                    description: test.description,
                    statusCode: response.status,
                    responseTime,
                    success: response.status >= 200 && response.status < 400,
                    responseData: response.data,
                    timestamp: new Date()
                };

                await dbService.saveApiTestResult(result);

                // Broadcast update
                const { broadcast } = require('../server');
                if (broadcast) {
                    broadcast({
                        type: 'carrier_api_update',
                        testId,
                        data: result
                    });
                }

                logger.info(`Carrier API test: ${test.description} - ${result.success ? 'PASSED' : 'FAILED'}`);

            } catch (error) {
                const result = {
                    testId,
                    endpoint: `${baseURL}${test.endpoint}`,
                    method: test.method,
                    description: test.description,
                    statusCode: 0,
                    responseTime: 30000,
                    success: false,
                    errorMessage: error.message,
                    timestamp: new Date()
                };

                await dbService.saveApiTestResult(result);
                logger.error(`Carrier API test error for ${test.description}:`, error.message);
            }

            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await dbService.updateTestStatus(testId, 'completed');
        logger.info(`Carrier API test ${testId} completed for ${carrier.name}`);

    } catch (error) {
        logger.error(`Carrier API test ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

async function runApiHealthCheck(testId, config) {
    try {
        const { endpoints, interval, duration } = config;
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);

        const intervalId = setInterval(async () => {
            const timestamp = new Date();
            
            for (const endpoint of endpoints) {
                try {
                    const checkStartTime = Date.now();
                    const response = await axios.get(endpoint, {
                        timeout: 10000,
                        validateStatus: () => true
                    });
                    const responseTime = Date.now() - checkStartTime;

                    const result = {
                        testId,
                        endpoint,
                        method: 'GET',
                        statusCode: response.status,
                        responseTime,
                        success: response.status >= 200 && response.status < 400,
                        timestamp
                    };

                    await dbService.saveApiTestResult(result);

                    // Broadcast health status
                    const { broadcast } = require('../server');
                    if (broadcast) {
                        broadcast({
                            type: 'api_health_update',
                            testId,
                            endpoint,
                            data: result
                        });
                    }

                } catch (error) {
                    const result = {
                        testId,
                        endpoint,
                        method: 'GET',
                        statusCode: 0,
                        responseTime: 10000,
                        success: false,
                        errorMessage: error.message,
                        timestamp
                    };

                    await dbService.saveApiTestResult(result);
                }
            }

            if (Date.now() >= endTime) {
                clearInterval(intervalId);
                await dbService.updateTestStatus(testId, 'completed');
                logger.info(`API health check ${testId} completed`);
            }
        }, interval * 1000);

        testingEngine.addActiveTest(testId, intervalId);

    } catch (error) {
        logger.error(`API health check ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

function calculateApiTestSummary(results) {
    if (results.length === 0) return {};

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
        totalRequests: results.length,
        successfulRequests: successful.length,
        failedRequests: failed.length,
        successRate: (successful.length / results.length) * 100,
        averageResponseTime: results.reduce((sum, r) => sum + r.response_time, 0) / results.length,
        minResponseTime: Math.min(...results.map(r => r.response_time)),
        maxResponseTime: Math.max(...results.map(r => r.response_time)),
        statusCodeDistribution: results.reduce((acc, r) => {
            acc[r.status_code] = (acc[r.status_code] || 0) + 1;
            return acc;
        }, {}),
        errorTypes: failed.reduce((acc, r) => {
            const error = r.error_message || 'Unknown error';
            acc[error] = (acc[error] || 0) + 1;
            return acc;
        }, {})
    };
}

module.exports = router;