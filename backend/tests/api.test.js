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
    name: 'Asha Owner',
    email: `owner${Date.now()}@example.com`,
    password: 'password123',
    ...overrides,
  };

  const result = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(user),
  });

  return { user, result };
}

async function loginUser(email, password) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  return result;
}

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('TEST 10: duplicate phone number is rejected', { concurrency: false }, async () => {
  const { result: registerResult } = await registerUser({ email: 'dup-owner@example.com' });
  assert.equal(registerResult.status, 201);

  token = registerResult.payload.token;

  const create = await request('/api/customers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Ravi',
      phone: '9876543210',
      monthlyPlanPrice: 2500,
      subscriptionStartDate: '2026-09-01',
    }),
  });

  assert.equal(create.status, 201);

  const duplicate = await request('/api/customers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Ravi Duplicate',
      phone: '9876543210',
      monthlyPlanPrice: 2800,
      subscriptionStartDate: '2026-09-02',
    }),
  });

  assert.equal(duplicate.status, 409);
  assert.match(duplicate.payload.error, /already exists/i);
});

test('TEST 11: unauthorized API request must return 401', { concurrency: false }, async () => {
  const result = await request('/api/customers');
  assert.equal(result.status, 401);
});

test('TEST 12: invalid JWT must be rejected', { concurrency: false }, async () => {
  const result = await request('/api/customers', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer invalid-token',
    },
  });

  assert.equal(result.status, 401);
});

test('TEST 13: search by phone and pagination work', { concurrency: false }, async () => {
  const { result: loginResult } = await registerUser({ email: 'search-owner@example.com' });
  token = loginResult.payload.token;

  const customers = [
    { name: 'Ananya', phone: '9000000001', monthlyPlanPrice: 2100, subscriptionStartDate: '2026-09-01' },
    { name: 'Bhavya', phone: '9000000002', monthlyPlanPrice: 2200, subscriptionStartDate: '2026-09-02' },
    { name: 'Chetan', phone: '9000000003', monthlyPlanPrice: 2300, subscriptionStartDate: '2026-09-03' },
  ];

  for (const customer of customers) {
    const create = await request('/api/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(customer),
    });
    assert.equal(create.status, 201);
  }

  const searchResult = await request('/api/customers?search=9000000002&page=1&limit=10&sort=name&order=asc', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(searchResult.status, 200);
  assert.equal(searchResult.payload.pagination.total, 1);
  assert.equal(searchResult.payload.data.length, 1);
  assert.ok(searchResult.payload.data.some((customer) => customer.phone === '9000000002'));

  const paginated = await request('/api/customers?page=1&limit=2&sort=name&order=asc', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(paginated.status, 200);
  assert.equal(paginated.payload.data.length, 2);
  assert.equal(paginated.payload.pagination.page, 1);
  assert.equal(paginated.payload.pagination.limit, 2);
});

test('TEST 14: sorting and pause/resume flows work', { concurrency: false }, async () => {
  const { result: loginResult } = await registerUser({ email: 'billing-owner@example.com' });
  token = loginResult.payload.token;

  const customerCreate = await request('/api/customers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Zarin',
      phone: '9123456780',
      monthlyPlanPrice: 3000,
      subscriptionStartDate: '2026-09-01',
    }),
  });

  assert.equal(customerCreate.status, 201);
  const customerId = customerCreate.payload.id;

  const sorted = await request('/api/customers?sort=name&order=asc&limit=10', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(sorted.status, 200);
  assert.ok(sorted.payload.data.length >= 1);

  const pause = await request(`/api/customers/${customerId}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      startDate: '2026-09-17',
      endDate: '2026-09-18',
      reason: 'Travel',
    }),
  });

  assert.equal(pause.status, 201);

  const status = await request(`/api/customers/${customerId}/status`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(status.status, 200);
  assert.equal(status.payload.status, 'PAUSED');

  const bill = await request(`/api/customers/${customerId}/bill?month=2026-09`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(bill.status, 200);
  assert.equal(bill.payload.pausedWeekdays, 2);

  const resume = await request(`/api/customers/${customerId}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeDate: '2026-09-18' }),
  });

  assert.equal(resume.status, 200);
  assert.equal(resume.payload.status, 'PAUSED');
});

test('resumeDate inside an active pause truncates the pause correctly', { concurrency: false }, async () => {
  const { result: loginResult } = await registerUser({ email: 'resume-inside@example.com' });
  token = loginResult.payload.token;

  const create = await request('/api/customers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Resume Inside',
      phone: '9123000001',
      monthlyPlanPrice: 3000,
      subscriptionStartDate: '2026-09-01',
    }),
  });

  assert.equal(create.status, 201);
  const customerId = create.payload.id;

  const pause = await request(`/api/customers/${customerId}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      startDate: '2026-09-10',
      endDate: '2026-09-14',
      reason: 'Travel',
    }),
  });

  assert.equal(pause.status, 201);

  const resume = await request(`/api/customers/${customerId}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeDate: '2026-09-13' }),
  });

  assert.equal(resume.status, 200);
  assert.equal(resume.payload.updated, true);
  assert.equal(resume.payload.pause.end_date, '2026-09-12');
  assert.equal(resume.payload.status, 'ACTIVE');
});

