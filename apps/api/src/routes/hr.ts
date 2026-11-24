import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { assertPerm, can } from '../lib/auth';
import { zDate, zTime } from '../lib/crud';
import { addDays, audit, HttpError, nowISO, todayISO } from '../lib/util';

// ===================== SCHEDULES =====================
export const schedules = new Hono<AppEnv>();

const SSEL = `s.*, a.name AS activity_name, a.name_en AS activity_name_en, a.name_ar AS activity_name_ar, a.color AS activity_color, a.category AS activity_category,
  COALESCE(rc.public_name, re.first_name || ' ' || re.last_name, co.public_name, ce.first_name || ' ' || ce.last_name) AS coach_name,
  r.name AS room_name,
  (SELECT COUNT(*) FROM attendance at WHERE at.schedule_id = s.id) AS attendees`;
const SFROM = `schedules s JOIN activities a ON a.id = s.activity_id
  LEFT JOIN coaches co ON co.id = s.coach_id LEFT JOIN employees ce ON ce.id = co.employee_id
  LEFT JOIN coaches rc ON rc.id = s.replacement_coach_id LEFT JOIN employees re ON re.id = rc.employee_id
  LEFT JOIN rooms r ON r.id = s.room_id`;

export async function listSchedules(db: D1Database, from: string, to: string, extra = '', params: unknown[] = []) {
  const rows = await db
    .prepare(`SELECT ${SSEL} FROM ${SFROM} WHERE s.session_date BETWEEN ? AND ? ${extra} ORDER BY s.session_date, s.start_time`)
    .bind(from, to, ...params)
    .all();
  return rows.results;
}

const schedSchema = z.object({
  activity_id: z.coerce.number().int().positive(),
  coach_id: z.coerce.number().int().positive().optional().nullable(),
  room_id: z.coerce.number().int().positive().optional().nullable(),
  session_date: zDate,
  start_time: zTime,
  end_time: zTime,
  age_category: z.string().max(40).optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  status: z.enum(['scheduled', 'cancelled', 'full', 'done']).optional(),
  replacement_coach_id: z.coerce.number().int().positive().optional().nullable(),
  is_published: z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0)).optional(),
  notes: z.string().max(500).optional().nullable(),
  repeat_weeks: z.coerce.number().int().min(0).max(52).optional(),
  force: z.boolean().optional(),
});

async function conflicts(db: D1Database, d: any, excludeIds: number[] = []) {
  const coach = d.replacement_coach_id || d.coach_id;
  const ex = excludeIds.length ? excludeIds : [0];
  const rows = await db
    .prepare(
      `SELECT ${SSEL} FROM ${SFROM} WHERE s.session_date = ? AND s.status != 'cancelled' AND s.start_time < ? AND s.end_time > ?
       AND s.id NOT IN (${ex.map(() => '?').join(',')})
       AND ((? IS NOT NULL AND COALESCE(s.replacement_coach_id, s.coach_id) = ?) OR (? IS NOT NULL AND s.room_id = ?))`,
    )
    .bind(d.session_date, d.end_time, d.start_time, ...ex, coach ?? null, coach ?? null, d.room_id ?? null, d.room_id ?? null)
    .all<Record<string, unknown>>();
  const closed = await db.prepare('SELECT * FROM schedule_exceptions WHERE exception_date = ?').bind(d.session_date).first<{ label: string }>();
  const list = rows.results.map((r) => ({
    id: r.id,
    type: (r.coach_id === coach || r.replacement_coach_id === coach) && coach ? 'coach' : 'room',
    label: `${r.activity_name} ${r.start_time}-${r.end_time} (${r.coach_name ?? ''} / ${r.room_name ?? ''})`,
  }));
  if (closed) list.push({ id: 0, type: 'closure', label: `Fermeture : ${closed.label}` });
  return list;
}

