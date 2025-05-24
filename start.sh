#!/bin/bash

# Mobile Carrier Testing Framework - Quick Start Script

echo "🚀 Mobile Carrier Testing Framework - Quick Start"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Run setup
echo ""
echo "⚙️  Setting up the framework..."
npm run setup

if [ $? -ne 0 ]; then
    echo "❌ Setup failed"
    exit 1
fi

echo "✅ Setup completed successfully"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env configuration file"
    echo "⚠️  Please edit .env file with your configuration before starting"
fi

echo ""
echo "🎉 Mobile Carrier Testing Framework is ready!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration (optional)"
echo "2. Start the server:"
echo "   npm start"
echo ""
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "For development with auto-reload:"
echo "   npm run dev"
echo ""
echo "📚 Documentation: README.md"
echo "🐛 Issues: Create an issue on GitHub"
echo ""
echo "Happy testing! 🧪"
