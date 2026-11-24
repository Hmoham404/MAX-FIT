import type { MiddlewareHandler } from 'hono';
import type { AppEnv, SessionUser } from '../types';
import { HttpError, parseJSON } from './util';

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Keyed hash of an access code. Deterministic so the code itself identifies the user. */
export async function hashCode(code: string, pepper: string): Promise<string> {
  if (!pepper || pepper.length < 16) throw new HttpError(500, 'Server misconfigured: CODE_PEPPER missing');
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  // Keyed with a secret pepper (never stored in DB) + a few rounds; online guessing is rate limited.
  let data: Uint8Array = enc.encode('maxfit:' + code.trim());
  for (let i = 0; i < 64; i++) {
    data = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  }
  return toHex(data.buffer as ArrayBuffer);
}

export async function sha256(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Human friendly access code: 4-4-4 groups, unambiguous alphabet. */
export function generateAccessCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  const chars = [...a].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`;
}

export const SESSION_HOURS = 12;

export async function loadUserFromToken(db: D1Database, token: string): Promise<SessionUser | null> {
  const sid = await sha256(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.display_name, u.employee_id, u.extra_permissions, u.denied_permissions, r.code AS role, r.id AS role_id
       FROM user_sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
       WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now') AND u.is_active = 1 AND u.archived_at IS NULL`,
    )
    .bind(sid)
    .first<{
      id: number;
      display_name: string;
      employee_id: number | null;
      extra_permissions: string;
      denied_permissions: string;
      role: string;
      role_id: number;
    }>();
  if (!row) return null;
  const perms = await db
    .prepare(
      'SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?',
    )
    .bind(row.role_id)
    .all<{ code: string }>();
  const set = new Set(perms.results.map((p) => p.code));
  for (const p of parseJSON<string[]>(row.extra_permissions, [])) set.add(p);
  for (const p of parseJSON<string[]>(row.denied_permissions, [])) set.delete(p);
  if (row.role === 'super_admin') {
    const all = await db.prepare('SELECT code FROM permissions').all<{ code: string }>();
    all.results.forEach((p) => set.add(p.code));
  }
  return {
    id: row.id,
    display_name: row.display_name,
    role: row.role,
    employee_id: row.employee_id,
    permissions: set,
    session_id: sid,
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const h = c.req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token || token.length < 32) throw new HttpError(401, 'Authentification requise');
  const user = await loadUserFromToken(c.env.DB, token);
  if (!user) throw new HttpError(401, 'Session expirée ou invalide');
  c.set('user', user);
  await next();
};

export function can(user: SessionUser, perm: string): boolean {
  return user.permissions.has(perm);
}

export function requirePerm(...perms: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !perms.every((p) => user.permissions.has(p))) {
      throw new HttpError(403, 'Accès refusé');
    }
    await next();
  };
}

export function assertPerm(user: SessionUser, perm: string) {
  if (!user.permissions.has(perm)) throw new HttpError(403, 'Accès refusé');
}
