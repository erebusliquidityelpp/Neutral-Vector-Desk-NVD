require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const keysRoutes = require('./routes/keys');
const journalRoutes = require('./routes/journal');
const watchlistRoutes = require('./routes/watchlist');
const executeRoutes = require('./routes/execute');
const proxyRoutes = require('./routes/proxy');

for (const must of ['JWT_SECRET', 'MASTER_KEY', 'DATABASE_URL']) {
  if (!process.env[must]) {
    console.error(`FATAL: required env var ${must} is not set. See .env.example.`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '256kb' }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: false
}));

app.get('/health', (req, res) => res.json({ ok: true, service: 'nvd-backend', time: new Date().toISOString() }));

app.use('/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/execute', executeRoutes);
app.use('/proxy', proxyRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`nvd-backend listening on :${port}`));
