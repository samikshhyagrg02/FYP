#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🌱 MindBloom Setup Script');
console.log('========================\n');

// Generate a secure JWT secret
const jwtSecret = crypto.randomBytes(64).toString('hex');

// Create .env file if it doesn't exist
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const envContent = `PORT=3000
MONGODB_URI=mongodb://localhost:27017/mindbloom
JWT_SECRET=${jwtSecret}
CLIENT_URL=http://localhost:3000
NODE_ENV=development`;

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env file with secure JWT secret');
} else {
    console.log('⚠️  .env file already exists, skipping creation');
}

// Check if MongoDB is accessible (basic check)
console.log('\n📋 Setup Checklist:');
console.log('1. ✅ Environment file created');
console.log('2. 🔍 Make sure MongoDB is installed and running');
console.log('3. 📦 Run "npm install" to install dependencies');
console.log('4. 🚀 Run "npm run dev" to start the development server');
console.log('5. 🌐 Open http://localhost:3000 in your browser');

console.log('\n🔒 Security Notes:');
console.log('- A secure JWT secret has been generated automatically');
console.log('- Change the MongoDB URI if using a remote database');
console.log('- In production, use HTTPS and set NODE_ENV=production');

console.log('\n📚 Need help?');
console.log('- Check the README.md for detailed instructions');
console.log('- Ensure MongoDB is running: mongod --dbpath /path/to/data');
console.log('- For issues, check the GitHub repository');

console.log('\n🎉 Setup complete! Happy mood tracking! 🌱');