schedules.get('/', async (c) => {
  assertPerm(c.get('user'), 'schedules:read');
  const q = c.req.query();
  const from = q.from || todayISO();
  const to = q.to || addDays(from, 6);
  let extra = '';
  const params: unknown[] = [];
  if (q.activity_id) (extra += ' AND s.activity_id = ?', params.push(q.activity_id));
  if (q.coach_id) (extra += ' AND (s.coach_id = ? OR s.replacement_coach_id = ?)', params.push(q.coach_id, q.coach_id));
  if (q.room_id) (extra += ' AND s.room_id = ?', params.push(q.room_id));
  if (q.status) (extra += ' AND s.status = ?', params.push(q.status));
  // a coach only sees his own sessions
  const u = c.get('user');
  if (u.role === 'coach') {
    extra += ' AND (co.employee_id = ? OR rc.employee_id = ?)';
    params.push(u.employee_id ?? -1, u.employee_id ?? -1);
  }
  const exceptions = await c.env.DB.prepare('SELECT * FROM schedule_exceptions WHERE exception_date BETWEEN ? AND ?').bind(from, to).all();
  return c.json({ data: await listSchedules(c.env.DB, from, to, extra, params), exceptions: exceptions.results });
});

schedules.post('/check', async (c) => {
  assertPerm(c.get('user'), 'schedules:read');
  const b = schedSchema.extend({ id: z.coerce.number().optional() }).parse(await c.req.json());
  return c.json({ conflicts: await conflicts(c.env.DB, b, b.id ? [b.id] : []) });
});

