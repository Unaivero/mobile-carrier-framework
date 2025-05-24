const fs = require('fs');
const path = require('path');

async function setup() {
    console.log('🚀 Setting up Mobile Carrier Testing Framework...\n');

    try {
        // Create required directories
        const directories = [
            'data',
            'data/logs',
            'data/exports',
            'data/backups'
        ];

        console.log('📁 Creating directories...');
        for (const dir of directories) {
            const dirPath = path.join(__dirname, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`   ✓ Created ${dir}`);
            } else {
                console.log(`   • ${dir} already exists`);
            }
        }

        // Copy .env.example to .env if it doesn't exist
        const envPath = path.join(__dirname, '.env');
        const envExamplePath = path.join(__dirname, '.env.example');
        
        if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
            fs.copyFileSync(envExamplePath, envPath);
            console.log('   ✓ Created .env file from template');
        }

        // Initialize database
        console.log('\n💾 Initializing database...');
        const DatabaseService = require('./services/database');
        const dbService = new DatabaseService();
        await dbService.initialize();
        console.log('   ✓ Database initialized successfully');

        // Add sample data
        console.log('\n📊 Adding sample configuration...');
        
        // Sample carriers
        const sampleCarriers = [
            {
                id: 'verizon',
                name: 'Verizon',
                apiEndpoint: 'https://api.verizon.com/v1',
                features: ['5G UW', 'Visual Voicemail', 'HD Voice']
            },
            {
                id: 'att',
                name: 'AT&T',
                apiEndpoint: 'https://api.att.com/v1',
                features: ['5G+', 'HD Voice', 'WiFi Calling']
            },
            {
                id: 'tmobile',
                name: 'T-Mobile',
                apiEndpoint: 'https://api.t-mobile.com/v1',
                features: ['5G UC', 'Digits', 'WiFi Calling']
            }
        ];

        for (const carrier of sampleCarriers) {
            await dbService.saveCarrier(carrier);
        }
        console.log('   ✓ Sample carriers added');

        // Sample settings
        const defaultSettings = {
            defaultTimeout: 60,
            retryAttempts: 3,
            parallelLimit: 5,
            autoSchedule: 'disabled',
            notificationEmail: '',
            webhookUrl: '',
            dataRetentionDays: 30
        };

        for (const [key, value] of Object.entries(defaultSettings)) {
            await dbService.saveSetting(key, value);
        }
        console.log('   ✓ Default settings configured');

        await dbService.close();

        console.log('\n✨ Setup completed successfully!\n');
        console.log('Next steps:');
        console.log('1. Edit .env file with your configuration');
        console.log('2. Run "npm start" to start the server');
        console.log('3. Open http://localhost:3000 in your browser');
        console.log('4. Check the README.md for detailed documentation\n');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Run setup if this file is executed directly
if (require.main === module) {
    setup();
}

module.exports = setup;
