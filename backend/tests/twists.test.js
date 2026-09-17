const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join(__dirname, '../data/tiffinflow.db');
for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

const app = require('../server');

let server;
let baseUrl;
let token;

async function request(pathname, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  return { status: response.status, payload };
}

async function registerUser(overrides = {}) {
  const user = {
    name: 'Owner Twists',
    email: `twist-owner-${Date.now()}@example.com`,
    password: 'password123',
    ...overrides,
  };

  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

async function addCustomer(payload) {
  return request('/api/customers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  const registerResult = await registerUser({ email: 'twist-owner@example.com' });
  assert.equal(registerResult.status, 201);
  token = registerResult.payload.token;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('T1: weekday active customer gets a delivery notification while paused and weekend customers do not', async () => {
  const activeCustomer = await addCustomer({
    name: 'Weekday Customer',
    phone: '9000000101',
    monthlyPlanPrice: 2500,
    subscriptionStartDate: '2026-09-01',
  });
  assert.equal(activeCustomer.status, 201);

  const pausedCustomer = await addCustomer({
    name: 'Paused Customer',
    phone: '9000000102',
    monthlyPlanPrice: 2500,
    subscriptionStartDate: '2026-09-01',
  });
  assert.equal(pausedCustomer.status, 201);

  const pause = await request(`/api/customers/${pausedCustomer.payload.id}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ startDate: '2026-09-02', endDate: '2026-09-02', reason: 'Travel' }),
  });
  assert.equal(pause.status, 201);

  const futureCustomer = await addCustomer({
    name: 'Future Start',
    phone: '9000000103',
    monthlyPlanPrice: 2500,
    subscriptionStartDate: '2026-09-10',
  });
  assert.equal(futureCustomer.status, 201);

  const weekdayClock = await request('/api/clock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ businessDate: '2026-09-02' }),
  });

  assert.equal(weekdayClock.status, 200);
  assert.equal(weekdayClock.payload.generated, 1);
  assert.ok(weekdayClock.payload.skipped >= 1);

  const outbox = await request('/api/outbox', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(outbox.status, 200);
  assert.equal(outbox.payload.total, 1);
  assert.equal(outbox.payload.data[0].customer_id, activeCustomer.payload.id);
  assert.equal(outbox.payload.data[0].delivery_date, '2026-09-02');

  const weekendClock = await request('/api/clock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ businessDate: '2026-09-05' }),
  });
  assert.equal(weekendClock.status, 200);
  assert.equal(weekendClock.payload.generated, 0);

  const duplicateClock = await request('/api/clock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ businessDate: '2026-09-02' }),
  });
  assert.equal(duplicateClock.status, 200);
  assert.equal(duplicateClock.payload.generated, 0);

  const futureClock = await request('/api/clock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ businessDate: '2026-09-10' }),
  });
  assert.equal(futureClock.status, 200);
  assert.equal(futureClock.payload.generated, 3);
});

test('T6: transfer splits billing correctly and retains transfer history', async () => {
  const oldCustomer = await addCustomer({
    name: 'Transfer Old',
    phone: '9000000201',
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-01',
  });
  assert.equal(oldCustomer.status, 201);

  const newCustomer = await addCustomer({
    name: 'Transfer New',
    phone: '9000000202',
    monthlyPlanPrice: 3000,
    subscriptionStartDate: '2026-09-01',
  });
  assert.equal(newCustomer.status, 201);

  const transfer = await request(`/api/customers/${oldCustomer.payload.id}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ newCustomerId: newCustomer.payload.id, effectiveDate: '2026-09-16' }),
  });

  assert.equal(transfer.status, 200);
  assert.equal(transfer.payload.effective_date, '2026-09-16');
  assert.equal(transfer.payload.old_customer_id, oldCustomer.payload.id);
  assert.equal(transfer.payload.new_customer_id, newCustomer.payload.id);

  const oldBill = await request(`/api/customers/${oldCustomer.payload.id}/bill?month=2026-09`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const newBill = await request(`/api/customers/${newCustomer.payload.id}/bill?month=2026-09`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(oldBill.status, 200);
  assert.equal(newBill.status, 200);
  assert.equal(oldBill.payload.finalBillCents, 150000);
  assert.equal(newBill.payload.finalBillCents, 150000);

  const transferHistory = await request(`/api/customers/${oldCustomer.payload.id}/transfers`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(transferHistory.status, 200);
  assert.equal(transferHistory.payload.length, 1);
  assert.equal(transferHistory.payload[0].subscription_cycle_id, oldCustomer.payload.subscription_cycle_id);
});

test('T4: import accepts valid CSV rows, dedupes duplicates, rejects invalid data, and stores imported rows', async () => {
  const csv = [
    'name,phone,monthlyPlanPrice,subscriptionStartDate',
    'Amit,9876500001,2200,2026-09-01',
    'Bharat,9876500002,2300,02/09/2026',
    'Chandra,9876500002,2400,03/09/2026',
    'Deepa,9876500004,2500,2026/09/01',
    'Esha,,2600,2026-09-03',
    'Faisal,9876500006,abc,2026-09-04',
    'Gita,9876500007,2100,2026-09-05',
  ].join('\n');

  const response = await request('/api/customers/import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/csv',
    },
    body: csv,
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.imported, 3);
  assert.equal(response.payload.deduped, 1);
  assert.equal(response.payload.rejected, 3);
  assert.ok(Array.isArray(response.payload.details));

  const list = await request('/api/customers?page=1&limit=20', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(list.status, 200);
  assert.ok(list.payload.data.some((customer) => customer.phone === '9876500001'));
  assert.ok(list.payload.data.some((customer) => customer.phone === '9876500007'));
});
