const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { validateEmail, validatePassword } = require('../utils/validation');

const router = express.Router();

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
  };
}

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ).run(String(name).trim(), email.trim().toLowerCase(), passwordHash);

    const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = createToken({ userId: user.id, email: user.email });

    return res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createToken({ userId: user.id, email: user.email });
    return res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
