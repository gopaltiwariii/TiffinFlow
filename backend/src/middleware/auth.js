const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => {
  throw new Error('JWT_SECRET must be set in the environment for production runs');
})() : 'dev-local-secret-change-me');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
