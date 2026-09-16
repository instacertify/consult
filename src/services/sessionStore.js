const session = require('express-session');
const { getDb } = require('../db');

/**
 * Persistent express-session store backed by the app SQLite DB.
 * MemoryStore loses logins on restart / multi-instance deploys.
 */
class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);
    `);
    this._get = db.prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?');
    this._set = db.prepare(
      `INSERT INTO sessions (sid, sess, expired_at) VALUES (@sid, @sess, @expired_at)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at`
    );
    this._destroy = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this._touch = db.prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?');
    this._purge = db.prepare('DELETE FROM sessions WHERE expired_at <= ?');

    // Opportunistic cleanup
    try {
      this._purge.run(Date.now());
    } catch {
      /* ignore */
    }
  }

  get(sid, cb) {
    try {
      const row = this._get.get(sid);
      if (!row) return cb(null, null);
      if (Number(row.expired_at) <= Date.now()) {
        this._destroy.run(sid);
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.sess));
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      let expiredAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      if (sess && sess.cookie && sess.cookie.expires) {
        expiredAt = new Date(sess.cookie.expires).getTime();
      } else if (sess && sess.cookie && typeof sess.cookie.maxAge === 'number') {
        expiredAt = Date.now() + Number(sess.cookie.maxAge);
      }
      this._set.run({
        sid,
        sess: JSON.stringify(sess),
        expired_at: expiredAt,
      });
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this._destroy.run(sid);
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      let expiredAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      if (sess && sess.cookie && sess.cookie.expires) {
        expiredAt = new Date(sess.cookie.expires).getTime();
      } else if (sess && sess.cookie && typeof sess.cookie.maxAge === 'number') {
        expiredAt = Date.now() + Number(sess.cookie.maxAge);
      }
      this._touch.run(expiredAt, sid);
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
