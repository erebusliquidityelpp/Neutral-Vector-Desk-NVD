const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT strat_id FROM watchlist WHERE user_id = $1', [req.userId]);
  res.json({ stratIds: result.rows.map(r => r.strat_id) });
});

router.post('/:stratId', async (req, res) => {
  await pool.query(
    'INSERT INTO watchlist (user_id, strat_id) VALUES ($1,$2) ON CONFLICT (user_id, strat_id) DO NOTHING',
    [req.userId, req.params.stratId]
  );
  res.status(201).end();
});

router.delete('/:stratId', async (req, res) => {
  await pool.query('DELETE FROM watchlist WHERE user_id = $1 AND strat_id = $2', [req.userId, req.params.stratId]);
  res.status(204).end();
});

module.exports = router;
