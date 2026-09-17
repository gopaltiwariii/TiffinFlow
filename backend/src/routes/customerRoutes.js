const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { calculateBillForMonth } = require('../services/billingService');
const { assertValidDate, normalizePhone, validatePhone } = require('../utils/validation');

const router = express.Router();
const ALLOWED_SORT_FIELDS = new Set(['name', 'phone', 'monthly_plan_price', 'subscription_start_date', 'status', 'created_at']);

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getCustomerStatus(customerId) {
  const today = new Date().toISOString().slice(0, 10);
  const activePause = db.prepare(
    `SELECT * FROM pause_periods
     WHERE customer_id = ? AND start_date <= ? AND end_date >= ?
     ORDER BY start_date ASC LIMIT 1`,
  ).get(customerId, today, today);

  return activePause ? 'PAUSED' : 'ACTIVE';
}

function overlaps(startA, endA, startB, endB) {
  return !(endA < startB || endB < startA);
}

function serializeCustomer(customer, pausePeriods = []) {
  return {
    ...customer,
    status: getCustomerStatus(customer.id),
    pause_history: pausePeriods,
  };
}

router.use(authMiddleware);

router.get('/', (req, res) => {
  const search = String(req.query.search || '').trim();
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const sort = String(req.query.sort || 'created_at');
  const order = String(req.query.order || 'desc');

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;
  const sortField = ALLOWED_SORT_FIELDS.has(sort) ? sort : 'created_at';
  const sortDirection = order === 'asc' ? 'ASC' : 'DESC';

  let query = 'SELECT * FROM customers';
  const params = [];

  if (search) {
    query += ' WHERE name LIKE ? OR phone LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  const totalResult = db.prepare(`SELECT COUNT(*) AS total FROM customers${search ? ' WHERE name LIKE ? OR phone LIKE ?' : ''}`).get(...(search ? [`%${search}%`, `%${search}%`] : []));
  const total = Number(totalResult?.total || 0);

  const statusRows = db.prepare(
    `SELECT status, COUNT(*) AS count FROM customers${search ? ' WHERE name LIKE ? OR phone LIKE ?' : ''} GROUP BY status`,
  ).all(...(search ? [`%${search}%`, `%${search}%`] : []));

  const statusCounts = { total, active: 0, paused: 0 };
  for (const row of statusRows) {
    const normalizedStatus = String(row.status || '').toLowerCase();
    if (normalizedStatus === 'active' || normalizedStatus === 'paused') {
      statusCounts[normalizedStatus] = Number(row.count || 0);
    }
  }

  query += ` ORDER BY ${sortField} ${sortDirection} LIMIT ? OFFSET ?`;
  const rows = db.prepare(query).all(...params, safeLimit, (safePage - 1) * safeLimit);

  const data = rows.map((customer) => ({
    ...customer,
    status: getCustomerStatus(customer.id),
  }));

  res.json({
    data,
    statusCounts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  });
});

router.post('/', (req, res, next) => {
  try {
    const { name, phone, monthlyPlanPrice, subscriptionStartDate } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const cleanPhone = normalizePhone(phone);
    if (!validatePhone(cleanPhone)) {
      return res.status(400).json({ error: 'Phone number must be valid and contain 10-15 digits' });
    }

    const planPrice = Number(monthlyPlanPrice);
    if (!Number.isFinite(planPrice) || planPrice <= 0) {
      return res.status(400).json({ error: 'Monthly plan price must be a positive number' });
    }

    assertValidDate(subscriptionStartDate, 'Subscription start date');

    const existingCustomer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(cleanPhone);
    if (existingCustomer) {
      return res.status(409).json({ error: 'Customer with this phone number already exists' });
    }

    const result = db.prepare(
      `INSERT INTO customers (name, phone, monthly_plan_price, subscription_start_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'))`,
    ).run(String(name).trim(), cleanPhone, Math.round(planPrice), subscriptionStartDate);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(serializeCustomer(customer, []));
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Customer ID is invalid' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const pausePeriods = db.prepare(
      'SELECT * FROM pause_periods WHERE customer_id = ? ORDER BY start_date DESC, end_date DESC',
    ).all(customerId);

    return res.json(serializeCustomer(customer, pausePeriods));
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/pause', (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Customer ID is invalid' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { startDate, endDate, reason } = req.body || {};
    assertValidDate(startDate, 'Pause start date');
    assertValidDate(endDate, 'Pause end date');

    if (startDate > endDate) {
      return res.status(400).json({ error: 'Pause end date cannot be before the start date' });
    }

    const overlapsExisting = db.prepare('SELECT * FROM pause_periods WHERE customer_id = ?').all(customerId);
    const conflict = overlapsExisting.some((entry) => overlaps(startDate, endDate, entry.start_date, entry.end_date));
    if (conflict) {
      return res.status(409).json({ error: 'Pause period overlaps with an existing pause' });
    }

    const result = db.prepare(
      'INSERT INTO pause_periods (customer_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)',
    ).run(customerId, startDate, endDate, reason ? String(reason).trim() : null);

    const pause = db.prepare('SELECT * FROM pause_periods WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(pause);
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/resume', (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Customer ID is invalid' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const resumeDate = req.body && typeof req.body.resumeDate !== 'undefined' ? String(req.body.resumeDate).trim() : today;
    assertValidDate(resumeDate, 'Resume date');

    const activePause = db.prepare(
      'SELECT * FROM pause_periods WHERE customer_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date ASC LIMIT 1',
    ).get(customerId, resumeDate, resumeDate);

    if (activePause) {
      if (resumeDate <= activePause.start_date) {
        return res.status(400).json({ error: 'Resume date must be after the pause start date' });
      }

      const truncatedEndDate = addDays(resumeDate, -1);
      const updated = db.prepare(
        'UPDATE pause_periods SET end_date = ? WHERE id = ? AND customer_id = ?',
      ).run(truncatedEndDate, activePause.id, customerId);

      const pause = db.prepare('SELECT * FROM pause_periods WHERE id = ?').get(activePause.id);
      return res.json({
        updated: updated.changes > 0,
        pause,
        status: getCustomerStatus(customerId),
      });
    }

    const immediateAfterPause = db.prepare(
      'SELECT * FROM pause_periods WHERE customer_id = ? AND end_date = ? ORDER BY start_date DESC LIMIT 1',
    ).get(customerId, addDays(resumeDate, -1));

    if (immediateAfterPause) {
      return res.json({
        updated: false,
        pause: immediateAfterPause,
        status: getCustomerStatus(customerId),
        message: 'Resume date is immediately after the pause end; the pause remains unchanged.',
      });
    }

    const pauseBeforeResume = db.prepare(
      'SELECT * FROM pause_periods WHERE customer_id = ? AND start_date >= ? ORDER BY start_date ASC LIMIT 1',
    ).get(customerId, resumeDate);

    if (pauseBeforeResume) {
      return res.status(400).json({ error: 'Resume date must be inside the active pause period or the day immediately after the pause end' });
    }

    return res.status(409).json({ error: 'No active pause period found to resume' });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/status', (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Customer ID is invalid' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const pausePeriods = db.prepare('SELECT * FROM pause_periods WHERE customer_id = ? ORDER BY start_date DESC').all(customerId);
    const status = getCustomerStatus(customerId);

    return res.json({
      customerId: customer.id,
      status,
      pausePeriods,
      subscriptionStartDate: customer.subscription_start_date,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/bill', (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Customer ID is invalid' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const pausePeriods = db.prepare('SELECT * FROM pause_periods WHERE customer_id = ? ORDER BY start_date ASC').all(customerId);
    const bill = calculateBillForMonth({
      monthlyPlanPrice: customer.monthly_plan_price,
      subscriptionStartDate: customer.subscription_start_date,
      pausePeriods,
      month,
    });

    return res.json({
      customerId: customer.id,
      month,
      ...bill,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
