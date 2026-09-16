#!/usr/bin/env node
/**
 * Reset CMS admin login from ADMIN_USERNAME / ADMIN_PASSWORD env.
 * Usage: node scripts/reset-admin.js
 */
require('dotenv').config();
const { getDb } = require('../src/db');
const {
  syncAdminAuthFromEnv,
  getAdminUsername,
  envDefaults,
} = require('../src/services/adminAuth');

getDb();
process.env.ADMIN_RESET_CREDENTIALS = '1';
const result = syncAdminAuthFromEnv({ force: true });
const env = envDefaults();
console.log('Reset OK:', result);
console.log('Login ID:', getAdminUsername());
console.log(
  'Password: (value of ADMIN_PASSWORD in .env — default is change-me-admin if unset)'
);
console.log('Configured password length:', String(env.password).length);
