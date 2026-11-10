// Thin wrapper over ccxt so every exchange is instantiated the same way, using credentials
// pulled (and decrypted) from our own DB rather than ccxt's own config files. ccxt is used
// instead of hand-rolled per-exchange request signing specifically because getting HMAC/EIP-712
// signing wrong with real money is a worse failure mode than depending on a well-tested library.
const ccxt = require('ccxt');
const pool = require('../db/pool');
const { decrypt } = require('./crypto');

async function getStoredKey(userId, exchange, testnet) {
  const result = await pool.query(
    'SELECT api_key_enc, api_secret_enc, passphrase_enc FROM api_keys WHERE user_id = $1 AND exchange = $2 AND testnet = $3',
    [userId, exchange, !!testnet]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    apiKey: decrypt(row.api_key_enc),
    apiSecret: decrypt(row.api_secret_enc),
    passphrase: decrypt(row.passphrase_enc)
  };
}

// Builds a live, ready-to-use ccxt exchange instance for this user + exchange, or null if no
// credentials are on file. Throws if the exchange name isn't one ccxt (and we) support.
async function getExchangeClient(userId, exchangeId, { testnet = false } = {}) {
  const creds = await getStoredKey(userId, exchangeId, testnet);
  if (!creds) return null;

  if (exchangeId === 'hyperliquid') {
    // ccxt's hyperliquid takes a wallet address + that wallet's private key, not a classic
    // apiKey/secret pair — we reuse the same two DB columns to hold them.
    const client = new ccxt.hyperliquid({ walletAddress: creds.apiKey, privateKey: creds.apiSecret });
    if (testnet && client.urls && client.urls.test) client.urls.api = client.urls.test;
    return client;
  }

  if (!ccxt[exchangeId]) throw new Error(`ccxt has no "${exchangeId}" exchange implementation.`);
  const client = new ccxt[exchangeId]({
    apiKey: creds.apiKey,
    secret: creds.apiSecret,
    password: creds.passphrase || undefined, // OKX / Coinbase Advanced need a passphrase
    enableRateLimit: true
  });
  if (testnet && typeof client.setSandboxMode === 'function') client.setSandboxMode(true);
  return client;
}

module.exports = { getExchangeClient };
