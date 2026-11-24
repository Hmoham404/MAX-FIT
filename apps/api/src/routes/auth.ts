import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { generateAccessCode, hashCode, randomToken, requireAuth, sha256, SESSION_HOURS } from '../lib/auth';
import { audit, clientIp, HttpError } from '../lib/util';

const auth = new Hono<AppEnv>();

const MAX_FAILS_PER_15MIN = 8;

auth.post('/login', async (c) => {
  const ip = clientIp(c);
  const fails = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > datetime('now','-15 minutes')",
  )
    .bind(ip)
    .first<{ n: number }>();
  if ((fails?.n ?? 0) >= MAX_FAILS_PER_15MIN) {
    throw new HttpError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
  }
  const { code } = z.object({ code: z.string().trim().min(6).max(64) }).parse(await c.req.json());
  const lookup = await hashCode(code.toUpperCase(), c.env.CODE_PEPPER);
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.display_name, r.code AS role FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.code_lookup = ? AND u.is_active = 1 AND u.archived_at IS NULL`,
  )
    .bind(lookup)
    .first<{ id: number; display_name: string; role: string }>();
  await c.env.DB.prepare('INSERT INTO login_attempts (ip, success) VALUES (?, ?)').bind(ip, user ? 1 : 0).run();
  if (!user) {
    await c.env.DB.prepare('INSERT INTO audit_logs (action, entity, ip) VALUES (?,?,?)').bind('login_failed', 'auth', ip).run();
    throw new HttpError(401, 'Code d’accès invalide');
  }
  const token = randomToken(32);
  const sid = await sha256(token);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO user_sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, datetime('now', '+${SESSION_HOURS} hours'), ?, ?)`,
    ).bind(sid, user.id, ip, (c.req.header('user-agent') || '').slice(0, 300)),
    c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id),
    c.env.DB.prepare('INSERT INTO audit_logs (user_id, action, entity, ip) VALUES (?,?,?,?)').bind(user.id, 'login', 'auth', ip),
    c.env.DB.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now','-1 day')"),
  ]);
  return c.json({ token, expiresInHours: SESSION_HOURS });
});

/** Creates the very first super admin. Disabled as soon as one user exists. Requires BOOTSTRAP_TOKEN secret. */
auth.post('/bootstrap', async (c) => {
  const { token, name } = z.object({ token: z.string().min(16), name: z.string().trim().min(2).max(80) }).parse(await c.req.json());
  if (!c.env.BOOTSTRAP_TOKEN || token !== c.env.BOOTSTRAP_TOKEN) throw new HttpError(403, 'Token invalide');
  const existing = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) throw new HttpError(409, 'Déjà initialisé');
  const code = generateAccessCode();
  const lookup = await hashCode(code, c.env.CODE_PEPPER);
  await c.env.DB.prepare('INSERT INTO users (display_name, role_id, code_lookup, code_hint) VALUES (?, 1, ?, ?)')
    .bind(name, lookup, code.slice(-2))
    .run();
  return c.json({ code, message: 'Conservez ce code : il ne sera plus jamais affiché.' });
});

auth.use('/me', requireAuth);
auth.get('/me', (c) => {
  const u = c.get('user');
  return c.json({ id: u.id, display_name: u.display_name, role: u.role, employee_id: u.employee_id, permissions: [...u.permissions] });
});

auth.use('/logout', requireAuth);
auth.post('/logout', async (c) => {
  const u = c.get('user');
  await c.env.DB.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE id = ?").bind(u.session_id).run();
  await audit(c, 'logout', 'auth');
  return c.json({ ok: true });
});

auth.use('/logout-all', requireAuth);
auth.post('/logout-all', async (c) => {
  const u = c.get('user');
  await c.env.DB.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").bind(u.id).run();
  await audit(c, 'logout_all', 'auth');
  return c.json({ ok: true });
});

/** Change own access code: must provide current one. New code is generated server side (strong). */
auth.use('/change-code', requireAuth);
auth.post('/change-code', async (c) => {
  const u = c.get('user');
  const { current, custom } = z
    .object({ current: z.string().min(6), custom: z.string().trim().min(8).max(64).optional() })
    .parse(await c.req.json());
  const lookup = await hashCode(current.toUpperCase(), c.env.CODE_PEPPER);
  const ok = await c.env.DB.prepare('SELECT 1 FROM users WHERE id = ? AND code_lookup = ?').bind(u.id, lookup).first();
  if (!ok) throw new HttpError(400, 'Code actuel incorrect');
  const code = (custom || generateAccessCode()).toUpperCase();
  if (custom && !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(code)) throw new HttpError(400, 'Le code doit contenir au moins 8 caractères, lettres et chiffres');
  const newLookup = await hashCode(code, c.env.CODE_PEPPER);
  try {
    await c.env.DB.prepare("UPDATE users SET code_lookup = ?, code_hint = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(newLookup, code.slice(-2), u.id)
      .run();
  } catch {
    throw new HttpError(409, 'Ce code n’est pas disponible, choisissez-en un autre');
  }
  await c.env.DB.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND id != ?").bind(u.id, u.session_id).run();
  await audit(c, 'change_code', 'users', u.id);
  return c.json({ code });
});

export default auth;
