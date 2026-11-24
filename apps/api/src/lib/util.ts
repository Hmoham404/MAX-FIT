import type { Context } from 'hono';
import type { AppEnv } from '../types';

/** Africa/Tunis is UTC+1 all year (no DST since 2009). */
const TUNIS_OFFSET_MS = 60 * 60 * 1000;

export function nowTunis(): Date {
  return new Date(Date.now() + TUNIS_OFFSET_MS);
}
export function todayISO(): string {
  return nowTunis().toISOString().slice(0, 10);
}
export function nowISO(): string {
  return nowTunis().toISOString().slice(0, 19);
}
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(date: string, months: number): string {
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}
export function ageFrom(birth: string | null | undefined, ref = todayISO()): number | null {
  if (!birth) return null;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ry, rm, rd] = ref.split('-').map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age--;
  return age;
}

/** Compute subscription end date: end is inclusive (last valid day). */
export function computeEndDate(start: string, unit: string, value: number): string {
  switch (unit) {
    case 'session':
    case 'day':
      return addDays(start, Math.max(1, value) - 1);
    case 'week':
      return addDays(start, value * 7 - 1);
    case 'month':
    default:
      return addDays(addMonths(start, value), -1);
  }
}

export async function nextNumber(db: D1Database, prefix: string, period: string, pad = 4): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO document_counters (prefix, period, last_value) VALUES (?1, ?2, 1)
       ON CONFLICT(prefix, period) DO UPDATE SET last_value = last_value + 1
       RETURNING last_value`,
    )
    .bind(prefix, period)
    .first<{ last_value: number }>();
  return `${prefix}-${period}-${String(row!.last_value).padStart(pad, '0')}`;
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
}

export async function audit(
  c: Context<AppEnv>,
  action: string,
  entity?: string,
  entityId?: string | number | null,
  details?: unknown,
) {
  const user = c.get('user');
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?)',
  )
    .bind(
      user?.id ?? null,
      action,
      entity ?? null,
      entityId != null ? String(entityId) : null,
      details ? JSON.stringify(details).slice(0, 4000) : null,
      clientIp(c),
    )
    .run();
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function periodRange(from?: string, to?: string): { from: string; to: string } {
  const t = todayISO();
  return { from: from || t.slice(0, 7) + '-01', to: to || t };
}
