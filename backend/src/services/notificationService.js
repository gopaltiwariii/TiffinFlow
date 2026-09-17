const db = require('../config/db');
const { isWeekday } = require('./billingService');

class NotificationService {
  static isPausedOnDate(customerId, deliveryDate) {
    const activePause = db.prepare(
      `SELECT id FROM pause_periods
       WHERE customer_id = ? AND start_date <= ? AND end_date >= ?
       LIMIT 1`,
    ).get(customerId, deliveryDate, deliveryDate);

    return Boolean(activePause);
  }

  static findEligibleCustomersForDate(deliveryDate) {
    const customers = db.prepare(
      `SELECT * FROM customers WHERE subscription_start_date <= ? ORDER BY subscription_start_date ASC`,
    ).all(deliveryDate);

    return customers.filter((customer) => {
      if (!isWeekday(deliveryDate)) {
        return false;
      }

      return !NotificationService.isPausedOnDate(customer.id, deliveryDate);
    });
  }

  static recordDeliveryNotification({ customer, deliveryDate }) {
    const payload = {
      customer_id: Number(customer.id),
      customer_name: String(customer.name || '').trim(),
      phone: customer.phone,
      delivery_date: deliveryDate,
      channel: 'outbox',
    };

    const result = db.prepare(
      `INSERT OR IGNORE INTO notification_outbox (customer_id, delivery_date, channel, payload, status)
       VALUES (?, ?, 'outbox', ?, 'PENDING')`,
    ).run(customer.id, deliveryDate, JSON.stringify(payload));

    if (result.changes === 0) {
      return null;
    }

    return {
      id: Number(result.lastInsertRowid),
      customer_id: Number(customer.id),
      delivery_date: deliveryDate,
      channel: 'outbox',
      status: 'PENDING',
      payload,
      created_at: new Date().toISOString(),
    };
  }

  static listNotifications({ limit = 100, offset = 0 } = {}) {
    const rows = db.prepare(
      `SELECT * FROM notification_outbox ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset);

    return rows.map((row) => ({
      ...row,
      payload: JSON.parse(row.payload || '{}'),
    }));
  }
}

module.exports = { NotificationService };
