const crypto = require('crypto');

function getMasterKey() {
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error('MASTER_KEY is not set — cannot encrypt or decrypt stored exchange credentials.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('MASTER_KEY must decode to exactly 32 bytes. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  return key;
}

// Encrypts a UTF-8 string. Output format: base64(iv):base64(authTag):base64(ciphertext)
// Safe to store the whole thing as one TEXT column.
function encrypt(plaintext) {
  if (plaintext == null) return null;
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

function decrypt(stored) {
  if (!stored) return null;
  const key = getMasterKey();
  const [ivB64, tagB64, dataB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted value.');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
