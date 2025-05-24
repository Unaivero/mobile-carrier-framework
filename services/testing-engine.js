class TestingEngine {
    constructor() {
        this.activeTests = new Map();
        this.testQueue = [];
        this.maxConcurrentTests = process.env.MAX_CONCURRENT_TESTS || 10;
    }

    async initialize() {
        console.log('Testing Engine initialized');
        this.startQueueProcessor();
    }

    addActiveTest(testId, intervalId) {
        this.activeTests.set(testId, {
            intervalId,
            startTime: new Date(),
            status: 'running'
        });
    }

    async stopTest(testId) {
        const test = this.activeTests.get(testId);
        if (test && test.intervalId) {
            clearInterval(test.intervalId);
            this.activeTests.delete(testId);
            return true;
        }
        return false;
    }

    getActiveTestCount() {
        return this.activeTests.size;
    }

    startQueueProcessor() {
        setInterval(() => {
            if (this.testQueue.length > 0 && this.activeTests.size < this.maxConcurrentTests) {
                const nextTest = this.testQueue.shift();
                if (nextTest) {
                    this.executeTest(nextTest);
                }
            }
        }, 1000);
    }

    async executeTest(testConfig) {
        // Test execution logic would go here
        console.log(`Executing test: ${testConfig.type}`);
    }

    stopAllTests() {
        for (const [testId, test] of this.activeTests) {
            if (test.intervalId) {
                clearInterval(test.intervalId);
            }
        }
        this.activeTests.clear();
    }
}

module.exports = TestingEngine;
