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

const DEFAULT_API_BASE = 'http://localhost:4000';

function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return DEFAULT_API_BASE;
  }

  const { hostname, protocol } = window.location;
  const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);

  if (isLocalHost) {
    return DEFAULT_API_BASE;
  }

  if (hostname.includes('app.github.dev') || hostname.includes('github.dev')) {
    const sansPortPrefix = hostname.replace(/^\d+-/, '');
    return `${protocol}//4000-${sansPortPrefix}`;
  }

  return `${protocol}//${hostname}`;
}

const API_BASE = resolveApiBaseUrl();

function getStoredToken() {
  return localStorage.getItem('tiffinflow-token');
}

async function apiRequest(path, options = {}) {
  const token = options.token ?? getStoredToken();
  const isRawBody = typeof options.body === 'string'
    || options.body instanceof FormData
    || options.body instanceof Blob
    || options.body instanceof ArrayBuffer
    || options.body instanceof URLSearchParams;

  const requestBody = options.body !== undefined && !isRawBody ? JSON.stringify(options.body) : options.body;

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    ...options,
    body: requestBody,
    headers: {
      ...(options.body !== undefined && !isRawBody ? { 'Content-Type': 'application/json' } : {}),
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
              <span className="brand-mark">🍱</span>
              <span className="brand-text">
                <strong>TiffinFlow</strong>
                <small>Home-style meal ops</small>
              </span>
            </Link>
          </div>

          <nav className="nav" aria-label="Main navigation">
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
              element={token ? <DashboardPage token={token} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
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
        <div className="hero-copy-block">
          <span className="eyebrow">Premium tiffin operations</span>
          <h1>Run your tiffin service with confidence.</h1>
          <p className="hero-copy">
            Manage customers, pauses, daily lunch deliveries, and fair monthly billing — all from one
            calm workspace built for home-style tiffin businesses.
          </p>
          <div className="cta-row">
            <Link to="/register" className="primary-button">
              Get started
            </Link>
            <Link to="/dashboard" className="secondary-button">
              View dashboard
            </Link>
          </div>

          <ul className="trust-row" aria-label="Highlights">
            {['Customer tracking', 'Pause windows', 'Daily delivery check'].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="product-preview" aria-label="Dashboard preview">
          <div className="preview-card">
            <div className="preview-head">
              <span>Today&apos;s Tiffin Run</span>
              <span className="preview-pill">Live</span>
            </div>
            <div className="preview-list">
              <div className="preview-row">
                <div className="preview-person">
                  <span className="tiny-avatar green">R</span>
                  <div>
                    <strong>Rahul Sharma</strong>
                    <small>9876543210</small>
                  </div>
                </div>
                <span className="mini-badge success">Ready</span>
              </div>
              <div className="preview-row">
                <div className="preview-person">
                  <span className="tiny-avatar saffron">A</span>
                  <div>
                    <strong>Amit Verma</strong>
                    <small>9876543211</small>
                  </div>
                </div>
                <span className="mini-badge success">Ready</span>
              </div>
              <div className="preview-row">
                <div className="preview-person">
                  <span className="tiny-avatar muted">N</span>
                  <div>
                    <strong>Neha Sharma</strong>
                    <small>9123456789</small>
                  </div>
                </div>
                <span className="mini-badge warning">Paused</span>
              </div>
            </div>

            <div className="preview-summary">
              <div>
                <span>Active</span>
                <strong>142</strong>
              </div>
              <div>
                <span>Monthly billing</span>
                <strong>₹ 1.4L</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <span className="feature-icon">🍲</span>
          <h3>Daily kitchen operations</h3>
          <p>Track who is active today, who is paused, and who needs a delivery reminder.</p>
        </article>

        <article className="feature-card">
          <span className="feature-icon">📦</span>
          <h3>Operational clarity</h3>
          <ul>
            {features.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="feature-card">
          <span className="feature-icon">💰</span>
          <h3>Fair monthly billing</h3>
          <p>Keep billing accurate with weekday-only calculations and pause-aware cycle logic.</p>
        </article>
      </section>

      <section className="benefit-panel">
        <h2>Designed for tiffin owners</h2>
        <p>
          From daily lunch runs to monthly billing, TiffinFlow keeps your customer roster and service
          windows beautifully organized without losing the personal touch of a home kitchen.
        </p>
      </section>

      <section className="future-panel">
        <h2>Built for steady growth</h2>
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
    <div className="auth-shell">
      <div className="auth-illustration">
        <span className="eyebrow">TiffinFlow workspace</span>
        <h2>Keep every meal on schedule.</h2>
        <p>Track customers, service windows, and billing in one premium owner dashboard.</p>
        <div className="mini-metrics">
          <div>
            <strong>Secure</strong>
            <span>JWT protected owner access</span>
          </div>
          <div>
            <strong>Live</strong>
            <span>Billing and delivery sync</span>
          </div>
        </div>
      </div>

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
    </div>
  );
}

function DashboardPage({ token, onLogout }) {
  const [customers, setCustomers] = useState([]);
  const [statusCounts, setStatusCounts] = useState({ total: 0, active: 0, paused: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outbox, setOutbox] = useState([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [clockState, setClockState] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
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

  const loadOutbox = async () => {
    setOutboxLoading(true);
    try {
      const result = await apiRequest('/api/outbox', { token });
      setOutbox(result.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load outbox');
    } finally {
      setOutboxLoading(false);
    }
  };

  const handleClock = async () => {
    try {
      const result = await apiRequest('/api/clock', {
        method: 'POST',
        body: { businessDate: new Date().toISOString().slice(0, 10) },
        token,
      });
      setClockState(`Generated ${result.generated} delivery notifications for ${result.business_date}.`);
      await loadOutbox();
    } catch (err) {
      setClockState(err.message || 'Unable to trigger daily delivery check');
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setClockState('Select a CSV file first.');
      return;
    }

    setImporting(true);
    setError('');
    setClockState('');

    try {
      const result = await fetch(`${API_BASE}/api/customers/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': selectedFile.type || 'text/csv',
        },
        body: selectedFile,
      });

      const payload = await result.json();
      if (!result.ok) {
        throw new Error(payload.error || 'CSV import failed');
      }

      setImportResult(payload);
      setSelectedFile(null);
      await fetchCustomers(1, search, sort, order);
    } catch (err) {
      setClockState(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchCustomers(1, search, sort, order);
    loadOutbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sort, order]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalCustomers = pagination.total || statusCounts.total || customers.length;
  const activeCustomers = statusCounts.active || 0;
  const pausedCustomers = statusCounts.paused || 0;
  const todayRunCustomers = customers.slice(0, 5);
  const revenueEstimate = customers.reduce((sum, customer) => sum + Number(customer.monthly_plan_price || 0), 0);

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
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark small">🍱</span>
          <div>
            <strong>TiffinFlow</strong>
            <small>Owner workspace</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <NavLink to="/dashboard" className="nav-item active">Overview</NavLink>
          <a href="#customers-panel" className="nav-item">Customers</a>
          <a href="#delivery-panel" className="nav-item">Today&apos;s deliveries</a>
          <a href="#import-panel" className="nav-item">Import customers</a>
          <a href="#notification-panel" className="nav-item">Notifications</a>
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="secondary-button small" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>

      <div className="workspace-panel">
        <header className="workspace-header">
          <div>
            <p className="eyebrow soft">Operations dashboard</p>
            <h1>Good morning, Owner 👋</h1>
            <p className="workspace-subtitle">Here&apos;s what&apos;s happening with your tiffin service today.</p>
          </div>
          <button type="button" className="primary-button" onClick={handleClock}>
            Run delivery check
          </button>
        </header>

        <section className="summary-grid" aria-label="Overview metrics">
          <article className="summary-card">
            <div className="summary-icon green">👥</div>
            <div>
              <span>Total customers</span>
              <strong>{totalCustomers}</strong>
              <small>Across all active plans</small>
            </div>
          </article>

          <article className="summary-card accent">
            <div className="summary-icon saffron">✓</div>
            <div>
              <span>Active</span>
              <strong>{activeCustomers}</strong>
              <small>Currently subscribed</small>
            </div>
          </article>

          <article className="summary-card warning-card">
            <div className="summary-icon amber">⏸</div>
            <div>
              <span>Paused</span>
              <strong>{pausedCustomers}</strong>
              <small>On hold this cycle</small>
            </div>
          </article>

          <article className="summary-card revenue-card">
            <div className="summary-icon green">₹</div>
            <div>
              <span>Monthly billing</span>
              <strong>{formatCurrency(revenueEstimate * 100)}</strong>
              <small>Based on current plans</small>
            </div>
          </article>
        </section>

        <section className="main-grid">
          <div className="panel large-panel" id="delivery-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Today&apos;s tiffin run</p>
                <h2>Customers scheduled for today&apos;s lunch</h2>
              </div>
            </div>

            {clockState && <div className="success-box">{clockState}</div>}

            {loading ? (
              <p className="info-text">Loading customer list...</p>
            ) : todayRunCustomers.length > 0 ? (
              <div className="run-list">
                {todayRunCustomers.map((customer) => (
                  <div key={customer.id} className="run-row">
                    <div className="customer-meta">
                      <span className="avatar-circle">{customer.name?.charAt(0)?.toUpperCase() || 'C'}</span>
                      <div>
                        <strong>{customer.name}</strong>
                        <small>{customer.phone}</small>
                      </div>
                    </div>
                    <div className="run-meta">
                      <span className={`status-tag ${customer.status === 'PAUSED' ? 'paused' : 'active'}`}>
                        {customer.status === 'PAUSED' ? 'Paused' : 'Ready'}
                      </span>
                      <span className="mini-badge success">
                        {outbox.some((item) => Number(item.payload?.customer_id) === Number(customer.id)) ? 'Queued' : 'Confirmed'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No customers yet</h3>
                <p>Add your first tiffin subscriber to get started.</p>
              </div>
            )}
          </div>

          <div className="panel" id="notification-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Delivery notifications</p>
                <h2>Today&apos;s activity</h2>
              </div>
            </div>

            {outboxLoading ? (
              <p className="info-text">Loading notifications...</p>
            ) : outbox.length > 0 ? (
              <ul className="notification-list">
                {outbox.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <span className="notification-dot" aria-hidden="true" />
                    <div>
                      <strong>{item.payload?.customer_name || 'Customer'}</strong>
                      <small>Delivery notification queued</small>
                    </div>
                    <span className="notification-time">{item.delivery_date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state small">
                <h3>No notifications yet</h3>
                <p>Run the daily check to queue customer deliveries.</p>
              </div>
            )}
          </div>
        </section>

        <section className="customer-workspace" id="customers-panel">
          <div className="panel customer-panel">
            <div className="panel-header split-header">
              <div>
                <p className="section-kicker">Customer management</p>
                <h2>Customers</h2>
              </div>
              <button type="button" className="primary-button small" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                + Add customer
              </button>
            </div>

            <div className="toolbar">
              <input
                type="search"
                placeholder="Search by name or phone..."
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
              <p className="info-text">Loading customers...</p>
            ) : customers.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Subscription</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <div className="table-user">
                            <span className="avatar-mini">{customer.name?.charAt(0)?.toUpperCase() || 'C'}</span>
                            <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
                          </div>
                        </td>
                        <td>{customer.phone}</td>
                        <td>{formatCurrency(customer.monthly_plan_price * 100)}</td>
                        <td>
                          <span className={`pill ${customer.status === 'PAUSED' ? 'paused' : 'active'}`}>
                            {customer.status}
                          </span>
                        </td>
                        <td>{formatDate(customer.subscription_start_date)}</td>
                        <td>
                          <Link to={`/customers/${customer.id}`} className="table-link">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <h3>No customers yet</h3>
                <p>Add your first tiffin subscriber to get started.</p>
              </div>
            )}

            <div className="pagination-row">
              <button type="button" className="secondary-button small" disabled={pagination.page <= 1} onClick={() => fetchCustomers(pagination.page - 1, search, sort, order)}>
                Prev
              </button>
              <span>
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button type="button" className="secondary-button small" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchCustomers(pagination.page + 1, search, sort, order)}>
                Next
              </button>
            </div>
          </div>

          <aside className="panel form-panel" id="import-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Import customers</p>
                <h2>Bring in your list</h2>
              </div>
            </div>

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

            <div className="csv-block">
              <label className="file-label">
                CSV file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                />
              </label>

              <button type="button" className="secondary-button" disabled={!selectedFile || importing} onClick={handleImport}>
                {importing ? 'Importing...' : 'Import customer CSV'}
              </button>

              {importResult && (
                <div className="import-report">
                  <p>
                    Imported {importResult.imported} · Deduped {importResult.deduped} · Rejected {importResult.rejected}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
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
  const [transferForm, setTransferForm] = useState({ newCustomerId: '', effectiveDate: '', reason: '' });
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

  const handleTransfer = async (event) => {
    event.preventDefault();
    setActionState('');

    try {
      const payload = await apiRequest(`/api/customers/${customerId}/transfer`, {
        method: 'POST',
        body: {
          newCustomerId: Number(transferForm.newCustomerId),
          effectiveDate: transferForm.effectiveDate,
          reason: transferForm.reason,
        },
        token,
      });

      setActionState(`Subscription transferred to customer ${payload.new_customer_name || transferForm.newCustomerId}.`);
      setTransferForm({ newCustomerId: '', effectiveDate: '', reason: '' });
      await loadCustomer();
      await loadBill(month);
    } catch (err) {
      setActionState(err.message || 'Transfer failed');
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

      <section className="profile-summary">
        <div className="profile-card hero-profile">
          <div className="profile-avatar">{customer.name?.charAt(0)?.toUpperCase() || 'C'}</div>
          <div>
            <p className="section-kicker">Subscriber profile</p>
            <h3>{customer.name}</h3>
            <p>{customer.phone}</p>
          </div>
          <span className={`pill ${statusClass}`}>{customer.status}</span>
        </div>

        <div className="profile-card stat-profile">
          <div>
            <span>Monthly plan</span>
            <strong>{formatCurrency(customer.monthly_plan_price * 100)}</strong>
          </div>
          <div>
            <span>Started</span>
            <strong>{formatDate(customer.subscription_start_date)}</strong>
          </div>
        </div>
      </section>

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

            <p className="helper-copy">Paused weekdays won&apos;t be included in the monthly bill.</p>

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
              Resume service
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Transfer subscription</h3>
        <form className="stack-form narrow" onSubmit={handleTransfer}>
          <label>
            Destination customer ID
            <input
              type="number"
              min="1"
              value={transferForm.newCustomerId}
              onChange={(event) => setTransferForm({ ...transferForm, newCustomerId: event.target.value })}
              required
            />
          </label>

          <label>
            Effective date
            <input
              type="date"
              value={transferForm.effectiveDate}
              onChange={(event) => setTransferForm({ ...transferForm, effectiveDate: event.target.value })}
              required
            />
          </label>

          <label>
            Reason
            <input
              type="text"
              value={transferForm.reason}
              onChange={(event) => setTransferForm({ ...transferForm, reason: event.target.value })}
            />
          </label>

          <p className="helper-copy">The existing plan and billing cycle continue. Service attribution moves to the new customer from the effective date.</p>

          <button type="submit" className="primary-button">
            Transfer subscription
          </button>
        </form>
      </section>

      <section className="panel bill-panel">
        <div className="panel-header">
          <h3>Monthly billing</h3>
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
              <span>Billable weekdays</span>
              <strong>{bill.totalWeekdays}</strong>
            </div>
            <div className="bill-stat">
              <span>Paused weekdays</span>
              <strong>{bill.pausedWeekdays}</strong>
            </div>
            <div className="bill-stat">
              <span>Delivered days</span>
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
