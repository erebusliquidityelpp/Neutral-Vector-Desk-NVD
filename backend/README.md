# NVD Backend

Backend for [Neutral Vector Desk](https://erebusliquidityelpp.github.io/Neutral-Vector-Desk-NVD/). Adds:

- Email/password accounts (JWT)
- An encrypted vault for exchange API keys (AES-256-GCM, never stored or returned in plaintext)
- Journal and Watchlist sync across devices (Postgres, replacing per-browser localStorage)
- **Real order execution** on Hyperliquid, Binance, Bybit, OKX, Deribit and Coinbase via [ccxt](https://github.com/ccxt/ccxt) — a well-tested library, used specifically so this doesn't hand-roll per-exchange request signing with real money on the line
- A small CORS proxy for public data sources the browser can't reach directly (Binance, FRED, BLS)

## Before you deploy — read this

- This backend can place real orders with real money the moment you add exchange keys to it.
  **Test every exchange with a tiny amount first.** Where the exchange offers a testnet/sandbox
  (Bybit, OKX, Binance all do), add those keys with `testnet: true` and prove the flow there
  before adding live keys.
- `MASTER_KEY` encrypts every stored credential. If you lose it, every stored key becomes
  permanently unreadable (by design — nobody, including this server, can recover it without
  the key). Save it somewhere durable outside Railway, e.g. a password manager.
- Hyperliquid credentials are a **wallet address + that wallet's private key**, not an
  exchange-issued API key/secret. Treat that private key with the same care as the wallet
  itself — anyone who gets it controls the wallet, not just this one app's access to it.
  Consider using a dedicated sub-wallet funded only with what you're willing to trade through
  this site, not your main wallet.

## Deploy on Railway

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In Railway: **New Project → Deploy from GitHub repo** → pick this repo.
3. **Add a plugin → Postgres.** Railway wires `DATABASE_URL` into your service automatically —
   you don't set it by hand.
4. On the service, open **Variables** and set:
   - `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `MASTER_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `ALLOWED_ORIGINS` — `https://erebusliquidityelpp.github.io`
   - `FRED_API_KEY` — optional, only needed for the FRED proxy route
5. Deploy. The start command (`npm run migrate && npm start`, set in `railway.json`) creates the
   database tables on first boot and on every redeploy after — the migration is idempotent.
6. Copy the Railway-assigned public URL (Settings → Networking → Generate Domain) — that's the
   `API_BASE` the frontend needs to point at.

## API summary

- `POST /auth/register`, `POST /auth/login` → `{ token, user }`
- `GET/POST /api/keys`, `DELETE /api/keys/:id` (Bearer auth) — add/list/remove exchange credentials
- `GET/POST/DELETE /api/journal` (Bearer auth)
- `GET/POST/DELETE /api/watchlist/:stratId` (Bearer auth)
- `GET /api/execute/:exchange/balance`, `GET /api/execute/:exchange/positions` (Bearer auth)
- `POST /api/execute/:exchange/order` `{ symbol, side, type, amount, price?, testnet? }` (Bearer auth) — **places a real order**
- `POST /api/execute/:exchange/cancel` `{ orderId, symbol, testnet? }` (Bearer auth)
- `GET /proxy/binance/*`, `GET /proxy/fred/:series`, `GET /proxy/bls/:series` — no auth, public data only

`:exchange` is one of `hyperliquid`, `binance`, `bybit`, `okx`, `deribit`, `coinbase`.
`symbol` uses ccxt's unified format (e.g. `BTC/USDC:USDC` for a Hyperliquid perp, `BTC/USDT` spot).

## Local development

```bash
cp .env.example .env   # fill in DATABASE_URL (a local Postgres), JWT_SECRET, MASTER_KEY
npm install
npm run migrate
npm start
```
