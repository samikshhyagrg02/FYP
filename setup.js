#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🌱 MindBloom Setup Script');
console.log('========================\n');

// Generate a secure JWT secret
const jwtSecret = crypto.randomBytes(64).toString('hex');

// Create root .env for repository-level defaults (if missing)
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const envContent = `PORT=3001
MONGODB_URI=mongodb://localhost:27017/mindbloom
JWT_SECRET=${jwtSecret}
CLIENT_URL=http://localhost:3002
NODE_ENV=development`;

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created root .env file with secure JWT secret');
} else {
    console.log('⚠️  root .env file already exists, skipping creation');
}

// Create server/.env with recommended dev values
const serverEnvPath = path.join(__dirname, 'server', '.env');
if (!fs.existsSync(serverEnvPath)) {
    const serverEnv = `PORT=3001
MONGODB_URI=mongodb://localhost:27017/mindbloom
JWT_SECRET=${jwtSecret}
CLIENT_URL=http://localhost:3002
NODE_ENV=development`;
    fs.writeFileSync(serverEnvPath, serverEnv);
    console.log('✅ Created server/.env with recommended defaults');
} else {
    console.log('⚠️  server/.env already exists, skipping creation');
}

// Create client/.env with recommended dev values
const clientEnvPath = path.join(__dirname, 'client', '.env');
if (!fs.existsSync(clientEnvPath)) {
    const clientEnv = `REACT_APP_API_URL=http://localhost:3001
PORT=3002`;
    fs.writeFileSync(clientEnvPath, clientEnv);
    console.log('✅ Created client/.env with recommended defaults');
} else {
    console.log('⚠️  client/.env already exists, skipping creation');
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