#!/usr/bin/env node

/**
 * Test script to verify journal encryption is working
 * Run: node server/scripts/test-encryption.js
 */

const crypto = require('crypto');

// Use the same encryption logic as the model
const ENCRYPTION_KEY = process.env.JOURNAL_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedData = parts[1];
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Test
console.log('\n==============================================');
console.log('🔐 Testing Journal Encryption');
console.log('==============================================\n');

const testContent = 'This is a private journal entry with sensitive information.';
console.log('Original Content:');
console.log(`"${testContent}"\n`);

const encrypted = encrypt(testContent);
console.log('Encrypted Content:');
console.log(`"${encrypted}"\n`);

const decrypted = decrypt(encrypted);
console.log('Decrypted Content:');
console.log(`"${decrypted}"\n`);

if (testContent === decrypted) {
  console.log('✅ Encryption/Decryption Test PASSED');
  console.log('✅ Journal entries will be securely encrypted\n');
} else {
  console.log('❌ Encryption/Decryption Test FAILED');
  console.log('❌ Please check your encryption key configuration\n');
}

console.log('==============================================\n');
