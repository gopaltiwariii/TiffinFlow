require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/routes/authRoutes');
const customerRoutes = require('./src/routes/customerRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const { initDatabase } = require('./src/config/initDb');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

const app = express();
const port = Number(process.env.PORT || 4000);

initDatabase();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'TiffinFlow backend is healthy' });
});

app.use('/api/auth', authRoutes);
app.use('/api', notificationRoutes);
app.use('/api/customers', customerRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`TiffinFlow backend running on http://localhost:${port}`);
  });
}

module.exports = app;
