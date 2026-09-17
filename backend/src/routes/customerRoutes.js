const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { calculateBillForMonth, getMonthBounds, parseISODate, toISODate } = require('../services/billingService');
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

function getTransferRecordsForCustomer(customerId) {
  return db.prepare(
    `SELECT * FROM subscription_transfers
     WHERE old_customer_id = ? OR new_customer_id = ?
     ORDER BY effective_date ASC`,
  ).all(customerId, customerId);
}

function normalizeTransferEffectiveDate(rawDate) {
  assertValidDate(rawDate, 'Transfer effective date');
  const date = new Date(`${rawDate}T00:00:00Z`);
  const weekday = date.getUTCDay();

  if (weekday === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  if (weekday === 6) {
    date.setUTCDate(date.getUTCDate() + 2);
  }

  return toISODate(date);
}

function getCustomerServiceWindow(customerId, month) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    return { startDate: null, endDate: null };
  }

  const monthBounds = getMonthBounds(month);
  const monthStart = toISODate(monthBounds.start);
  const monthEnd = toISODate(monthBounds.end);

  let serviceStart = customer.subscription_start_date;
  let serviceEnd = monthEnd;

  const transfers = getTransferRecordsForCustomer(customerId);

  for (const transfer of transfers) {
    const effectiveDate = String(transfer.effective_date || '').trim();
    if (!effectiveDate) {
      continue;
    }

    if (transfer.old_customer_id === customerId) {
      const boundaryDate = addDays(effectiveDate, -1);
      if (boundaryDate >= monthStart) {
        serviceEnd = boundaryDate < serviceEnd ? boundaryDate : serviceEnd;
      }
    }

    if (transfer.new_customer_id === customerId) {
      if (effectiveDate >= monthStart) {
        serviceStart = effectiveDate > serviceStart ? effectiveDate : serviceStart;
      }
    }
  }

  const start = serviceStart > monthStart ? serviceStart : monthStart;
  const end = serviceEnd < monthEnd ? serviceEnd : monthEnd;
  if (parseISODate(start) > parseISODate(end)) {
    return { startDate: null, endDate: null };
  }

  return { startDate: start, endDate: end };
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.replace(/\r$/, '').trim());
}

function normalizeImportDate(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) {
    throw new Error('Date is required');
  }

  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (isoPattern.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return toISODate(date);
  }

  const slashPattern = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
  const match = value.match(slashPattern);
  if (!match) {
    throw new Error(`Unsupported date format: ${value}`);
  }

  const [, first, second, yearValue] = match;
  const year = Number(yearValue.length === 2 ? `20${yearValue}` : yearValue);
  const firstNumber = Number(first);
  const secondNumber = Number(second);

  if (firstNumber > 12 && secondNumber <= 12) {
    const day = firstNumber;
    const month = secondNumber;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`Invalid date: ${value}`);
    }
    return toISODate(date);
  }

  if (secondNumber > 12 && firstNumber <= 12) {
    const day = secondNumber;
    const month = firstNumber;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`Invalid date: ${value}`);
    }
    return toISODate(date);
  }

  if (firstNumber <= 12 && secondNumber <= 12) {
    const day = firstNumber;
    const month = secondNumber;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`Invalid date: ${value}`);
    }
    return toISODate(date);
  }

  throw new Error(`Unsupported date format: ${value}`);
}

