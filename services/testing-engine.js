const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

class TestingEngine {
    constructor() {
        this.activeTests = new Map();
        this.testQueue = [];
        this.scheduledTests = new Map();
        this.maxConcurrentTests = process.env.MAX_CONCURRENT_TESTS || 10;
        this.queueProcessor = null;
        this.initialized = false;
        this.stats = {
            testsExecuted: 0,
            testsSuccessful: 0,
            testsFailed: 0,
            totalRunTime: 0
        };
    }

    async initialize() {
        if (this.initialized) return;

        console.log('Initializing Testing Engine...');
        
        // Start queue processor
        this.startQueueProcessor();
        
        // Initialize scheduled test checker
        this.startScheduledTestChecker();
        
        // Initialize performance monitoring
        this.startPerformanceMonitoring();
        
        this.initialized = true;
        console.log('Testing Engine initialized successfully');
        
        // Send initialization notification
        try {
            const NotificationService = require('./notification');
            const notificationService = new NotificationService();
            await notificationService.initialize();
            await notificationService.sendSystemNotification(
                'startup', 
                'Testing Engine initialized successfully'
            );
        } catch (error) {
            console.warn('Failed to send initialization notification:', error.message);
        }
    }

    addActiveTest(testId, intervalId, config = {}) {
        const testInfo = {
            testId,
            intervalId,
            startTime: new Date(),
            status: 'running',
            type: config.type || 'unknown',
            config,
            lastUpdate: new Date()
        };
        
        this.activeTests.set(testId, testInfo);
        
        // Update stats
        this.stats.testsExecuted++;
        
        console.log(`Test ${testId} added to active tests (${this.activeTests.size}/${this.maxConcurrentTests})`);
        
        // Broadcast update
        this.broadcastTestUpdate(testId, 'started', testInfo);
    }

    async stopTest(testId) {
        const test = this.activeTests.get(testId);
        if (!test) {
            console.warn(`Test ${testId} not found in active tests`);
            return false;
        }

        try {
            // Clear interval/timeout if exists
            if (test.intervalId) {
                clearInterval(test.intervalId);
                clearTimeout(test.intervalId);
            }

            // Calculate runtime
            const runtime = Date.now() - test.startTime.getTime();
            this.stats.totalRunTime += runtime;

            // Remove from active tests
            this.activeTests.delete(testId);
            
            console.log(`Test ${testId} stopped (runtime: ${Math.round(runtime/1000)}s)`);
            
            // Broadcast update
            this.broadcastTestUpdate(testId, 'stopped', { 
                testId, 
                runtime,
                stoppedAt: new Date()
            });
            
            return true;
        } catch (error) {
            console.error(`Error stopping test ${testId}:`, error);
            return false;
        }
    }

    async stopAllTests() {
        console.log(`Stopping all ${this.activeTests.size} active tests...`);
        
        const testIds = Array.from(this.activeTests.keys());
        let stoppedCount = 0;
        
        for (const testId of testIds) {
            if (await this.stopTest(testId)) {
                stoppedCount++;
            }
        }
        
        console.log(`Stopped ${stoppedCount}/${testIds.length} tests`);
        
        // Clear any remaining tests
        this.activeTests.clear();
        
        return stoppedCount;
    }

    getActiveTestCount() {
        return this.activeTests.size;
    }

    getActiveTests() {
        return Array.from(this.activeTests.values());
    }

    getTestById(testId) {
        return this.activeTests.get(testId);
    }

    getStats() {
        const avgRunTime = this.stats.testsExecuted > 0 
            ? this.stats.totalRunTime / this.stats.testsExecuted 
            : 0;
            
        return {
            ...this.stats,
            activeTests: this.activeTests.size,
            queuedTests: this.testQueue.length,
            scheduledTests: this.scheduledTests.size,
            successRate: this.stats.testsExecuted > 0 
                ? (this.stats.testsSuccessful / this.stats.testsExecuted) * 100 
                : 0,
            averageRunTime: Math.round(avgRunTime / 1000) // in seconds
        };
    }

    broadcastTestUpdate(testId, eventType, data) {
        try {
            const { broadcast } = require('../server');
            if (broadcast && typeof broadcast === 'function') {
                broadcast({
                    type: eventType,
                    testId,
                    data,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            // Silently handle broadcast errors to avoid circular dependencies
        }
    }

    startQueueProcessor() {
        if (this.queueProcessor) {
            clearInterval(this.queueProcessor);
        }
        
        this.queueProcessor = setInterval(() => {
            // Basic queue processing logic
            if (this.testQueue.length > 0 && this.activeTests.size < this.maxConcurrentTests) {
                const nextTest = this.testQueue.shift();
                if (nextTest) {
                    this.executeTest(nextTest);
                }
            }
        }, 1000);
        
        console.log('Queue processor started');
    }

    async executeTest(testConfig) {
        console.log(`Executing test: ${testConfig.type || 'unknown'}`);
        // Basic test execution - can be expanded based on test types
    }

    startScheduledTestChecker() {
        // Check for scheduled tests every minute
        setInterval(() => {
            const activeScheduled = Array.from(this.scheduledTests.values())
                .filter(s => s.active).length;
            
            if (activeScheduled > 0) {
                console.log(`Active scheduled tests: ${activeScheduled}`);
            }
        }, 60000);
    }

    startPerformanceMonitoring() {
        setInterval(() => {
            const stats = this.getStats();
            
            // Check for performance issues
            if (stats.activeTests > this.maxConcurrentTests * 0.9) {
                console.warn(`High concurrent test load: ${stats.activeTests}/${this.maxConcurrentTests}`);
            }
            
            if (stats.queuedTests > 50) {
                console.warn(`Large test queue: ${stats.queuedTests} tests queued`);
            }
            
            // Memory usage check
            const memUsage = process.memoryUsage();
            const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            
            if (memUsageMB > 500) { // Alert if using more than 500MB
                console.warn(`High memory usage: ${memUsageMB}MB`);
            }
            
        }, 30000); // Check every 30 seconds
    }

    // Cleanup and shutdown
    async shutdown() {
        console.log('Shutting down Testing Engine...');
        
        // Stop queue processor
        if (this.queueProcessor) {
            clearInterval(this.queueProcessor);
        }
        
        // Stop all active tests
        await this.stopAllTests();
        
        // Stop all scheduled tests
        for (const [scheduleId] of this.scheduledTests) {
            this.removeScheduledTest(scheduleId);
        }
        
        console.log('Testing Engine shutdown complete');
    }

    removeScheduledTest(scheduleId) {
        const scheduled = this.scheduledTests.get(scheduleId);
        if (scheduled) {
            if (scheduled.task) {
                scheduled.task.stop();
            }
            this.scheduledTests.delete(scheduleId);
            console.log(`Removed scheduled test: ${scheduleId}`);
            return true;
        }
        return false;
    }
}

module.exports = TestingEngine;