schedules.post('/', async (c) => {
  assertPerm(c.get('user'), 'schedules:write');
  const b = schedSchema.parse(await c.req.json());
  if (b.end_time <= b.start_time) throw new HttpError(400, 'L’heure de fin doit être après l’heure de début');
  const weeks = b.repeat_weeks ?? 0;
  const group = weeks > 0 ? crypto.randomUUID() : null;
  const created: number[] = [];
  const allConflicts: unknown[] = [];
  for (let w = 0; w <= weeks; w++) {
    const date = addDays(b.session_date, w * 7);
    const conf = await conflicts(c.env.DB, { ...b, session_date: date });
    if (conf.length) {
      allConflicts.push({ date, conflicts: conf });
      if (!b.force) continue;
    }
    const r = await c.env.DB.prepare(
      `INSERT INTO schedules (activity_id, coach_id, room_id, session_date, start_time, end_time, age_category, capacity, status, recurrence_group, replacement_coach_id, is_published, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(b.activity_id, b.coach_id ?? null, b.room_id ?? null, date, b.start_time, b.end_time, b.age_category ?? null, b.capacity ?? 20, b.status ?? 'scheduled', group, b.replacement_coach_id ?? null, b.is_published ?? 1, b.notes ?? null, c.get('user').id).first<{ id: number }>();
    created.push(r!.id);
  }
  if (!created.length && allConflicts.length) throw new HttpError(409, 'Conflit d’horaire détecté', { conflicts: allConflicts });
  await audit(c, 'create', 'schedules', created.join(','), { weeks });
  return c.json({ created, skipped: allConflicts }, 201);
});

schedules.put('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'schedules:write');
  const id = Number(c.req.param('id'));
  const b = schedSchema.partial().parse(await c.req.json());
  const cur = await c.env.DB.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!cur) throw new HttpError(404, 'Séance introuvable');
  const next = { ...cur, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
  if (next.end_time <= next.start_time) throw new HttpError(400, 'Horaires invalides');
  const applyGroup = c.req.query('scope') === 'series' && cur.recurrence_group;
  if (next.status !== 'cancelled' && !b.force) {
    const conf = await conflicts(c.env.DB, next, [id]);
    if (conf.length) throw new HttpError(409, 'Conflit d’horaire détecté', { conflicts: conf });
  }
  const fields = ['activity_id', 'coach_id', 'room_id', 'session_date', 'start_time', 'end_time', 'age_category', 'capacity', 'status', 'replacement_coach_id', 'is_published', 'notes'];
  if (applyGroup) {
    const gf = fields.filter((f) => f !== 'session_date' && f in b);
    if (gf.length) {
      await c.env.DB.prepare(`UPDATE schedules SET ${gf.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE recurrence_group = ? AND session_date >= ?`)
        .bind(...gf.map((f) => next[f] ?? null), cur.recurrence_group, cur.session_date).run();
    }
  }
  await c.env.DB.prepare(`UPDATE schedules SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...fields.map((f) => next[f] ?? null), id).run();
  await audit(c, 'update', 'schedules', id, b);
  return c.json({ ok: true });
});

schedules.post('/:id{[0-9]+}/duplicate', async (c) => {
  assertPerm(c.get('user'), 'schedules:write');
  const id = Number(c.req.param('id'));
  const { session_date, start_time, end_time } = z.object({ session_date: zDate, start_time: zTime.optional(), end_time: zTime.optional() }).parse(await c.req.json());
  const cur = await c.env.DB.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!cur) throw new HttpError(404, 'Séance introuvable');
  const d: any = { ...cur, session_date, start_time: start_time ?? cur.start_time, end_time: end_time ?? cur.end_time };
  const conf = await conflicts(c.env.DB, d);
  if (conf.length) throw new HttpError(409, 'Conflit d’horaire détecté', { conflicts: conf });
  const r = await c.env.DB.prepare(
    `INSERT INTO schedules (activity_id, coach_id, room_id, session_date, start_time, end_time, age_category, capacity, status, is_published, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,'scheduled',?,?,?) RETURNING id`,
  ).bind(d.activity_id, d.coach_id, d.room_id, d.session_date, d.start_time, d.end_time, d.age_category, d.capacity, d.is_published, d.notes, c.get('user').id).first<{ id: number }>();
  await audit(c, 'duplicate', 'schedules', r!.id, { from: id });
  return c.json({ id: r!.id }, 201);
});

/** Copy a whole week to following weeks. */
schedules.post('/copy-week', async (c) => {
  assertPerm(c.get('user'), 'schedules:write');
  const { from, weeks } = z.object({ from: zDate, weeks: z.coerce.number().int().min(1).max(12) }).parse(await c.req.json());
  const src = await c.env.DB.prepare("SELECT * FROM schedules WHERE session_date BETWEEN ? AND ? AND status != 'cancelled'").bind(from, addDays(from, 6)).all<any>();
  let created = 0, skipped = 0;
  for (let w = 1; w <= weeks; w++) {
    for (const s of src.results) {
      const d = { ...s, session_date: addDays(s.session_date, w * 7) };
      if ((await conflicts(c.env.DB, d)).length) { skipped++; continue; }
      await c.env.DB.prepare(
        `INSERT INTO schedules (activity_id, coach_id, room_id, session_date, start_time, end_time, age_category, capacity, status, is_published, created_by)
         VALUES (?,?,?,?,?,?,?,?,'scheduled',?,?)`,
      ).bind(d.activity_id, d.coach_id, d.room_id, d.session_date, d.start_time, d.end_time, d.age_category, d.capacity, d.is_published, c.get('user').id).run();
      created++;
    }
  }
  await audit(c, 'copy_week', 'schedules', null, { from, weeks, created, skipped });
  return c.json({ created, skipped });
});

schedules.delete('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'schedules:delete');
  const id = Number(c.req.param('id'));
  const series = c.req.query('scope') === 'series';
  const cur = await c.env.DB.prepare('SELECT recurrence_group, session_date FROM schedules WHERE id = ?').bind(id).first<{ recurrence_group: string | null; session_date: string }>();
  if (!cur) throw new HttpError(404, 'Introuvable');
  const used = await c.env.DB.prepare('SELECT 1 FROM attendance WHERE schedule_id = ? LIMIT 1').bind(id).first();
  if (used) {
    await c.env.DB.prepare("UPDATE schedules SET status = 'cancelled' WHERE id = ?").bind(id).run();
  } else if (series && cur.recurrence_group) {
    await c.env.DB.prepare('DELETE FROM schedules WHERE recurrence_group = ? AND session_date >= ? AND id NOT IN (SELECT schedule_id FROM attendance WHERE schedule_id IS NOT NULL)').bind(cur.recurrence_group, cur.session_date).run();
  } else {
    await c.env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(id).run();
  }
  await audit(c, 'delete', 'schedules', id, { series });
  return c.json({ ok: true });
});