function parseCsvImport(csvText) {
  if (!csvText || !String(csvText).trim()) {
    throw new Error('CSV file is empty');
  }

  const rows = String(csvText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    throw new Error('CSV file must include a header row and at least one data row');
  }

  const header = parseCsvLine(rows[0]);
  const headerKeys = header.map((cell) => String(cell).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));

  const requiredHeaders = {
    name: ['name'],
    phone: ['phone'],
    monthlyPlanPrice: ['monthlyplanprice', 'monthly_plan_price', 'monthlyplan', 'planprice'],
    subscriptionStartDate: ['subscriptionstartdate', 'subscription_start_date', 'startdate'],
  };

  const indexes = {};
  for (const [key, aliases] of Object.entries(requiredHeaders)) {
    const index = headerKeys.findIndex((headerKey) => aliases.includes(headerKey));
    if (index === -1) {
      throw new Error(`CSV is missing required column: ${key}`);
    }
    indexes[key] = index;
  }

  const details = [];
  const validRows = [];
  const seenPhones = new Set();
  let dedupedCount = 0;
  let rejectedCount = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = parseCsvLine(rows[rowIndex]);
    const record = {
      name: row[indexes.name] ?? '',
      phone: row[indexes.phone] ?? '',
      monthlyPlanPrice: row[indexes.monthlyPlanPrice] ?? '',
      subscriptionStartDate: row[indexes.subscriptionStartDate] ?? '',
    };

    if (!Object.values(record).some((value) => String(value).trim().length > 0)) {
      continue;
    }

    const normalizedPhone = normalizePhone(record.phone);
    const trimmedName = String(record.name || '').trim();
    const planValue = Number(record.monthlyPlanPrice);

    if (!trimmedName) {
      rejectedCount += 1;
      details.push({ rowNumber: rowIndex + 1, status: 'REJECTED', reason: 'Name is required', ...record });
      continue;
    }

    if (!validatePhone(normalizedPhone)) {
      rejectedCount += 1;
      details.push({ rowNumber: rowIndex + 1, status: 'REJECTED', reason: 'Phone number is invalid', ...record });
      continue;
    }

    if (!Number.isFinite(planValue) || planValue <= 0) {
      rejectedCount += 1;
      details.push({ rowNumber: rowIndex + 1, status: 'REJECTED', reason: 'Monthly plan price must be positive', ...record });
      continue;
    }

    let normalizedStartDate;
    try {
      normalizedStartDate = normalizeImportDate(record.subscriptionStartDate);
    } catch (error) {
      rejectedCount += 1;
      details.push({ rowNumber: rowIndex + 1, status: 'REJECTED', reason: error.message || 'Invalid subscription date', ...record });
      continue;
    }

    if (seenPhones.has(normalizedPhone)) {
      dedupedCount += 1;
      details.push({ rowNumber: rowIndex + 1, status: 'DEDUPED', reason: 'Duplicate phone number within the import file', ...record, phone: normalizedPhone });
      continue;
    }

    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(normalizedPhone);
    if (existing) {
      rejectedCount += 1;
      details.push({ rowNumber: rowIndex + 1, status: 'REJECTED', reason: 'Phone number already exists in the database', ...record, phone: normalizedPhone });
      continue;
    }

    seenPhones.add(normalizedPhone);
    validRows.push({
      name: trimmedName,
      phone: normalizedPhone,
      monthlyPlanPrice: Math.round(planValue),
      subscriptionStartDate: normalizedStartDate,
    });
    details.push({ rowNumber: rowIndex + 1, status: 'IMPORTED', reason: 'Valid customer record', ...validRows[validRows.length - 1] });
  }

  const transaction = db.transaction(() => {
    for (const row of validRows) {
      db.prepare(
        `INSERT INTO customers (name, phone, monthly_plan_price, subscription_start_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'))`,
      ).run(row.name, row.phone, row.monthlyPlanPrice, row.subscriptionStartDate);
    }
  });

  transaction();

  return {
    imported: validRows.length,
    deduped: dedupedCount,
    rejected: rejectedCount,
    details,
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

router.post('/import', express.text({ type: ['text/csv', 'application/csv'], limit: '1mb' }), (req, res, next) => {
  try {
    const csvText = typeof req.body === 'string' ? req.body : '';
    const result = parseCsvImport(csvText);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
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

router.get('/:id/transfers', (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Customer ID is invalid' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const transfers = db.prepare(
      `SELECT t.*, o.name AS old_customer_name, n.name AS new_customer_name
       FROM subscription_transfers t
       LEFT JOIN customers o ON o.id = t.old_customer_id
       LEFT JOIN customers n ON n.id = t.new_customer_id
       WHERE t.old_customer_id = ? OR t.new_customer_id = ?
       ORDER BY t.effective_date DESC`,
    ).all(customerId, customerId);

    return res.json(transfers);
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/transfer', (req, res, next) => {
  try {
    const sourceCustomerId = Number(req.params.id);
    const targetCustomerId = Number(req.body && req.body.newCustomerId);
    const effectiveDate = req.body && req.body.effectiveDate ? String(req.body.effectiveDate).trim() : null;

    if (!Number.isInteger(sourceCustomerId) || sourceCustomerId <= 0) {
      return res.status(400).json({ error: 'Source customer ID is invalid' });
    }

    if (!Number.isInteger(targetCustomerId) || targetCustomerId <= 0) {
      return res.status(400).json({ error: 'Destination customer ID is invalid' });
    }

    if (sourceCustomerId === targetCustomerId) {
      return res.status(400).json({ error: 'A subscription cannot be transferred to the same customer' });
    }

    const sourceCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(sourceCustomerId);
    const targetCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(targetCustomerId);

    if (!sourceCustomer) {
      return res.status(404).json({ error: 'Source customer not found' });
    }

    if (!targetCustomer) {
      return res.status(404).json({ error: 'Destination customer not found' });
    }

    const nextEffectiveDate = normalizeTransferEffectiveDate(effectiveDate);
    if (sourceCustomer.subscription_start_date > nextEffectiveDate) {
      return res.status(400).json({ error: 'Transfer effective date cannot be before the source subscription start date' });
    }

    const cycleId = sourceCustomer.subscription_cycle_id || targetCustomer.subscription_cycle_id || `cycle-${Date.now()}-${sourceCustomerId}`;
    const duplicateTransfer = db.prepare(
      'SELECT id FROM subscription_transfers WHERE old_customer_id = ? AND new_customer_id = ? AND effective_date = ?',
    ).get(sourceCustomerId, targetCustomerId, nextEffectiveDate);

    if (duplicateTransfer) {
      return res.status(409).json({ error: 'This transfer has already been recorded' });
    }

    const transfer = db.transaction(() => {
      db.prepare(
        'UPDATE customers SET subscription_cycle_id = ? WHERE id = ?',
      ).run(cycleId, targetCustomerId);

      const insert = db.prepare(
        `INSERT INTO subscription_transfers (old_customer_id, new_customer_id, subscription_cycle_id, effective_date, transfer_reason, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      ).run(sourceCustomerId, targetCustomerId, cycleId, nextEffectiveDate, req.body && req.body.reason ? String(req.body.reason).trim() : null);

      return db.prepare(
        `SELECT t.*, o.name AS old_customer_name, n.name AS new_customer_name
         FROM subscription_transfers t
         LEFT JOIN customers o ON o.id = t.old_customer_id
         LEFT JOIN customers n ON n.id = t.new_customer_id
         WHERE t.id = ?`,
      ).get(insert.lastInsertRowid);
    })();

    return res.json(transfer);
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
    const { startDate, endDate } = getCustomerServiceWindow(customerId, month);
    const bill = calculateBillForMonth({
      monthlyPlanPrice: customer.monthly_plan_price,
      subscriptionStartDate: customer.subscription_start_date,
      pausePeriods,
      month,
      serviceStartDate: startDate,
      serviceEndDate: endDate,
    });

    return res.json({
      customerId: customer.id,
      month,
      service_window: { startDate, endDate },
      ...bill,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
