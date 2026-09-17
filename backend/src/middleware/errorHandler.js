function notFoundHandler(req, res) {
  return res.status(404).json({ error: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  return res.status(status).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };
