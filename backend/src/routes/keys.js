const express = require('express');
const pool = require('../db/pool');
const { encrypt } = require('../lib/crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const SUPPORTED_EXCHANGES = ['hyperliquid', 'binance', 'bybit', 'okx', 'deribit', 'coinbase'];

// List configured exchanges — NEVER returns decrypted secrets, only metadata.
router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT id, exchange, label, testnet, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [req.userId]
  );
  res.json({ keys: result.rows });
});

// Add or replace credentials for one exchange (+ testnet flag combination).
router.post('/', async (req, res) => {
  const { exchange, label, testnet, apiKey, apiSecret, passphrase } = req.body || {};
  if (!SUPPORTED_EXCHANGES.includes(exchange)) {
    return res.status(400).json({ error: `Unsupported exchange. Supported: ${SUPPORTED_EXCHANGES.join(', ')}` });
  }
  if (exchange === 'hyperliquid') {
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Hyperliquid needs apiKey = your wallet address and apiSecret = that wallet\'s private key.' });
    }
  } else if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'apiKey and apiSecret are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO api_keys (user_id, exchange, label, testnet, api_key_enc, api_secret_enc, passphrase_enc)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, exchange, testnet)
       DO UPDATE SET label = $3, api_key_enc = $5, api_secret_enc = $6, passphrase_enc = $7
       RETURNING id, exchange, label, testnet, created_at`,
      [req.userId, exchange, label || null, !!testnet, encrypt(apiKey), encrypt(apiSecret), encrypt(passphrase || null)]
    );
    res.status(201).json({ key: result.rows[0] });
  } catch (e) {
    console.error('Key store error:', e);
    res.status(500).json({ error: 'Could not store credentials.' });
  }
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.status(204).end();
});

module.exports = router;
module.exports.SUPPORTED_EXCHANGES = SUPPORTED_EXCHANGES;
