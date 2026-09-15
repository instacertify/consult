const crypto = require('crypto');
const { getSetting, setSetting } = require('../db');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function envDefaults() {
  return {
    username: String(process.env.ADMIN_USERNAME || 'admin').trim() || 'admin',
    password: String(process.env.ADMIN_PASSWORD || 'change-me-admin'),
  };
}

function getStoredAuth() {
  const stored = getSetting('admin_auth', null);
  if (!stored || typeof stored !== 'object') return null;
  if (!stored.username || !stored.passwordHash || !stored.salt) return null;
  return stored;
}

function getAdminUsername() {
  const stored = getStoredAuth();
  if (stored) return String(stored.username);
  return envDefaults().username;
}

function hashPassword(password, saltBuf) {
  return crypto.scryptSync(String(password), saltBuf, 64, SCRYPT_PARAMS);
}

function verifyPassword(password, saltB64, hashB64) {
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = hashPassword(password, salt);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function verifyAdminLogin(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '');
  const stored = getStoredAuth();

  if (stored) {
    const userOk = user.toLowerCase() === String(stored.username).toLowerCase();
    const passOk = verifyPassword(pass, stored.salt, stored.passwordHash);
    return userOk && passOk;
  }

  const env = envDefaults();
  const userOk = user.toLowerCase() === env.username.toLowerCase();
  // Env passwords are plain text (bootstrap only)
  const passOk = pass === env.password;
  return userOk && passOk;
}

function verifyCurrentPassword(password) {
  const stored = getStoredAuth();
  if (stored) {
    return verifyPassword(password, stored.salt, stored.passwordHash);
  }
  return String(password || '') === envDefaults().password;
}

/**
 * Update login ID and/or password. Requires current password.
 * Empty newPassword keeps the existing password (re-hashes if moving from env → DB).
 */
function updateAdminCredentials({
  currentPassword,
  newUsername,
  newPassword,
  confirmPassword,
} = {}) {
  if (!verifyCurrentPassword(currentPassword)) {
    return { ok: false, error: 'current' };
  }

  const username = String(newUsername || '').trim();
  if (!username || username.length < 3) {
    return { ok: false, error: 'username' };
  }
  if (!/^[a-zA-Z0-9._@-]+$/.test(username)) {
    return { ok: false, error: 'username-chars' };
  }

  let passwordToStore = String(newPassword || '');
  if (passwordToStore) {
    if (passwordToStore.length < 8) {
      return { ok: false, error: 'password-short' };
    }
    if (passwordToStore !== String(confirmPassword || '')) {
      return { ok: false, error: 'password-mismatch' };
    }
  } else {
    // Keep existing password
    const stored = getStoredAuth();
    if (stored) {
      setSetting('admin_auth', { ...stored, username });
      return { ok: true, username };
    }
    passwordToStore = envDefaults().password;
  }

  const salt = crypto.randomBytes(16);
  const hash = hashPassword(passwordToStore, salt);
  setSetting('admin_auth', {
    username,
    salt: salt.toString('base64'),
    passwordHash: hash.toString('base64'),
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, username };
}

module.exports = {
  getAdminUsername,
  verifyAdminLogin,
  verifyCurrentPassword,
  updateAdminCredentials,
};
