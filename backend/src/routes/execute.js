const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { getExchangeClient } = require('../lib/exchanges');
const { SUPPORTED_EXCHANGES } = require('./keys');

const router = express.Router();
router.use(requireAuth);

// Order placement is rate-limited harder than read-only calls — this is the endpoint that
// actually moves money, so a bug or a stuck client script can't hammer it.
const orderLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

function checkExchange(req, res, next) {
  if (!SUPPORTED_EXCHANGES.includes(req.params.exchange)) {
    return res.status(400).json({ error: `Unsupported exchange. Supported: ${SUPPORTED_EXCHANGES.join(', ')}` });
  }
  next();
}

router.get('/:exchange/balance', checkExchange, async (req, res) => {
  try {
    const client = await getExchangeClient(req.userId, req.params.exchange, { testnet: req.query.testnet === 'true' });
    if (!client) return res.status(404).json({ error: 'No credentials on file for this exchange.' });
    const balance = await client.fetchBalance();
    res.json({ balance });
  } catch (e) {
    console.error('Balance fetch error:', e);
    res.status(502).json({ error: e.message || 'Exchange request failed.' });
  }
});

router.get('/:exchange/positions', checkExchange, async (req, res) => {
  try {
    const client = await getExchangeClient(req.userId, req.params.exchange, { testnet: req.query.testnet === 'true' });
    if (!client) return res.status(404).json({ error: 'No credentials on file for this exchange.' });
    if (typeof client.fetchPositions !== 'function') return res.json({ positions: [] });
    const positions = await client.fetchPositions();
    res.json({ positions });
  } catch (e) {
    console.error('Positions fetch error:', e);
    res.status(502).json({ error: e.message || 'Exchange request failed.' });
  }
});

// Places ONE real order. Expects: { symbol, side, type, amount, price?, testnet? }
// symbol must be in ccxt's unified form, e.g. "BTC/USDC:USDC" for a Hyperliquid perp.
router.post('/:exchange/order', checkExchange, orderLimiter, async (req, res) => {
  const { symbol, side, type, amount, price, testnet } = req.body || {};
  if (!symbol || !['buy', 'sell'].includes(side) || !['market', 'limit'].includes(type) || !amount) {
    return res.status(400).json({ error: 'Required: symbol, side ("buy"|"sell"), type ("market"|"limit"), amount. price required for limit orders.' });
  }
  if (type === 'limit' && !price) return res.status(400).json({ error: 'price is required for a limit order.' });
  try {
    const client = await getExchangeClient(req.userId, req.params.exchange, { testnet: !!testnet });
    if (!client) return res.status(404).json({ error: 'No credentials on file for this exchange. Add one under Account → API Keys first.' });
    const order = await client.createOrder(symbol, type, side, amount, type === 'limit' ? price : undefined);
    res.status(201).json({ order });
  } catch (e) {
    console.error('Order placement error:', e);
    res.status(502).json({ error: e.message || 'Order rejected by the exchange.' });
  }
});

router.post('/:exchange/cancel', checkExchange, orderLimiter, async (req, res) => {
  const { orderId, symbol, testnet } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId is required.' });
  try {
    const client = await getExchangeClient(req.userId, req.params.exchange, { testnet: !!testnet });
    if (!client) return res.status(404).json({ error: 'No credentials on file for this exchange.' });
    const result = await client.cancelOrder(orderId, symbol);
    res.json({ result });
  } catch (e) {
    console.error('Cancel error:', e);
    res.status(502).json({ error: e.message || 'Cancel rejected by the exchange.' });
  }
});

module.exports = router;
