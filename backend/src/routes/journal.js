const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY opened_at DESC', [req.userId]);
  res.json({ entries: result.rows });
});

// Upsert — the frontend sends its full localStorage-shaped entry and we store it keyed by its
// own client-generated id, so logging a trade works the same whether or not sync is reachable.
router.post('/', async (req, res) => {
  const e = req.body || {};
  if (!e.id || !e.openedAt) return res.status(400).json({ error: 'id and openedAt are required.' });
  try {
    const result = await pool.query(
      `INSERT INTO journal_entries
        (id, user_id, opened_at, status, strat_id, strat_name, asset, ccy, spot, qty, mult, legs,
         max_profit, max_loss, breakevens, net_is_debit, net_amount, signal_snapshot, closed_at, exit_spot, realized_pnl, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
       ON CONFLICT (id) DO UPDATE SET
         status=$4, closed_at=$19, exit_spot=$20, realized_pnl=$21, updated_at=now()
       RETURNING *`,
      [e.id, req.userId, e.openedAt, e.status || 'open', e.stratId, e.stratName, e.asset, e.ccy,
       e.spot, e.qty, e.mult, JSON.stringify(e.legs || []), e.maxProfit, e.maxLoss,
       JSON.stringify(e.breakevens || []), !!e.netIsDebit, e.netAmount,
       e.signalSnapshot ? JSON.stringify(e.signalSnapshot) : null, e.closedAt || null, e.exitSpot || null, e.realizedPnl ?? null]
    );
    res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('Journal upsert error:', err);
    res.status(500).json({ error: 'Could not save journal entry.' });
  }
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM journal_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.status(204).end();
});

router.delete('/', async (req, res) => {
  await pool.query('DELETE FROM journal_entries WHERE user_id = $1', [req.userId]);
  res.status(204).end();
});

module.exports = router;
