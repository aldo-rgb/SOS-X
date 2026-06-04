/**
 * Vault de cifrado simétrico para secretos sensibles en BD (PayPal secret,
 * webhook secrets, etc.).
 *
 * Algoritmo: AES-256-GCM con IV aleatorio de 12 bytes y auth tag de 16 bytes.
 * Salida: `enc:v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>`
 *
 * La clave maestra se lee de `process.env.ENCRYPTION_KEY` (32 bytes hex
 * preferentemente; admite cualquier string ≥ 32 chars derivándolo a 32 bytes
 * con SHA-256).
 *
 * `decryptIfEncrypted` es tolerante: si el valor no tiene el prefijo `enc:v1:`
 * lo devuelve tal cual, lo cual permite migrar gradualmente datos existentes
 * en texto plano sin romper integraciones.
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

const getKey = (): Buffer => {
    if (cachedKey) return cachedKey;
    const raw = String(process.env.ENCRYPTION_KEY || '').trim();
    if (!raw) {
        throw new Error(
            'ENCRYPTION_KEY no está definido. Configúralo (32 bytes hex o ≥32 chars) antes de cifrar/decifrar secretos.'
        );
    }
    // Si parece hex de 64 chars (32 bytes) lo usamos tal cual.
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        cachedKey = Buffer.from(raw, 'hex');
    } else {
        // Derivar 32 bytes deterministas con SHA-256 — admite passphrases largas.
        cachedKey = crypto.createHash('sha256').update(raw, 'utf8').digest();
    }
    return cachedKey;
};

/** Devuelve true si el string fue producido por `encrypt`. */
export const isEncrypted = (value: unknown): boolean =>
    typeof value === 'string' && value.startsWith(PREFIX);

/** Cifra `plaintext` con la clave maestra. Siempre devuelve string con prefix. */
export const encrypt = (plaintext: string): string => {
    if (typeof plaintext !== 'string') {
        throw new Error('encrypt() requiere string');
    }
    const key = getKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
};

/**
 * Descifra un string producido por `encrypt`. Lanza si el formato es inválido
 * o si la auth tag no verifica (manipulación / clave incorrecta).
 */
export const decrypt = (token: string): string => {
    if (!isEncrypted(token)) {
        throw new Error('Token sin prefix enc:v1: no es descifrable');
    }
    const body = token.substring(PREFIX.length);
    const [ivB64, tagB64, ctB64] = body.split(':');
    if (!ivB64 || !tagB64 || !ctB64) {
        throw new Error('Formato de token cifrado inválido');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    if (iv.length !== IV_LEN) throw new Error('IV inválido');
    if (tag.length !== TAG_LEN) throw new Error('Auth tag inválido');
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
};

/**
 * Si el valor está cifrado lo descifra; si no lo está lo devuelve tal cual.
 * Útil mientras coexisten registros legacy en texto plano y nuevos cifrados.
 */
export const decryptIfEncrypted = (value: string | null | undefined): string => {
    if (value == null) return '';
    const s = String(value);
    if (!isEncrypted(s)) return s;
    return decrypt(s);
};
