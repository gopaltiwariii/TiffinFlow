function parseISODate(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error('Date value is required');
  }

  const match = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  if (!match) {
    throw new Error('Invalid date format; use YYYY-MM-DD');
  }

  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  return date;
}

function toISODate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekday(dateValue) {
  const date = parseISODate(dateValue);
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function getMonthBounds(monthString) {
  const [year, month] = String(monthString).split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error('Invalid month format; use YYYY-MM');
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

function getWeekdayDatesInRange(startDate, endDate) {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (start > end) {
    return [];
  }

  const results = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const iso = toISODate(cursor);
    if (isWeekday(iso)) {
      results.push(iso);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}

function getWeekdayCountForMonth(startDate, endDate) {
  if (!startDate || !endDate) {
    return 0;
  }

  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (start > end) {
    return 0;
  }

  return getWeekdayDatesInRange(toISODate(start), toISODate(end)).length;
}

function normalizePausePeriods(pausePeriods) {
  if (!Array.isArray(pausePeriods)) {
    return [];
  }

  return pausePeriods
    .filter(Boolean)
    .map((period) => {
      const startDate = String(period.startDate ?? period.start_date ?? '').trim();
      const endDate = String(period.endDate ?? period.end_date ?? '').trim();

      if (!startDate || !endDate) {
        throw new Error('Pause start and end dates are required');
      }

      const start = parseISODate(startDate);
      const end = parseISODate(endDate);

      if (start > end) {
        throw new Error('Invalid pause range: end date cannot be before start date');
      }

      return {
        startDate: toISODate(start),
        endDate: toISODate(end),
      };
    });
}

function getPauseWeekdaysForMonth(monthStart, monthEnd, pausePeriods) {
  const normalized = normalizePausePeriods(pausePeriods);
  const uniqueDates = new Set();

  for (const period of normalized) {
    const rangeStart = new Date(Math.max(parseISODate(monthStart).getTime(), parseISODate(period.startDate).getTime()));
    const rangeEnd = new Date(Math.min(parseISODate(monthEnd).getTime(), parseISODate(period.endDate).getTime()));

    if (rangeStart > rangeEnd) {
      continue;
    }

    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const iso = toISODate(cursor);
      if (isWeekday(iso)) {
        uniqueDates.add(iso);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return uniqueDates.size;
}

function calculateBillForMonth({ monthlyPlanPrice, subscriptionStartDate, pausePeriods, month }) {
  const price = Number(monthlyPlanPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Monthly plan price must be a positive number');
  }

  if (!subscriptionStartDate) {
    throw new Error('Subscription start date is required');
  }

  const subscriptionDate = parseISODate(subscriptionStartDate);
  const monthBounds = getMonthBounds(month);
  const monthStart = toISODate(monthBounds.start);
  const monthEnd = toISODate(monthBounds.end);
  const billableStart = toISODate(
    new Date(Math.max(subscriptionDate.getTime(), monthBounds.start.getTime())),
  );

  const totalWeekdays = getWeekdayCountForMonth(billableStart, monthEnd);
  const pausedWeekdays = getPauseWeekdaysForMonth(billableStart, monthEnd, pausePeriods);
  const deliveredWeekdays = Math.max(0, totalWeekdays - pausedWeekdays);

  if (totalWeekdays === 0) {
    return {
      month,
      totalWeekdays: 0,
      pausedWeekdays: 0,
      deliveredWeekdays: 0,
      dailyRateCents: 0,
      finalBillCents: 0,
      finalBillDisplay: '₹0.00',
    };
  }

  const monthlyPriceCents = Math.round(price * 100);
  const finalBillCents = Math.floor((monthlyPriceCents * deliveredWeekdays) / totalWeekdays);

  return {
    month,
    totalWeekdays,
    pausedWeekdays,
    deliveredWeekdays,
    dailyRateCents: Math.floor(monthlyPriceCents / totalWeekdays),
    finalBillCents,
    finalBillDisplay: `₹${(finalBillCents / 100).toFixed(2)}`,
  };
}

module.exports = {
  parseISODate,
  toISODate,
  isWeekday,
  getMonthBounds,
  getWeekdayDatesInRange,
  getWeekdayCountForMonth,
  getPauseWeekdaysForMonth,
  normalizePausePeriods,
  calculateBillForMonth,
};
