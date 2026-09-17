const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { NotificationService } = require('../services/notificationService');
const { isWeekday } = require('../services/billingService');
const { assertValidDate } = require('../utils/validation');

const router = express.Router();

router.post('/clock', authMiddleware, (req, res) => {
  try {
    const rawDate = req.body && typeof req.body.businessDate !== 'undefined'
      ? String(req.body.businessDate).trim()
      : new Date().toISOString().slice(0, 10);

    assertValidDate(rawDate, 'Business date');

    const customers = db.prepare(
      `SELECT * FROM customers WHERE subscription_start_date <= ? ORDER BY subscription_start_date ASC`,
    ).all(rawDate);

    const generated = [];
    let skipped = 0;

    for (const customer of customers) {
      if (!isWeekday(rawDate)) {
        skipped += 1;
        continue;
      }

      if (customer.subscription_start_date > rawDate) {
        skipped += 1;
        continue;
      }

      if (NotificationService.isPausedOnDate(customer.id, rawDate)) {
        skipped += 1;
        continue;
      }

      const notification = NotificationService.recordDeliveryNotification({
        customer,
        deliveryDate: rawDate,
      });

      if (notification) {
        generated.push(notification);
      } else {
        skipped += 1;
      }
    }

    return res.json({
      business_date: rawDate,
      generated: generated.length,
      skipped,
      total: NotificationService.listNotifications({ limit: 500 }).length,
      notifications: generated,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to process daily clock tick' });
  }
});

router.get('/outbox', authMiddleware, (req, res) => {
  try {
    const notifications = NotificationService.listNotifications({ limit: 200, offset: 0 });
    return res.json({
      total: notifications.length,
      data: notifications,
      notifications,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to load outbox' });
  }
});

module.exports = router;
