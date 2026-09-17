const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateBillForMonth, getWeekdayCountForMonth, getPauseWeekdaysForMonth } = require('../src/services/billingService');

test('TEST 1: ₹3000 monthly plan, 22 weekdays, no pauses => full bill', () => {
  const result = calculateBillForMonth({
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-01',
    pausePeriods: [],
    month: '2026-09',
  });

  assert.equal(result.totalWeekdays, 22);
  assert.equal(result.pausedWeekdays, 0);
  assert.equal(result.deliveredWeekdays, 22);
  assert.equal(result.finalBillCents, 300000);
});

test('TEST 2: ₹3000 monthly plan, 22 weekdays, 3 paused weekdays => prorated bill', () => {
  const result = calculateBillForMonth({
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-01',
    pausePeriods: [
      { startDate: '2026-09-10', endDate: '2026-09-14' },
    ],
    month: '2026-09',
  });

  assert.equal(result.totalWeekdays, 22);
  assert.equal(result.pausedWeekdays, 3);
  assert.equal(result.deliveredWeekdays, 19);
  assert.equal(result.finalBillCents, 259090); // 3000/22*19 => 2590.90
});

test('TEST 3: Pause Friday through Monday should only count Friday and Monday', () => {
  const result = calculateBillForMonth({
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-01',
    pausePeriods: [
      { startDate: '2026-09-11', endDate: '2026-09-14' },
    ],
    month: '2026-09',
  });

  assert.equal(result.pausedWeekdays, 2);
  assert.equal(result.deliveredWeekdays, 20);
});

test('TEST 4: Two separate pause periods are counted correctly', () => {
  const result = calculateBillForMonth({
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-01',
    pausePeriods: [
      { startDate: '2026-09-02', endDate: '2026-09-02' },
      { startDate: '2026-09-09', endDate: '2026-09-10' },
    ],
    month: '2026-09',
  });

  assert.equal(result.pausedWeekdays, 3);
});

test('TEST 5: overlapping pauses should not double count', () => {
  const result = calculateBillForMonth({
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-01',
    pausePeriods: [
      { startDate: '2026-09-08', endDate: '2026-09-11' },
      { startDate: '2026-09-10', endDate: '2026-09-14' },
    ],
    month: '2026-09',
  });

  assert.equal(result.pausedWeekdays, 5);
});

test('TEST 6: pause crossing month boundary counts only relevant dates', () => {
  const result = calculateBillForMonth({
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-08-28',
    pausePeriods: [
      { startDate: '2026-08-31', endDate: '2026-09-04' },
    ],
    month: '2026-09',
  });

  assert.equal(result.totalWeekdays, 22);
  assert.equal(result.pausedWeekdays, 4);
});

test('TEST 7: subscription starts mid-month only after start date is billable', () => {
  const result = calculateBillForMonth({
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-15',
    pausePeriods: [],
    month: '2026-09',
  });

  assert.equal(result.totalWeekdays, 12);
  assert.equal(result.deliveredWeekdays, 12);
});

test('TEST 8: invalid pause range should reject', () => {
  assert.throws(() => {
    calculateBillForMonth({
      monthlyPlanPrice: 3000,
      subscriptionStartDate: '2026-09-01',
      pausePeriods: [{ startDate: '2026-09-15', endDate: '2026-09-10' }],
      month: '2026-09',
    });
  }, /Invalid pause range/i);
});

test('TEST 9: invalid price should reject', () => {
  assert.throws(() => {
    calculateBillForMonth({
      monthlyPlanPrice: 0,
      subscriptionStartDate: '2026-09-01',
      pausePeriods: [],
      month: '2026-09',
    });
  }, /positive/i);
});

test('getWeekdayCountForMonth counts weekdays in range', () => {
  const count = getWeekdayCountForMonth('2026-09-01', '2026-09-30');
  assert.equal(count, 22);
});

test('getPauseWeekdaysForMonth deduplicates overlapping pause dates', () => {
  const count = getPauseWeekdaysForMonth(
    '2026-09-01',
    '2026-09-30',
    [
      { startDate: '2026-09-08', endDate: '2026-09-11' },
      { startDate: '2026-09-10', endDate: '2026-09-14' },
    ],
  );
  assert.equal(count, 5);
});
