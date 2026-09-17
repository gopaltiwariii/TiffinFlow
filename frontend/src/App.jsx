import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getStoredToken() {
  return localStorage.getItem('tiffinflow-token');
}

async function apiRequest(path, options = {}) {
  const token = options.token ?? getStoredToken();
  const requestBody =
    options.body !== undefined && typeof options.body !== 'string' && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body;

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    ...options,
    body: requestBody,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : 'Request failed';
    throw new Error(message);
  }

  return payload;
}

function formatCurrency(value) {
  const money = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(money / 100);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function App() {
  const [token, setToken] = useState(() => getStoredToken());

  const handleAuth = (newToken) => {
    localStorage.setItem('tiffinflow-token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('tiffinflow-token');
    setToken(null);
  };

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-block">
            <Link to="/" className="brand-link">
              <span className="brand-mark">TF</span>
              <span>TiffinFlow</span>
            </Link>
          </div>

          <nav className="nav">
            <NavLink to="/">Home</NavLink>
            {!token ? (
              <>
                <NavLink to="/login">Login</NavLink>
                <NavLink to="/register">Register</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <button type="button" className="text-button" onClick={handleLogout}>
                  Logout
                </button>
              </>
            )}
          </nav>
        </header>

        <main className="page-shell">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/login"
              element={token ? <Navigate to="/dashboard" replace /> : <AuthPage mode="login" onAuth={handleAuth} />}
            />
            <Route
              path="/register"
              element={token ? <Navigate to="/dashboard" replace /> : <AuthPage mode="register" onAuth={handleAuth} />}
            />
            <Route
              path="/dashboard"
              element={token ? <DashboardPage token={token} /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/customers/:customerId"
              element={token ? <CustomerDetailPage token={token} /> : <Navigate to="/login" replace />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function LandingPage() {
  const features = [
    'Monthly subscription tracking',
    'Pause/resume windows for travel and festivals',
    'Prorated billing by actual served weekdays',
  ];

  const futureFeatures = ['Online payments', 'WhatsApp delivery notifications', 'Revenue analytics'];

  return (
    <div className="landing-page">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Owner operations dashboard</span>
          <h1>TiffinFlow</h1>
          <p className="hero-copy">
            TiffinFlow helps home-style tiffin businesses track customers, manage pauses,
            and calculate accurate prorated monthly bills without spreadsheet headaches.
          </p>
          <div className="cta-row">
            <Link to="/register" className="primary-button">
              Get started
            </Link>
            <Link to="/login" className="secondary-button">
              Login
            </Link>
          </div>
        </div>

        <div className="stats-box">
          <div className="mini-stat">
            <strong>₹ 3,000</strong>
            <span>Average plan</span>
          </div>
          <div className="mini-stat">
            <strong>5 days</strong>
            <span>Per week</span>
          </div>
          <div className="mini-stat">
            <strong>100%</strong>
            <span>Bill precision</span>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <div className="info-card">
          <h3>What it does</h3>
          <p>Manage subscriptions, pause windows, and monthly billing for weekday lunch delivery.</p>
        </div>

        <div className="info-card">
          <h3>Key features</h3>
          <ul>
            {features.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="info-card">
          <h3>Target audience</h3>
          <p>Independent tiffin owners and small home-kitchen meal services.</p>
        </div>
      </section>

      <section className="benefit-panel">
        <h2>How it helps tiffin owners</h2>
        <p>
          Owners can quickly see active or paused customers, handle travel or festival pauses,
          and calculate exact bills based on the weekdays actually served.
        </p>
      </section>

      <section className="future-panel">
        <h2>Future features</h2>
        <ul>
          {futureFeatures.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AuthPage({ mode, onAuth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegister ? form : { email: form.email, password: form.password };
      const result = await apiRequest(endpoint, {
        method: 'POST',
        body: payload,
      });

      onAuth(result.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
      <form className="stack-form" onSubmit={handleSubmit}>
        {isRegister && (
          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
            minLength={6}
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? 'Please wait...' : isRegister ? 'Register' : 'Login'}
        </button>
      </form>
    </div>
  );
}

function DashboardPage({ token }) {
  const [customers, setCustomers] = useState([]);
  const [statusCounts, setStatusCounts] = useState({ total: 0, active: 0, paused: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    monthlyPlanPrice: '',
    subscriptionStartDate: '',
  });

  const fetchCustomers = async (targetPage = pagination.page, targetSearch = search, targetSort = sort, targetOrder = order) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
        sort: targetSort,
        order: targetOrder,
      });

      if (targetSearch.trim()) {
        params.set('search', targetSearch.trim());
      }

      const result = await apiRequest(`/api/customers?${params.toString()}`, { token });
      setCustomers(result.data || []);
      setStatusCounts(result.statusCounts || { total: 0, active: 0, paused: 0 });
      setPagination(result.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Unable to load customers');
    } finally {
      setLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchCustomers(1, search, sort, order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sort, order]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalCustomers = pagination.total || statusCounts.total || customers.length;
  const activeCustomers = statusCounts.active || 0;
  const pausedCustomers = statusCounts.paused || 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await apiRequest('/api/customers', {
        method: 'POST',
        body: {
          name: customerForm.name,
          phone: customerForm.phone,
          monthlyPlanPrice: Number(customerForm.monthlyPlanPrice),
          subscriptionStartDate: customerForm.subscriptionStartDate,
        },
        token,
      });

      setCustomerForm({
        name: '',
        phone: '',
        monthlyPlanPrice: '',
        subscriptionStartDate: '',
      });
      await fetchCustomers(1, search, sort, order);
    } catch (err) {
      setError(err.message || 'Customer creation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-page">
      <section className="stats-grid">
        <div className="stat-card">
          <span>Total customers</span>
          <strong>{totalCustomers}</strong>
        </div>
        <div className="stat-card success">
          <span>Active</span>
          <strong>{activeCustomers}</strong>
        </div>
        <div className="stat-card warning">
          <span>Paused</span>
          <strong>{pausedCustomers}</strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Customer list</h2>
          </div>

          <div className="toolbar">
            <input
              type="search"
              placeholder="Search by phone or name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="created_at">Newest</option>
              <option value="name">Name</option>
              <option value="phone">Phone</option>
              <option value="status">Status</option>
              <option value="monthly_plan_price">Plan price</option>
            </select>
            <select value={order} onChange={(event) => setOrder(event.target.value)}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          {error && <div className="error-box">{error}</div>}

          {loading ? (
            <p>Loading customers...</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Start</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
                      </td>
                      <td>{customer.phone}</td>
                      <td>{formatCurrency(customer.monthly_plan_price * 100)}</td>
                      <td>
                        <span className={`pill ${customer.status === 'PAUSED' ? 'paused' : 'active'}`}>
                          {customer.status}
                        </span>
                      </td>
                      <td>{formatDate(customer.subscription_start_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pagination-row">
            <button
              type="button"
              className="secondary-button small"
              disabled={pagination.page <= 1}
              onClick={() => fetchCustomers(pagination.page - 1, search, sort, order)}
            >
              Prev
            </button>
            <span>
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              className="secondary-button small"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchCustomers(pagination.page + 1, search, sort, order)}
            >
              Next
            </button>
          </div>
        </div>

        <aside className="panel form-panel">
          <h2>New subscription</h2>
          <form className="stack-form" onSubmit={handleSubmit}>
            <label>
              Customer name
              <input
                type="text"
                value={customerForm.name}
                onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
                required
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={customerForm.phone}
                onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })}
                required
              />
            </label>

            <label>
              Monthly plan (₹)
              <input
                type="number"
                min="1"
                step="1"
                value={customerForm.monthlyPlanPrice}
                onChange={(event) => setCustomerForm({ ...customerForm, monthlyPlanPrice: event.target.value })}
                required
              />
            </label>

            <label>
              Subscription start date
              <input
                type="date"
                value={customerForm.subscriptionStartDate}
                onChange={(event) => setCustomerForm({ ...customerForm, subscriptionStartDate: event.target.value })}
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Saving...' : 'Add customer'}
            </button>
          </form>
        </aside>
      </section>
    </div>
  );
}

function CustomerDetailPage({ token }) {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [bill, setBill] = useState(null);
  const [month, setMonth] = useState(getCurrentMonth());
  const [pauseForm, setPauseForm] = useState({ startDate: '', endDate: '', reason: 'Travel' });
  const [resumeDate, setResumeDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [billLoading, setBillLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionState, setActionState] = useState('');

  const loadCustomer = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest(`/api/customers/${customerId}`, { token });
      setCustomer(result);
    } catch (err) {
      setError(err.message || 'Unable to load customer');
    } finally {
      setLoading(false);
    }
  };

  const loadBill = async (targetMonth = month) => {
    setBillLoading(true);

    try {
      const result = await apiRequest(`/api/customers/${customerId}/bill?month=${targetMonth}`, { token });
      setBill(result);
    } catch (err) {
      setError(err.message || 'Unable to load bill');
    } finally {
      setBillLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (customer) {
      loadBill(month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, month]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handlePause = async (event) => {
    event.preventDefault();
    setActionState('');

    try {
      await apiRequest(`/api/customers/${customerId}/pause`, {
        method: 'POST',
        body: pauseForm,
        token,
      });
      setActionState('Pause saved successfully');
      setPauseForm({ startDate: '', endDate: '', reason: 'Travel' });
      await loadCustomer();
      await loadBill(month);
    } catch (err) {
      setActionState(err.message || 'Pause failed');
    }
  };

  const handleResume = async () => {
    setActionState('');

    try {
      const finalResumeDate = resumeDate || new Date().toISOString().slice(0, 10);
      const payload = await apiRequest(`/api/customers/${customerId}/resume`, {
        method: 'POST',
        body: {
          resumeDate: finalResumeDate,
        },
        token,
      });
      setActionState(payload && payload.message ? payload.message : (payload && payload.status === 'ACTIVE' ? 'Customer resumed successfully' : 'Resume succeeded'));
      setResumeDate('');
      await loadCustomer();
      await loadBill(month);
    } catch (err) {
      setActionState(err.message || 'Resume failed');
    }
  };

  if (loading) {
    return (
      <div className="panel">
        <p>Loading customer...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="panel">
        <p>Customer not found.</p>
      </div>
    );
  }

  const statusClass = customer.status === 'PAUSED' ? 'paused' : 'active';

  return (
    <div className="customer-page">
      <div className="page-heading-row">
        <div>
          <h2>{customer.name}</h2>
          <p className="muted">Customer record</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {actionState && <div className="success-box">{actionState}</div>}

      <section className="profile-grid">
        <div className="panel">
          <h3>Customer details</h3>
          <dl className="details-list">
            <div>
              <dt>Name</dt>
              <dd>{customer.name}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{customer.phone}</dd>
            </div>
            <div>
              <dt>Monthly plan</dt>
              <dd>{formatCurrency(customer.monthly_plan_price * 100)}</dd>
            </div>
            <div>
              <dt>Subscription start</dt>
              <dd>{formatDate(customer.subscription_start_date)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`pill ${statusClass}`}>{customer.status}</span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="panel">
          <h3>Pause / resume</h3>
          <form className="stack-form narrow" onSubmit={handlePause}>
            <label>
              Start date
              <input
                type="date"
                value={pauseForm.startDate}
                onChange={(event) => setPauseForm({ ...pauseForm, startDate: event.target.value })}
                required
              />
            </label>

            <label>
              End date
              <input
                type="date"
                value={pauseForm.endDate}
                onChange={(event) => setPauseForm({ ...pauseForm, endDate: event.target.value })}
                required
              />
            </label>

            <label>
              Reason
              <input
                type="text"
                value={pauseForm.reason}
                onChange={(event) => setPauseForm({ ...pauseForm, reason: event.target.value })}
              />
            </label>

            <button type="submit" className="primary-button">
              Pause subscription
            </button>
          </form>

          <div className="resume-box">
            <label>
              Resume date
              <input type="date" value={resumeDate} onChange={(event) => setResumeDate(event.target.value)} />
            </label>
            <button type="button" className="secondary-button" onClick={handleResume}>
              Resume
            </button>
          </div>
        </div>
      </section>

      <section className="panel bill-panel">
        <div className="panel-header">
          <h3>Prorated bill</h3>
          <label className="month-picker">
            Month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>

        {billLoading ? (
          <p>Loading bill...</p>
        ) : bill ? (
          <div className="bill-grid">
            <div className="bill-stat">
              <span>Total weekdays</span>
              <strong>{bill.totalWeekdays}</strong>
            </div>
            <div className="bill-stat">
              <span>Paused weekdays</span>
              <strong>{bill.pausedWeekdays}</strong>
            </div>
            <div className="bill-stat">
              <span>Delivered weekdays</span>
              <strong>{bill.deliveredWeekdays}</strong>
            </div>
            <div className="bill-stat highlight">
              <span>Final bill</span>
              <strong>{bill.finalBillDisplay}</strong>
            </div>
          </div>
        ) : (
          <p>No bill data available.</p>
        )}
      </section>

      <section className="panel">
        <h3>Pause history</h3>
        {customer.pause_history && customer.pause_history.length > 0 ? (
          <ul className="history-list">
            {customer.pause_history.map((item) => (
              <li key={item.id}>
                <span>
                  {formatDate(item.start_date)} to {formatDate(item.end_date)}
                </span>
                <span>{item.reason || 'No reason provided'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No pause history recorded.</p>
        )}
      </section>
    </div>
  );
}

export default App;