test('resumeDate immediately after pause end is treated as no-op', { concurrency: false }, async () => {
  const { result: loginResult } = await registerUser({ email: 'resume-after@example.com' });
  token = loginResult.payload.token;

  const create = await request('/api/customers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Resume After',
      phone: '9123000002',
      monthlyPlanPrice: 3000,
      subscriptionStartDate: '2026-09-01',
    }),
  });

  assert.equal(create.status, 201);
  const customerId = create.payload.id;

  const pause = await request(`/api/customers/${customerId}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      startDate: '2026-09-10',
      endDate: '2026-09-14',
      reason: 'Travel',
    }),
  });

  assert.equal(pause.status, 201);

  const resume = await request(`/api/customers/${customerId}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeDate: '2026-09-15' }),
  });

  assert.equal(resume.status, 200);
  assert.equal(resume.payload.updated, false);
  assert.equal(resume.payload.pause.end_date, '2026-09-14');
  assert.equal(resume.payload.status, 'ACTIVE');
});

test('resumeDate validation rejects invalid dates and dates before pause start', { concurrency: false }, async () => {
  const { result: loginResult } = await registerUser({ email: 'resume-invalid@example.com' });
  token = loginResult.payload.token;

  const create = await request('/api/customers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Resume Invalid',
      phone: '9123000003',
      monthlyPlanPrice: 3000,
      subscriptionStartDate: '2026-09-01',
    }),
  });

  assert.equal(create.status, 201);
  const customerId = create.payload.id;

  const pause = await request(`/api/customers/${customerId}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      startDate: '2026-09-10',
      endDate: '2026-09-14',
      reason: 'Travel',
    }),
  });

  assert.equal(pause.status, 201);

  const earlyResume = await request(`/api/customers/${customerId}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeDate: '2026-09-09' }),
  });

  assert.equal(earlyResume.status, 400);
  assert.match(String(earlyResume.payload.error || ''), /resume date/i);

  const badCalendarResume = await request(`/api/customers/${customerId}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeDate: '2026-02-31' }),
  });

  assert.equal(badCalendarResume.status, 400);
  assert.match(String(badCalendarResume.payload.error || ''), /valid date/i);
});

test('dashboard counts and customer totals are computed across all pages', { concurrency: false }, async () => {
  const { result: loginResult } = await registerUser({ email: 'counts-owner@example.com' });
  token = loginResult.payload.token;
  const phoneSeed = Number(String(Date.now()).slice(-6));

  const customers = [];
  for (let index = 1; index <= 12; index += 1) {
    const isPaused = index % 3 === 0;
    customers.push({
      name: `Dashboard Count ${index}`,
      phone: `9123${String(phoneSeed + index).padStart(6, '0')}`,
      monthlyPlanPrice: 2200,
      subscriptionStartDate: '2026-09-01',
      status: isPaused ? 'PAUSED' : 'ACTIVE',
    });
  }

  for (const customer of customers) {
    const create = await request('/api/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(customer),
    });
    assert.equal(create.status, 201);

    if (customer.status === 'PAUSED') {
      const pause = await request(`/api/customers/${create.payload.id}/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          reason: 'Travel',
        }),
      });
      assert.equal(pause.status, 201);
    }
  }

  const list = await request('/api/customers?search=Dashboard%20Count&page=1&limit=5&sort=name&order=asc', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(list.status, 200);
  assert.equal(list.payload.pagination.page, 1);
  assert.equal(list.payload.pagination.limit, 5);
  assert.equal(list.payload.pagination.total, 12);
  assert.equal(list.payload.statusCounts.total, 12);
  assert.equal(list.payload.statusCounts.active + list.payload.statusCounts.paused, 12);

  const secondPage = await request('/api/customers?search=Dashboard%20Count&page=2&limit=5&sort=name&order=asc', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.payload.pagination.page, 2);
  assert.equal(secondPage.payload.pagination.total, 12);
  assert.equal(secondPage.payload.statusCounts.total, 12);
});

test('invalid calendar dates are rejected consistently', { concurrency: false }, async () => {
  const { result: loginResult } = await registerUser({ email: 'invalid-date-owner@example.com' });
  token = loginResult.payload.token;

  const invalidSubscription = await request('/api/customers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Bad Date',
      phone: '9123000011',
      monthlyPlanPrice: 2500,
      subscriptionStartDate: '2026-02-31',
    }),
  });

  assert.equal(invalidSubscription.status, 400);
  assert.match(String(invalidSubscription.payload.error || ''), /valid date/i);

  const customer = await request('/api/customers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Good Date',
      phone: '9123000012',
      monthlyPlanPrice: 2500,
      subscriptionStartDate: '2026-09-01',
    }),
  });

  assert.equal(customer.status, 201);

  const invalidPause = await request(`/api/customers/${customer.payload.id}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      startDate: '2026-02-31',
      endDate: '2026-03-02',
      reason: 'Travel',
    }),
  });

  assert.equal(invalidPause.status, 400);
  assert.match(String(invalidPause.payload.error || ''), /valid date/i);
});