// ===================== CLIENT CHECK-INS (fréquentation) =====================
export const checkins = new Hono<AppEnv>();
checkins.post('/', async (c) => {
  assertPerm(c.get('user'), 'clients:write');
  const { client_id, schedule_id } = z.object({ client_id: z.coerce.number().int().positive(), schedule_id: z.coerce.number().int().positive().optional().nullable() }).parse(await c.req.json());
  const today = todayISO();
  const valid = await c.env.DB.prepare("SELECT id, end_date FROM subscriptions WHERE client_id = ? AND status = 'active' AND start_date <= ? AND end_date >= ? LIMIT 1").bind(client_id, today, today).first();
  await c.env.DB.prepare('INSERT INTO attendance (client_id, schedule_id, checked_in_at, created_by) VALUES (?,?,?,?)').bind(client_id, schedule_id ?? null, nowISO(), c.get('user').id).run();
  return c.json({ ok: true, subscription_valid: !!valid });
});
checkins.get('/', async (c) => {
  assertPerm(c.get('user'), 'clients:read');
  const date = c.req.query('date') || todayISO();
  const rows = await c.env.DB.prepare(
    `SELECT at.*, c.first_name, c.last_name, c.matricule FROM attendance at JOIN clients c ON c.id = at.client_id
     WHERE substr(at.checked_in_at,1,10) = ? ORDER BY at.id DESC`,
  ).bind(date).all();
  return c.json({ data: rows.results });
});

// ===================== EMPLOYEE ATTENDANCE (pointage) =====================
export const attendance = new Hono<AppEnv>();

function toMin(t?: string | null) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function computeAttendance(e: { check_in?: string | null; check_out?: string | null; break_minutes?: number; expected_start?: string | null; expected_end?: string | null; day_type?: string }) {
  if (e.day_type && e.day_type !== 'work') return { worked_minutes: 0, late_minutes: 0, early_leave_minutes: 0, overtime_minutes: 0 };
  const ci = toMin(e.check_in), co = toMin(e.check_out), es = toMin(e.expected_start), ee = toMin(e.expected_end);
  const worked = ci != null && co != null ? Math.max(0, co - ci - (e.break_minutes ?? 0)) : 0;
  const late = ci != null && es != null ? Math.max(0, ci - es) : 0;
  const early = co != null && ee != null ? Math.max(0, ee - co) : 0;
  const expected = es != null && ee != null ? ee - es - (e.break_minutes ?? 0) : null;
  const overtime = expected != null ? Math.max(0, worked - expected) : 0;
  return { worked_minutes: worked, late_minutes: late, early_leave_minutes: early, overtime_minutes: overtime };
}

attendance.get('/', async (c) => {
  const u = c.get('user');
  const q = c.req.query();
  const from = q.from || todayISO().slice(0, 7) + '-01';
  const to = q.to || todayISO();
  const params: unknown[] = [from, to];
  let w = 'WHERE ea.work_date BETWEEN ? AND ?';
  if (!can(u, 'attendance:read')) {
    assertPerm(u, 'self:read');
    w += ' AND ea.employee_id = ?';
    params.push(u.employee_id ?? -1);
  } else if (q.employee_id) (w += ' AND ea.employee_id = ?', params.push(q.employee_id));
  if (q.validated) (w += ' AND ea.is_validated = ?', params.push(q.validated));
  const rows = await c.env.DB.prepare(
    `SELECT ea.*, e.first_name || ' ' || e.last_name AS employee_name, e.matricule, e.position FROM employee_attendance ea
     JOIN employees e ON e.id = ea.employee_id ${w} ORDER BY ea.work_date DESC, e.last_name LIMIT 2000`,
  ).bind(...params).all();
  const sum = await c.env.DB.prepare(
    `SELECT ea.employee_id, e.first_name || ' ' || e.last_name AS employee_name, SUM(worked_minutes) AS worked, SUM(late_minutes) AS late,
      SUM(overtime_minutes) AS overtime, SUM(CASE WHEN day_type='absent' THEN 1 ELSE 0 END) AS absences,
      SUM(CASE WHEN day_type='leave' THEN 1 ELSE 0 END) AS leaves, SUM(sessions_count) AS sessions, SUM(is_validated) AS validated, COUNT(*) AS days
     FROM employee_attendance ea JOIN employees e ON e.id = ea.employee_id ${w} GROUP BY ea.employee_id ORDER BY employee_name`,
  ).bind(...params).all();
  return c.json({ data: rows.results, summary: sum.results });
});

const attSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  work_date: zDate,
  check_in: zTime.optional().nullable(),
  check_out: zTime.optional().nullable(),
  break_minutes: z.coerce.number().int().min(0).max(600).optional(),
  expected_start: zTime.optional().nullable(),
  expected_end: zTime.optional().nullable(),
  day_type: z.enum(['work', 'absent', 'leave', 'rest', 'holiday']).optional(),
  sessions_count: z.coerce.number().int().min(0).max(50).optional(),
  correction_reason: z.string().max(500).optional().nullable(),
});

async function upsertAttendance(c: Context<AppEnv>, b: z.infer<typeof attSchema>) {
  const existing = await c.env.DB.prepare('SELECT * FROM employee_attendance WHERE employee_id = ? AND work_date = ?').bind(b.employee_id, b.work_date).first<Record<string, any>>();
  if (existing?.is_validated) throw new HttpError(409, 'Pointage déjà validé : modification interdite');
  if (existing && !b.correction_reason && (existing.check_in !== (b.check_in ?? existing.check_in) || existing.check_out !== (b.check_out ?? existing.check_out)) && c.get('user').role !== 'coach') {
    // manual correction requires justification
    if (existing.check_in && b.check_in && existing.check_in !== b.check_in) throw new HttpError(400, 'Justification obligatoire pour une correction manuelle');
  }
  const merged = { ...(existing ?? {}), ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) } as any;
  const calc = computeAttendance(merged);
  await c.env.DB.prepare(
    `INSERT INTO employee_attendance (employee_id, work_date, check_in, check_out, break_minutes, expected_start, expected_end, day_type, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, sessions_count, correction_reason, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(employee_id, work_date) DO UPDATE SET check_in=excluded.check_in, check_out=excluded.check_out, break_minutes=excluded.break_minutes,
       expected_start=excluded.expected_start, expected_end=excluded.expected_end, day_type=excluded.day_type, worked_minutes=excluded.worked_minutes,
       late_minutes=excluded.late_minutes, early_leave_minutes=excluded.early_leave_minutes, overtime_minutes=excluded.overtime_minutes,
       sessions_count=excluded.sessions_count, correction_reason=COALESCE(excluded.correction_reason, correction_reason), updated_at=datetime('now')`,
  ).bind(merged.employee_id, merged.work_date, merged.check_in ?? null, merged.check_out ?? null, merged.break_minutes ?? 0, merged.expected_start ?? null, merged.expected_end ?? null, merged.day_type ?? 'work', calc.worked_minutes, calc.late_minutes, calc.early_leave_minutes, calc.overtime_minutes, merged.sessions_count ?? 0, merged.correction_reason ?? null, c.get('user').id).run();
  await audit(c, existing ? 'attendance_update' : 'attendance_create', 'employee_attendance', `${b.employee_id}:${b.work_date}`, b);
}

attendance.post('/', async (c) => {
  assertPerm(c.get('user'), 'attendance:write');
  await upsertAttendance(c, attSchema.parse(await c.req.json()));
  return c.json({ ok: true });
});

