const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Import services
const DatabaseService = require('../services/database');
const Logger = require('../services/logger');

const logger = new Logger();
const dbService = new DatabaseService();

// API Connection Test
router.post('/connection', async (req, res) => {
    try {
        const { endpoint, authType, credentials, timeout = 10000 } = req.body;

        if (!endpoint || !credentials) {
            return res.status(400).json({
                error: 'Endpoint and credentials are required'
            });
        }

        logger.info('Testing API connection', { endpoint, authType });

        const startTime = Date.now();
        let headers = {};

        // Set up authentication
        switch (authType) {
            case 'bearer':
                headers['Authorization'] = `Bearer ${credentials}`;
                break;
            case 'apikey':
                headers['X-API-Key'] = credentials;
                break;
            case 'basic':
                headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
                break;
        }

        try {
            const response = await axios.get(endpoint, {
                headers,
                timeout
            });

            const responseTime = Date.now() - startTime;

            res.json({
                success: true,
                statusCode: response.status,
                responseTime,
                message: 'Connection successful'
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            res.json({
                success: false,
                statusCode: error.response?.status || 0,
                responseTime,
                message: error.message,
                error: error.response?.data || 'Connection failed'
            });
        }

    } catch (error) {
        logger.error('API connection test error:', error);
        res.status(500).json({
            error: 'Failed to test API connection',
            message: error.message
        });
    }
});

// API Endpoint Testing
router.post('/endpoint-test', async (req, res) => {
    try {
        const { 
            endpoints, 
            authConfig, 
            concurrentRequests = 1,
            testDuration = 60 
        } = req.body;

        if (!endpoints || !Array.isArray(endpoints) || endpoints.length === 0) {
            return res.status(400).json({
                error: 'Endpoints array is required'
            });
        }

        const testId = uuidv4();

        logger.info(`Starting API endpoint testing ${testId}`, { 
            endpointCount: endpoints.length, 
            concurrentRequests 
        });

        const testConfig = {
            testId,
            type: 'api-endpoint',
            endpoints,
            authConfig,
            concurrentRequests,
            testDuration,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);
        
        // Run API endpoint tests
        runEndpointTests(testId, endpoints, authConfig, concurrentRequests, testDuration);

        res.json({
            testId,
            status: 'started',
            endpoints: endpoints.length,
            estimatedCompletion: new Date(Date.now() + testDuration * 1000)
        });

    } catch (error) {
        logger.error('API endpoint testing error:', error);
        res.status(500).json({
            error: 'Failed to start API endpoint testing',
            message: error.message
        });
    }
});

// Load Testing
router.post('/load-test', async (req, res) => {
    try {
        const { 
            endpoint,
            pattern = 'constant',
            virtualUsers = 10,
            duration = 60,
            authConfig
        } = req.body;

        if (!endpoint) {
            return res.status(400).json({
                error: 'Endpoint is required'
            });
        }

        const testId = uuidv4();

        logger.info(`Starting load test ${testId}`, { 
            endpoint, 
            pattern, 
            virtualUsers, 
            duration 
        });

        const testConfig = {
            testId,
            type: 'load-test',
            endpoint,
            pattern,
            virtualUsers,
            duration,
            authConfig,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);
        
        // Run load test
        runLoadTest(testId, endpoint, pattern, virtualUsers, duration, authConfig);

        res.json({
            testId,
            status: 'started',
            pattern,
            virtualUsers,
            duration,
            estimatedCompletion: new Date(Date.now() + duration * 1000)
        });

    } catch (error) {
        logger.error('Load testing error:', error);
        res.status(500).json({
            error: 'Failed to start load test',
            message: error.message
        });
    }
});

// Performance Testing
router.post('/performance-test', async (req, res) => {
    try {
        const { 
            scenarios,
            duration = 300,
            rampUpTime = 60
        } = req.body;

        if (!scenarios || !Array.isArray(scenarios) || scenarios.length === 0) {
            return res.status(400).json({
                error: 'Test scenarios are required'
            });
        }

        const testId = uuidv4();

        logger.info(`Starting performance test ${testId}`, { 
            scenarioCount: scenarios.length, 
            duration 
        });

        const testConfig = {
            testId,
            type: 'performance-test',
            scenarios,
            duration,
            rampUpTime,
            startTime: new Date()
        };

        await dbService.saveTestConfig(testConfig);
        
        // Run performance test
        runPerformanceTest(testId, scenarios, duration, rampUpTime);

        res.json({
            testId,
            status: 'started',
            scenarios: scenarios.length,
            duration,
            estimatedCompletion: new Date(Date.now() + (duration + rampUpTime) * 1000)
        });

    } catch (error) {
        logger.error('Performance testing error:', error);
        res.status(500).json({
            error: 'Failed to start performance test',
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
        const summary = {
            totalRequests: results.length,
            successfulRequests: results.filter(r => r.success).length,
            failedRequests: results.filter(r => !r.success).length,
            averageResponseTime: results.reduce((acc, r) => acc + r.response_time, 0) / results.length,
            minResponseTime: Math.min(...results.map(r => r.response_time)),
            maxResponseTime: Math.max(...results.map(r => r.response_time))
        };

        res.json({
            testId,
            summary,
            results: results.slice(0, 100) // Limit to last 100 results
        });

    } catch (error) {
        logger.error('Get API test results error:', error);
        res.status(500).json({
            error: 'Failed to get test results',
            message: error.message
        });
    }
});

// Implementation functions
async function runEndpointTests(testId, endpoints, authConfig, concurrentRequests, testDuration) {
    try {
        const startTime = Date.now();
        const endTime = startTime + (testDuration * 1000);
        
        const runTest = async (endpoint) => {
            while (Date.now() < endTime) {
                const requestStart = Date.now();
                
                try {
                    let headers = {};
                    
                    // Set up authentication
                    if (authConfig) {
                        switch (authConfig.type) {
                            case 'bearer':
                                headers['Authorization'] = `Bearer ${authConfig.token}`;
                                break;
                            case 'apikey':
                                headers['X-API-Key'] = authConfig.key;
                                break;
                        }
                    }

                    const response = await axios({
                        method: endpoint.method || 'GET',
                        url: endpoint.url,
                        headers,
                        timeout: 10000
                    });

                    const responseTime = Date.now() - requestStart;
                    
                    const result = {
                        testId,
                        endpoint: endpoint.url,
                        method: endpoint.method || 'GET',
                        statusCode: response.status,
                        responseTime,
                        success: response.status >= 200 && response.status < 300,
                        errorMessage: null
                    };

                    await dbService.saveApiTestResult(result);

                } catch (error) {
                    const responseTime = Date.now() - requestStart;
                    
                    const result = {
                        testId,
                        endpoint: endpoint.url,
                        method: endpoint.method || 'GET',
                        statusCode: error.response?.status || 0,
                        responseTime,
                        success: false,
                        errorMessage: error.message
                    };

                    await dbService.saveApiTestResult(result);
                }

                // Wait before next request
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        };

        // Run tests for all endpoints concurrently
        const promises = endpoints.map(endpoint => runTest(endpoint));
        await Promise.all(promises);

        await dbService.updateTestStatus(testId, 'completed');
        logger.info(`API endpoint testing ${testId} completed`);

    } catch (error) {
        logger.error(`API endpoint testing ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

async function runLoadTest(testId, endpoint, pattern, virtualUsers, duration, authConfig) {
    try {
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);
        
        // Calculate load pattern
        let currentUsers = pattern === 'ramp' ? 1 : virtualUsers;
        const userIncrement = pattern === 'ramp' ? Math.floor(virtualUsers / 10) : 0;
        
        const activeUsers = new Set();
        
        const createUser = async (userId) => {
            while (Date.now() < endTime && activeUsers.has(userId)) {
                const requestStart = Date.now();
                
                try {
                    let headers = {};
                    
                    if (authConfig) {
                        switch (authConfig.type) {
                            case 'bearer':
                                headers['Authorization'] = `Bearer ${authConfig.token}`;
                                break;
                            case 'apikey':
                                headers['X-API-Key'] = authConfig.key;
                                break;
                        }
                    }

                    const response = await axios.get(endpoint, {
                        headers,
                        timeout: 10000
                    });

                    const responseTime = Date.now() - requestStart;
                    
                    const result = {
                        testId,
                        endpoint,
                        method: 'GET',
                        statusCode: response.status,
                        responseTime,
                        success: response.status >= 200 && response.status < 300,
                        errorMessage: null
                    };

                    await dbService.saveApiTestResult(result);

                    // Broadcast real-time update
                    const { broadcast } = require('../server');
                    broadcast({
                        type: 'load_test_update',
                        testId,
                        data: {
                            activeUsers: activeUsers.size,
                            responseTime,
                            success: result.success
                        }
                    });

                } catch (error) {
                    const responseTime = Date.now() - requestStart;
                    
                    const result = {
                        testId,
                        endpoint,
                        method: 'GET',
                        statusCode: error.response?.status || 0,
                        responseTime,
                        success: false,
                        errorMessage: error.message
                    };

                    await dbService.saveApiTestResult(result);
                }

                // Random delay between requests (0.5-2 seconds)
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500));
            }
        };

        // Start initial users
        for (let i = 0; i < currentUsers; i++) {
            activeUsers.add(i);
            createUser(i);
        }

        // Ramp up users if pattern is 'ramp'
        if (pattern === 'ramp') {
            const rampInterval = setInterval(() => {
                if (currentUsers < virtualUsers && Date.now() < endTime) {
                    for (let i = 0; i < userIncrement && currentUsers < virtualUsers; i++) {
                        const userId = currentUsers++;
                        activeUsers.add(userId);
                        createUser(userId);
                    }
                } else {
                    clearInterval(rampInterval);
                }
            }, (duration * 1000) / 10); // Ramp up over 10 intervals
        }

        // Wait for test to complete
        setTimeout(async () => {
            activeUsers.clear();
            await dbService.updateTestStatus(testId, 'completed');
            logger.info(`Load test ${testId} completed`);
        }, duration * 1000);

    } catch (error) {
        logger.error(`Load test ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

async function runPerformanceTest(testId, scenarios, duration, rampUpTime) {
    try {
        // Simulate comprehensive performance testing
        const startTime = Date.now();
        const totalDuration = (duration + rampUpTime) * 1000;
        
        for (const scenario of scenarios) {
            // Run each scenario
            setTimeout(async () => {
                const result = {
                    scenario: scenario.name,
                    throughput: Math.random() * 1000 + 100, // Requests per second
                    averageResponseTime: Math.random() * 500 + 100, // ms
                    errorRate: Math.random() * 5, // Percentage
                    timestamp: new Date()
                };

                await dbService.saveTestResult(testId, result);
                
                const { broadcast } = require('../server');
                broadcast({
                    type: 'performance_test_update',
                    testId,
                    data: result
                });
            }, Math.random() * totalDuration);
        }

        setTimeout(async () => {
            await dbService.updateTestStatus(testId, 'completed');
            logger.info(`Performance test ${testId} completed`);
        }, totalDuration);

    } catch (error) {
        logger.error(`Performance test ${testId} error:`, error);
        await dbService.updateTestStatus(testId, 'failed');
    }
}

module.exports = router;
