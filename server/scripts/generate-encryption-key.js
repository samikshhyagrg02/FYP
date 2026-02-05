#!/usr/bin/env node

/**
 * Generate a secure encryption key for journal entries
 * Run: node server/scripts/generate-encryption-key.js
 */

const crypto = require('crypto');

// Generate a 32-byte (256-bit) key and convert to hex (64 characters)
const key = crypto.randomBytes(32).toString('hex');

console.log('\n==============================================');
console.log('🔐 Journal Encryption Key Generated');
console.log('==============================================\n');
console.log('Add this to your server/.env file:\n');
console.log(`JOURNAL_ENCRYPTION_KEY=${key}\n`);
console.log('⚠️  IMPORTANT:');
console.log('- Keep this key secret and secure');
console.log('- Never commit it to version control');
console.log('- Losing this key means losing access to encrypted data');
console.log('- Use the same key across all environments for the same database');
console.log('\n==============================================\n');