attendance.post('/validate', async (c) => {
  assertPerm(c.get('user'), 'attendance:write');
  const { ids, from, to } = z.object({ ids: z.array(z.number().int()).optional(), from: zDate.optional(), to: zDate.optional() }).parse(await c.req.json());
  if (ids?.length) {
    await c.env.DB.prepare(`UPDATE employee_attendance SET is_validated = 1, validated_by = ? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(c.get('user').id, ...ids).run();
  } else if (from && to) {
    await c.env.DB.prepare('UPDATE employee_attendance SET is_validated = 1, validated_by = ? WHERE work_date BETWEEN ? AND ?').bind(c.get('user').id, from, to).run();
  } else throw new HttpError(400, 'Sélection requise');
  await audit(c, 'attendance_validate', 'employee_attendance', null, { ids, from, to });
  return c.json({ ok: true });
});

/** Self check-in / check-out for coaches and staff with a linked employee profile. */
attendance.post('/self', async (c) => {
  const u = c.get('user');
  assertPerm(u, 'self:write');
  if (!u.employee_id) throw new HttpError(400, 'Aucun profil employé lié à ce compte');
  const { action } = z.object({ action: z.enum(['in', 'out']) }).parse(await c.req.json());
  const now = nowISO().slice(11, 16);
  const today = todayISO();
  const ex = await c.env.DB.prepare('SELECT * FROM employee_attendance WHERE employee_id = ? AND work_date = ?').bind(u.employee_id, today).first<Record<string, any>>();
  if (action === 'in' && ex?.check_in) throw new HttpError(409, 'Entrée déjà pointée');
  if (action === 'out' && !ex?.check_in) throw new HttpError(409, 'Pointez d’abord votre entrée');
  const sessions = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM schedules s JOIN coaches co ON co.id = COALESCE(s.replacement_coach_id, s.coach_id) WHERE co.employee_id = ? AND s.session_date = ? AND s.status != 'cancelled'`,
  ).bind(u.employee_id, today).first<{ n: number }>();
  await upsertAttendance(c, {
    employee_id: u.employee_id,
    work_date: today,
    check_in: action === 'in' ? now : ex?.check_in,
    check_out: action === 'out' ? now : null,
    sessions_count: sessions?.n ?? 0,
    day_type: 'work',
  });
  return c.json({ ok: true, time: now });
});

// ===================== LEAVES decision =====================
export const leaveActions = new Hono<AppEnv>();
leaveActions.post('/:id{[0-9]+}/decide', async (c) => {
  assertPerm(c.get('user'), 'leaves:write');
  const id = Number(c.req.param('id'));
  const { decision } = z.object({ decision: z.enum(['approved', 'rejected']) }).parse(await c.req.json());
  const l = await c.env.DB.prepare('SELECT * FROM leaves WHERE id = ?').bind(id).first<{ status: string; employee_id: number; leave_type: string; days: number; start_date: string; end_date: string }>();
  if (!l) throw new HttpError(404, 'Introuvable');
  if (l.status !== 'pending') throw new HttpError(409, 'Déjà traité');
  const stmts = [c.env.DB.prepare("UPDATE leaves SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?").bind(decision, c.get('user').id, id)];
  if (decision === 'approved') {
    if (l.leave_type === 'paid') stmts.push(c.env.DB.prepare('UPDATE employees SET leave_balance = leave_balance - ? WHERE id = ?').bind(l.days, l.employee_id));
    const dayType = ['paid', 'sick', 'unpaid'].includes(l.leave_type) ? 'leave' : 'absent';
    for (let d = l.start_date; d <= l.end_date; d = addDays(d, 1)) {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO employee_attendance (employee_id, work_date, day_type, correction_reason, created_by) VALUES (?,?,?,?,?)
         ON CONFLICT(employee_id, work_date) DO UPDATE SET day_type = excluded.day_type, correction_reason = excluded.correction_reason WHERE is_validated = 0`,
      ).bind(l.employee_id, d, dayType, `Congé #${id} (${l.leave_type})`, c.get('user').id));
    }
  }
  await c.env.DB.batch(stmts);
  await audit(c, 'leave_' + decision, 'leaves', id);
  return c.json({ ok: true });
});

// ===================== ME (coach & staff self-service) =====================
export const me = new Hono<AppEnv>();
me.get('/overview', async (c) => {
  const u = c.get('user');
  assertPerm(u, 'self:read');
  if (!u.employee_id) return c.json({ employee: null, sessions: [], attendance: [] });
  const emp = await c.env.DB.prepare('SELECT id, matricule, first_name, last_name, position, hire_date, phone, email FROM employees WHERE id = ?').bind(u.employee_id).first();
  const from = todayISO();
  const sessions = await listSchedules(c.env.DB, addDays(from, -7), addDays(from, 21), ' AND (co.employee_id = ? OR rc.employee_id = ?)', [u.employee_id, u.employee_id]);
  const att = await c.env.DB.prepare('SELECT * FROM employee_attendance WHERE employee_id = ? ORDER BY work_date DESC LIMIT 31').bind(u.employee_id).all();
  return c.json({ employee: emp, sessions, attendance: att.results });
});
