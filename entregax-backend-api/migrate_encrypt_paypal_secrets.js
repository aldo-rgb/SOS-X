/**
 * Cifra los `paypal_secret` que aún estén en texto plano en
 * `fiscal_emitters` usando el cryptoVault (AES-256-GCM).
 *
 * Idempotente: los que ya empiezan con `enc:v1:` se saltan.
 *
 * Uso:
 *   node migrate_encrypt_paypal_secrets.js
 *
 * Requiere `ENCRYPTION_KEY` en el .env (32 bytes hex o ≥32 chars).
 */

require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const PREFIX = 'enc:v1:';

function getKey() {
    const raw = String(process.env.ENCRYPTION_KEY || '').trim();
    if (!raw) throw new Error('ENCRYPTION_KEY no está definido en .env');
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encrypt(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const { rows } = await pool.query(
            `SELECT id, alias, paypal_secret
               FROM fiscal_emitters
              WHERE paypal_secret IS NOT NULL
                AND paypal_secret <> ''
                AND paypal_secret NOT LIKE 'enc:v1:%'`
        );
        if (!rows.length) {
            console.log('✅ Nada que migrar: 0 secrets en texto plano.');
            return;
        }
        console.log(`🔐 Cifrando ${rows.length} secret(s) en texto plano…`);
        for (const row of rows) {
            const enc = encrypt(row.paypal_secret);
            await pool.query(
                `UPDATE fiscal_emitters SET paypal_secret = $1 WHERE id = $2`,
                [enc, row.id]
            );
            console.log(`  ✓ id=${row.id} (${row.alias}) cifrado`);
        }
        console.log('✅ Migración completa.');
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
