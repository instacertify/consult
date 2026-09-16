const crypto = require('crypto');
const { getSetting, setSetting } = require('../db');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function envDefaults() {
  return {
    username: String(process.env.ADMIN_USERNAME || 'admin').trim() || 'admin',
    // Default matches .env.example — production must set ADMIN_PASSWORD
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

function persistCredentials(username, password) {
  const salt = crypto.randomBytes(16);
  const hash = hashPassword(password, salt);
  setSetting('admin_auth', {
    username: String(username).trim(),
    salt: salt.toString('base64'),
    passwordHash: hash.toString('base64'),
    updatedAt: new Date().toISOString(),
    source: 'env',
  });
}

/**
 * Keep DB login hash aligned with ADMIN_USERNAME / ADMIN_PASSWORD.
 * Call on boot so host env credentials always work after deploy.
 */
function syncAdminAuthFromEnv({ force = false } = {}) {
  const env = envDefaults();
  const hasExplicitPassword = Object.prototype.hasOwnProperty.call(
    process.env,
    'ADMIN_PASSWORD'
  );
  const stored = getStoredAuth();

  // Force reset via env flag (ops recovery)
  if (process.env.ADMIN_RESET_CREDENTIALS === '1' || force) {
    persistCredentials(env.username, env.password);
    console.log(
      'Admin credentials reset from env for user:',
      env.username
    );
    return { synced: true, reason: 'reset' };
  }

  // No DB auth yet — seed from env so first login is stable across restarts
  if (!stored) {
    persistCredentials(env.username, env.password);
    console.log('Admin credentials initialized from env for user:', env.username);
    return { synced: true, reason: 'init' };
  }

  // If host explicitly set ADMIN_PASSWORD, keep DB hash in sync with it.
  // This fixes "incorrect password" after deploys when env and DB diverged.
  if (hasExplicitPassword) {
    const userOk =
      String(stored.username).toLowerCase() === env.username.toLowerCase();
    const passOk = verifyPassword(env.password, stored.salt, stored.passwordHash);
    if (!userOk || !passOk) {
      persistCredentials(env.username, env.password);
      console.log(
        'Admin credentials synced from ADMIN_PASSWORD env for user:',
        env.username
      );
      return { synced: true, reason: 'env-sync' };
    }
  }

  return { synced: false, reason: 'ok', username: stored.username };
}

function verifyAdminLogin(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '');
  if (!user || !pass) return false;

  const stored = getStoredAuth();
  if (stored) {
    const userOk = user.toLowerCase() === String(stored.username).toLowerCase();
    const passOk = verifyPassword(pass, stored.salt, stored.passwordHash);
    if (userOk && passOk) return true;
  }

  // Env fallback — recovers when DB hash drifted from hosting env
  const env = envDefaults();
  const userOk = user.toLowerCase() === env.username.toLowerCase();
  const passOk = pass === env.password;
  if (userOk && passOk) {
    try {
      persistCredentials(env.username, env.password);
    } catch (err) {
      console.warn('admin auth sync after env login:', err.message);
    }
    return true;
  }

  return false;
}

function verifyCurrentPassword(password) {
  const pass = String(password || '');
  const stored = getStoredAuth();
  if (stored && verifyPassword(pass, stored.salt, stored.passwordHash)) {
    return true;
  }
  return pass === envDefaults().password;
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
      setSetting('admin_auth', {
        ...stored,
        username,
        source: 'ui',
        updatedAt: new Date().toISOString(),
      });
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
    source: 'ui',
  });
  return { ok: true, username };
}

module.exports = {
  getAdminUsername,
  verifyAdminLogin,
  verifyCurrentPassword,
  updateAdminCredentials,
  syncAdminAuthFromEnv,
  envDefaults,
};
