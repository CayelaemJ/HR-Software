import { scrypt as rawScrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(rawScrypt);
export const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
export function validateEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }
export async function hashPassword(password) {
 if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Password must be 12–256 characters');
 const salt = randomBytes(16).toString('hex');
 const key = await scrypt(password,salt,64);
 return salt + ':' + key.toString('hex');
}
export async function checkPassword(password,stored) {
 const [salt,hex] = (stored || '').split(':');
 if (!salt || !/^[a-f0-9]{128}$/.test(hex||'')) return false;
 const given = await scrypt(password,salt,64);
 return timingSafeEqual(given,Buffer.from(hex,'hex'));
}
export function token() { return randomBytes(32).toString('hex'); }
export function digest(value) { return createHash('sha256').update(value).digest('hex'); }
export function isUuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x); }
