import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { assertPerm, can, generateAccessCode, hashCode } from '../lib/auth';
import { addDays, audit, HttpError, todayISO, nowISO } from '../lib/util';

// ===================== DASHBOARD =====================
export const dashboard = new Hono<AppEnv>();

dashboard.get('/', async (c) => {
  const u = c.get('user');
  assertPerm(u, 'dashboard:read');
  const db = c.env.DB;
  const today = todayISO();
  const from = c.req.query('from') || today.slice(0, 7) + '-01';
  const to = c.req.query('to') || today;
  const fin = can(u, 'finance_stats:read');
  const one = async <T = any>(sql: string, ...p: unknown[]) => (await db.prepare(sql).bind(...p).first<T>())!;
  const all = async (sql: string, ...p: unknown[]) => (await db.prepare(sql).bind(...p).all()).results;

  const VALID = `EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = c.id AND s.status = 'active' AND s.start_date <= ?1 AND s.end_date >= ?1)`;
  const clients = await one(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN ${VALID} THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN ${VALID} AND cc.code='adult' THEN 1 ELSE 0 END) AS adults,
      SUM(CASE WHEN ${VALID} AND cc.code='junior' THEN 1 ELSE 0 END) AS juniors,
      SUM(CASE WHEN ${VALID} AND cc.code='child' THEN 1 ELSE 0 END) AS children,
      SUM(CASE WHEN c.registration_date BETWEEN ?2 AND ?3 THEN 1 ELSE 0 END) AS new_clients
     FROM clients c LEFT JOIN client_categories cc ON cc.id = c.category_id WHERE c.archived_at IS NULL`,
    today, from, to,
  );
  const subsK = await one(
    `SELECT COUNT(DISTINCT CASE WHEN status='active' AND end_date < ?1 AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.client_id = s.client_id AND s2.end_date >= ?1 AND s2.status IN ('active','suspended')) THEN client_id END) AS expired,
      SUM(CASE WHEN status='active' AND end_date BETWEEN ?1 AND ?2 THEN 1 ELSE 0 END) AS expiring7
     FROM subscriptions s`,
    today, addDays(today, 7),
  );
  const staff = await one(
    `SELECT SUM(CASE WHEN position='coach' THEN 1 ELSE 0 END) AS coaches, COUNT(*) AS employees FROM employees WHERE archived_at IS NULL AND status='active'`,
  );
  const todayVisits = await one(`SELECT COUNT(*) AS n FROM attendance WHERE substr(checked_in_at,1,10) = ?`, today);
  const kpis: Record<string, number> = {
    clients_total: clients.total ?? 0,
    clients_active: clients.active ?? 0,
    clients_inactive: (clients.total ?? 0) - (clients.active ?? 0),
    adults_active: clients.adults ?? 0,
    juniors_active: clients.juniors ?? 0,
    children_active: clients.children ?? 0,
    new_clients: clients.new_clients ?? 0,
    subs_expired: subsK.expired ?? 0,
    subs_expiring_7: subsK.expiring7 ?? 0,
    coaches: staff.coaches ?? 0,
    employees: staff.employees ?? 0,
    visits_today: todayVisits.n ?? 0,
  };
  const charts: Record<string, unknown> = {};

  charts.clients_by_category = await all(
    `SELECT cc.name AS name, COUNT(*) AS value FROM clients c JOIN client_categories cc ON cc.id = c.category_id
     WHERE c.archived_at IS NULL AND ${VALID} GROUP BY cc.id ORDER BY value DESC`,
    today,
  );
  charts.subs_by_plan = await all(
    `SELECT p.name AS name, COUNT(*) AS value FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
     WHERE s.status = 'active' AND s.end_date >= ? GROUP BY p.id ORDER BY value DESC`,
    today,
  );
  charts.registrations = await all(
    `SELECT substr(registration_date,1,7) AS month, COUNT(*) AS value FROM clients WHERE registration_date >= ? GROUP BY month ORDER BY month`,
    addDays(today, -365),
  );
  charts.popular_activities = await all(
    `SELECT a.name AS name, COUNT(*) AS value FROM clients c, json_each(c.activities) j JOIN activities a ON a.id = j.value
     WHERE c.archived_at IS NULL GROUP BY a.id ORDER BY value DESC LIMIT 10`,
  );
  charts.attendance_by_hour = await all(
    `SELECT CAST(substr(checked_in_at,12,2) AS INTEGER) AS hour, COUNT(*) AS value FROM attendance WHERE substr(checked_in_at,1,10) BETWEEN ? AND ? GROUP BY hour ORDER BY hour`,
    from, to,
  );
  charts.renewal = await all(
    `SELECT substr(s.end_date,1,7) AS month, COUNT(*) AS ended,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM subscriptions n WHERE n.client_id = s.client_id AND n.id != s.id AND n.start_date > s.start_date AND n.start_date <= date(s.end_date,'+30 days')) THEN 1 ELSE 0 END) AS renewed
     FROM subscriptions s WHERE s.end_date BETWEEN ? AND ? AND s.status != 'cancelled' GROUP BY month ORDER BY month`,
    addDays(today, -365), today,
  );

  if (fin) {
    const billedSubs = await one(`SELECT COALESCE(SUM(final_price),0) AS v FROM subscriptions WHERE substr(created_at,1,10) BETWEEN ? AND ? AND status != 'cancelled'`, from, to);
    const billedInv = await one(`SELECT COALESCE(SUM(total_ttc),0) AS v FROM invoices WHERE issue_date BETWEEN ? AND ? AND status != 'cancelled'`, from, to);
    const otherRev = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE cancelled_at IS NULL AND subscription_id IS NULL AND invoice_id IS NULL AND substr(paid_at,1,10) BETWEEN ? AND ?`, from, to);
    const collected = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE cancelled_at IS NULL AND substr(paid_at,1,10) BETWEEN ? AND ?`, from, to);
    const expenses = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE cancelled_at IS NULL AND spent_at BETWEEN ? AND ?`, from, to);
    const unpaid = await one(
      `SELECT (SELECT COALESCE(SUM(final_price - amount_paid),0) FROM subscriptions WHERE status NOT IN ('cancelled','replaced') AND final_price > amount_paid)
            + (SELECT COALESCE(SUM(total_ttc - amount_paid),0) FROM invoices WHERE status IN ('unpaid','partial')) AS v`,
    );
    const payrollMass = await one(
      `SELECT COALESCE(SUM(r.gross),0) AS v FROM payroll_records r JOIN payroll_periods p ON p.id = r.period_id WHERE p.period BETWEEN ? AND ?`,
      from.slice(0, 7), to.slice(0, 7),
    );
    Object.assign(kpis, {
      revenue: billedSubs.v + billedInv.v + otherRev.v,
      collected: collected.v,
      expenses: expenses.v,
      unpaid: unpaid.v,
      payroll: payrollMass.v,
      result: collected.v - expenses.v,
    });
    const start12 = addDays(today, -365).slice(0, 7) + '-01';
    charts.revenue_monthly = await all(
      `WITH m AS (SELECT substr(created_at,1,7) AS month, SUM(final_price) AS billed FROM subscriptions WHERE status != 'cancelled' AND created_at >= ? GROUP BY month
                  UNION ALL SELECT substr(issue_date,1,7), SUM(total_ttc) FROM invoices WHERE status != 'cancelled' AND issue_date >= ? GROUP BY 1),
            p AS (SELECT substr(paid_at,1,7) AS month, SUM(amount) AS collected FROM payments WHERE cancelled_at IS NULL AND paid_at >= ? GROUP BY month),
            e AS (SELECT substr(spent_at,1,7) AS month, SUM(amount) AS expenses FROM expenses WHERE cancelled_at IS NULL AND spent_at >= ? GROUP BY month),
            months AS (SELECT month FROM m UNION SELECT month FROM p UNION SELECT month FROM e)
       SELECT months.month, COALESCE((SELECT SUM(billed) FROM m WHERE m.month = months.month),0) AS billed,
              COALESCE(p.collected,0) AS collected, COALESCE(e.expenses,0) AS expenses
       FROM months LEFT JOIN p ON p.month = months.month LEFT JOIN e ON e.month = months.month ORDER BY months.month`,
      start12, start12, start12, start12,
    );
    charts.expenses_by_category = await all(
      `SELECT ec.name AS name, SUM(e.amount) AS value FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.cancelled_at IS NULL AND e.spent_at BETWEEN ? AND ? GROUP BY ec.id ORDER BY value DESC`,
      from, to,
    );
    charts.payroll_monthly = await all(
      `SELECT p.period AS month, SUM(r.gross) AS gross, SUM(r.net_to_pay) AS net FROM payroll_records r JOIN payroll_periods p ON p.id = r.period_id GROUP BY p.period ORDER BY p.period LIMIT 24`,
    );
    charts.collected_vs_unpaid = await all(
      `SELECT substr(start_date,1,7) AS month, SUM(amount_paid) AS collected, SUM(final_price - amount_paid) AS unpaid
       FROM subscriptions WHERE status NOT IN ('cancelled','replaced') AND start_date >= ? GROUP BY month ORDER BY month`,
      start12,
    );
    charts.payment_methods = await all(
      `SELECT method AS name, SUM(amount) AS value FROM payments WHERE cancelled_at IS NULL AND substr(paid_at,1,10) BETWEEN ? AND ? GROUP BY method`,
      from, to,
    );
  }
  return c.json({ from, to, kpis, charts, finance: fin });
});

// ===================== REPORTS =====================
export const reports = new Hono<AppEnv>();
type Report = { perm: string; title: string; sql: string; params: (f: string, t: string, today: string) => unknown[] };
const R: Record<string, Report> = {
  active_clients: { perm: 'clients:read', title: 'Clients actifs', params: (_f, _t, d) => [d, d],
    sql: `SELECT c.matricule, c.last_name AS nom, c.first_name AS prenom, cc.name AS categorie, c.phone AS telephone, p.name AS formule, s.end_date AS fin
          FROM clients c JOIN subscriptions s ON s.client_id = c.id AND s.status='active' AND s.start_date <= ? AND s.end_date >= ?
          JOIN subscription_plans p ON p.id = s.plan_id LEFT JOIN client_categories cc ON cc.id = c.category_id WHERE c.archived_at IS NULL ORDER BY c.last_name` },
  adults: { perm: 'clients:read', title: 'Adultes', params: () => [], sql: `SELECT c.matricule, c.last_name AS nom, c.first_name AS prenom, c.birth_date AS naissance, c.phone AS telephone, c.status AS statut FROM clients c JOIN client_categories cc ON cc.id = c.category_id WHERE cc.code='adult' AND c.archived_at IS NULL ORDER BY c.last_name` },
  juniors: { perm: 'clients:read', title: 'Juniors', params: () => [], sql: `SELECT c.matricule, c.last_name AS nom, c.first_name AS prenom, c.birth_date AS naissance, g.full_name AS tuteur, g.phone AS tel_tuteur FROM clients c JOIN client_categories cc ON cc.id = c.category_id LEFT JOIN guardians g ON g.client_id = c.id WHERE cc.code='junior' AND c.archived_at IS NULL ORDER BY c.last_name` },
  children: { perm: 'clients:read', title: 'Enfants', params: () => [], sql: `SELECT c.matricule, c.last_name AS nom, c.first_name AS prenom, c.birth_date AS naissance, g.full_name AS tuteur, g.phone AS tel_tuteur FROM clients c JOIN client_categories cc ON cc.id = c.category_id LEFT JOIN guardians g ON g.client_id = c.id WHERE cc.code='child' AND c.archived_at IS NULL ORDER BY c.last_name` },
  expired: { perm: 'subscriptions:read', title: 'Abonnements expirés', params: (_f, _t, d) => [d, d],
    sql: `SELECT c.matricule, c.last_name AS nom, c.first_name AS prenom, c.phone AS telephone, p.name AS formule, s.end_date AS expire_le FROM subscriptions s JOIN clients c ON c.id = s.client_id JOIN subscription_plans p ON p.id = s.plan_id
          WHERE s.status='active' AND s.end_date < ? AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.client_id = s.client_id AND s2.end_date >= ? AND s2.status IN ('active','suspended')) AND s.end_date = (SELECT MAX(s3.end_date) FROM subscriptions s3 WHERE s3.client_id = s.client_id AND s3.status = 'active') ORDER BY s.end_date DESC` },
  unpaid: { perm: 'subscriptions:read', title: 'Impayés', params: () => [],
    sql: `SELECT s.reference, c.matricule, c.last_name AS nom, c.first_name AS prenom, c.phone AS telephone, p.name AS formule, s.final_price AS du_m, s.amount_paid AS paye_m, s.final_price - s.amount_paid AS reste_m
          FROM subscriptions s JOIN clients c ON c.id = s.client_id JOIN subscription_plans p ON p.id = s.plan_id WHERE s.status NOT IN ('cancelled','replaced') AND s.final_price > s.amount_paid ORDER BY reste_m DESC` },
  registrations: { perm: 'clients:read', title: 'Inscriptions', params: (f, t) => [f, t], sql: `SELECT c.registration_date AS date, c.matricule, c.last_name AS nom, c.first_name AS prenom, cc.name AS categorie FROM clients c LEFT JOIN client_categories cc ON cc.id = c.category_id WHERE c.registration_date BETWEEN ? AND ? ORDER BY c.registration_date` },
  renewals: { perm: 'subscriptions:read', title: 'Renouvellements', params: (f, t) => [f, t],
    sql: `SELECT substr(h.created_at,1,10) AS date, s.reference, c.last_name AS nom, c.first_name AS prenom, p.name AS formule, s.final_price AS montant_m FROM subscription_history h JOIN subscriptions s ON s.id = h.subscription_id JOIN clients c ON c.id = s.client_id JOIN subscription_plans p ON p.id = s.plan_id WHERE h.action = 'renewed' AND substr(h.created_at,1,10) BETWEEN ? AND ? ORDER BY h.created_at` },
  daily_cash: { perm: 'cash:read', title: 'Journal de caisse', params: (f, t) => [f, t],
    sql: `SELECT substr(t.created_at,1,16) AS date, t.reference, CASE t.direction WHEN 'in' THEN 'Entrée' ELSE 'Sortie' END AS sens, t.method AS mode, t.amount AS montant_m, t.justification, u.display_name AS utilisateur FROM cash_transactions t JOIN users u ON u.id = t.created_by WHERE substr(t.created_at,1,10) BETWEEN ? AND ? ORDER BY t.id` },
  revenue: { perm: 'finance_stats:read', title: 'Recettes', params: (f, t) => [f, t],
    sql: `SELECT substr(p.paid_at,1,10) AS date, p.reference, r.number AS recu, p.source, p.method AS mode, p.amount AS montant_m, c.last_name || ' ' || c.first_name AS client FROM payments p LEFT JOIN receipts r ON r.payment_id = p.id LEFT JOIN clients c ON c.id = p.client_id WHERE p.cancelled_at IS NULL AND substr(p.paid_at,1,10) BETWEEN ? AND ? ORDER BY p.paid_at` },
  expenses: { perm: 'expenses:read', title: 'Dépenses', params: (f, t) => [f, t],
    sql: `SELECT e.spent_at AS date, e.reference, ec.name AS categorie, e.label AS libelle, e.method AS mode, e.amount AS montant_m FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE e.cancelled_at IS NULL AND e.spent_at BETWEEN ? AND ? ORDER BY e.spent_at` },
  profitability: { perm: 'finance_stats:read', title: 'Rentabilité mensuelle', params: (f, t) => [f, t, f, t],
    sql: `WITH p AS (SELECT substr(paid_at,1,7) AS mois, SUM(amount) AS recettes FROM payments WHERE cancelled_at IS NULL AND substr(paid_at,1,10) BETWEEN ? AND ? GROUP BY mois),
          e AS (SELECT substr(spent_at,1,7) AS mois, SUM(amount) AS depenses FROM expenses WHERE cancelled_at IS NULL AND spent_at BETWEEN ? AND ? GROUP BY mois),
          m AS (SELECT mois FROM p UNION SELECT mois FROM e)
          SELECT m.mois, COALESCE(p.recettes,0) AS recettes_m, COALESCE(e.depenses,0) AS depenses_m, COALESCE(p.recettes,0) - COALESCE(e.depenses,0) AS resultat_m FROM m LEFT JOIN p ON p.mois = m.mois LEFT JOIN e ON e.mois = m.mois ORDER BY m.mois` },
  attendance: { perm: 'attendance:read', title: 'Pointage', params: (f, t) => [f, t],
    sql: `SELECT e.matricule, e.last_name || ' ' || e.first_name AS employe, COUNT(*) AS jours, ROUND(SUM(worked_minutes)/60.0,2) AS heures, ROUND(SUM(overtime_minutes)/60.0,2) AS heures_sup, SUM(late_minutes) AS retard_min, SUM(CASE WHEN day_type='absent' THEN 1 ELSE 0 END) AS absences FROM employee_attendance a JOIN employees e ON e.id = a.employee_id WHERE a.work_date BETWEEN ? AND ? GROUP BY e.id ORDER BY employe` },
  salaries: { perm: 'payroll:read', title: 'Salaires', params: (f, t) => [f.slice(0, 7), t.slice(0, 7)],
    sql: `SELECT p.period AS periode, r.number, e.last_name || ' ' || e.first_name AS employe, r.gross AS brut_m, r.social_contrib AS cnss_m, r.irpp AS irpp_m, r.net AS net_m, r.net_to_pay AS net_a_payer_m, r.paid_at AS paye_le FROM payroll_records r JOIN payroll_periods p ON p.id = r.period_id JOIN employees e ON e.id = r.employee_id WHERE p.period BETWEEN ? AND ? ORDER BY p.period, employe` },
  coaches: { perm: 'coaches:read', title: 'Coachs', params: (f, t) => [f, t],
    sql: `SELECT e.last_name || ' ' || e.first_name AS coach, co.specialties AS specialites, COUNT(s.id) AS seances, SUM(CASE WHEN s.status='cancelled' THEN 1 ELSE 0 END) AS annulees, (SELECT COUNT(*) FROM attendance at JOIN schedules s2 ON s2.id = at.schedule_id WHERE COALESCE(s2.replacement_coach_id, s2.coach_id) = co.id) AS participants FROM coaches co JOIN employees e ON e.id = co.employee_id LEFT JOIN schedules s ON COALESCE(s.replacement_coach_id, s.coach_id) = co.id AND s.session_date BETWEEN ? AND ? GROUP BY co.id ORDER BY coach` },
  maintenance: { perm: 'maintenance:read', title: 'Maintenance', params: (f, t) => [f, t],
    sql: `SELECT m.planned_date AS prevue, m.done_date AS realisee, eq.code, eq.name AS equipement, m.kind AS type, m.status AS statut, m.technician AS technicien, m.cost AS cout_m FROM maintenance_records m JOIN equipment eq ON eq.id = m.equipment_id WHERE m.planned_date BETWEEN ? AND ? ORDER BY m.planned_date` },
  annual: { perm: 'finance_stats:read', title: 'Rapport annuel de gestion', params: (f) => [f.slice(0, 4), f.slice(0, 4), f.slice(0, 4), f.slice(0, 4)],
    sql: `WITH months(m) AS (VALUES ('01'),('02'),('03'),('04'),('05'),('06'),('07'),('08'),('09'),('10'),('11'),('12'))
          SELECT ?1 || '-' || m AS mois,
            (SELECT COUNT(*) FROM clients WHERE substr(registration_date,1,7) = ?1 || '-' || m) AS inscriptions,
            (SELECT COUNT(*) FROM subscriptions WHERE substr(start_date,1,7) = ?1 || '-' || m AND status != 'cancelled') AS abonnements,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE cancelled_at IS NULL AND substr(paid_at,1,7) = ?1 || '-' || m) AS recettes_m,
            (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE cancelled_at IS NULL AND substr(spent_at,1,7) = ?1 || '-' || m) AS depenses_m,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE cancelled_at IS NULL AND substr(paid_at,1,7) = ?1 || '-' || m) - (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE cancelled_at IS NULL AND substr(spent_at,1,7) = ?1 || '-' || m) AS resultat_m
          FROM months` },
};

reports.get('/', (c) => c.json(Object.entries(R).filter(([, r]) => can(c.get('user'), r.perm)).map(([k, r]) => ({ key: k, title: r.title }))));
reports.get('/:key', async (c) => {
  const r = R[c.req.param('key')];
  if (!r) throw new HttpError(404, 'Rapport inconnu');
  assertPerm(c.get('user'), r.perm);
  const today = todayISO();
  const from = c.req.query('from') || today.slice(0, 7) + '-01';
  const to = c.req.query('to') || today;
  const rows = await c.env.DB.prepare(r.sql).bind(...r.params(from, to, today)).all();
  return c.json({ title: r.title, from, to, rows: rows.results });
});

// ===================== NOTIFICATIONS =====================
export const notifications = new Hono<AppEnv>();

async function generate(db: D1Database) {
  const today = todayISO();
  const ins = (kind: string, title: string, body: string, link: string, key: string) =>
    db.prepare('INSERT OR IGNORE INTO notifications (kind, title, body, link, dedupe_key) VALUES (?,?,?,?,?)').bind(kind, title, body, link, key);
  const stmts: D1PreparedStatement[] = [];
  for (const d of [7, 3, 0]) {
    const rows = await db.prepare(
      `SELECT s.id, s.end_date, c.first_name, c.last_name FROM subscriptions s JOIN clients c ON c.id = s.client_id WHERE s.status='active' AND s.end_date = ?`,
    ).bind(addDays(today, d)).all<{ id: number; end_date: string; first_name: string; last_name: string }>();
    for (const r of rows.results)
      stmts.push(ins('expiring', d === 0 ? 'Abonnement expire aujourd’hui' : `Abonnement expire dans ${d} jours`, `${r.first_name} ${r.last_name} — fin le ${r.end_date}`, `/admin/subscriptions?id=${r.id}`, `exp_${r.id}_${d}`));
  }
  const expired = await db.prepare(
    `SELECT s.id, c.first_name, c.last_name, s.end_date FROM subscriptions s JOIN clients c ON c.id = s.client_id WHERE s.status='active' AND s.end_date = ?`,
  ).bind(addDays(today, -1)).all<{ id: number; first_name: string; last_name: string; end_date: string }>();
  for (const r of expired.results) stmts.push(ins('expired', 'Abonnement expiré', `${r.first_name} ${r.last_name} — expiré le ${r.end_date}`, `/admin/subscriptions?id=${r.id}`, `expd_${r.id}`));
  const late = await db.prepare(
    `SELECT s.id, c.first_name, c.last_name, s.final_price - s.amount_paid AS due FROM subscriptions s JOIN clients c ON c.id = s.client_id
     WHERE s.status NOT IN ('cancelled','replaced') AND s.final_price > s.amount_paid AND s.start_date <= ?`,
  ).bind(addDays(today, -7)).all<{ id: number; first_name: string; last_name: string; due: number }>();
  for (const r of late.results) stmts.push(ins('unpaid', 'Paiement en retard', `${r.first_name} ${r.last_name} — reste ${(r.due / 1000).toFixed(3)} TND`, `/admin/subscriptions?id=${r.id}`, `late_${r.id}_${today.slice(0, 7)}`));
  const pendingLeaves = await db.prepare("SELECT l.id, e.first_name, e.last_name, l.start_date FROM leaves l JOIN employees e ON e.id = l.employee_id WHERE l.status = 'pending'").all<any>();
  for (const r of pendingLeaves.results) stmts.push(ins('leave', 'Congé à valider', `${r.first_name} ${r.last_name} — à partir du ${r.start_date}`, '/admin/leaves', `leave_${r.id}`));
  const absences = await db.prepare("SELECT a.id, e.first_name, e.last_name, a.work_date FROM employee_attendance a JOIN employees e ON e.id = a.employee_id WHERE a.day_type='absent' AND a.work_date >= ?").bind(addDays(today, -3)).all<any>();
  for (const r of absences.results) stmts.push(ins('absence', 'Absence', `${r.first_name} ${r.last_name} — ${r.work_date}`, '/admin/attendance', `abs_${r.id}`));
  const maint = await db.prepare(
    "SELECT m.id, e.name, m.planned_date FROM maintenance_records m JOIN equipment e ON e.id = m.equipment_id WHERE m.status='planned' AND m.planned_date <= ?",
  ).bind(addDays(today, 7)).all<any>();
  for (const r of maint.results) stmts.push(ins('maintenance', 'Maintenance à prévoir', `${r.name} — prévue le ${r.planned_date}`, '/admin/maintenance', `maint_${r.id}`));
  if (Number(today.slice(8, 10)) >= 25) {
    const period = today.slice(0, 7);
    const p = await db.prepare('SELECT 1 FROM payroll_periods WHERE period = ?').bind(period).first();
    if (!p) stmts.push(ins('payroll', 'Salaires à préparer', `La paie de ${period} n’est pas encore préparée`, '/admin/payroll', `payroll_${period}`));
  }
  if (stmts.length) await db.batch(stmts);
}

notifications.get('/', async (c) => {
  assertPerm(c.get('user'), 'notifications:read');
  await generate(c.env.DB);
  const u = c.get('user');
  const hidden: string[] = [];
  if (!can(u, 'leaves:read')) hidden.push('leave', 'absence');
  if (!can(u, 'payroll:read')) hidden.push('payroll');
  if (!can(u, 'maintenance:read')) hidden.push('maintenance');
  if (!can(u, 'finance_stats:read')) hidden.push('cash_gap');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM notifications ${hidden.length ? `WHERE kind NOT IN (${hidden.map(() => '?').join(',')})` : ''} ORDER BY read_at IS NOT NULL, id DESC LIMIT 200`,
  ).bind(...hidden).all<{ read_at: string | null }>();
  return c.json({ data: rows.results, unread: rows.results.filter((r) => !r.read_at).length });
});
notifications.post('/read', async (c) => {
  assertPerm(c.get('user'), 'notifications:write');
  const { ids } = z.object({ ids: z.array(z.number().int()).optional() }).parse(await c.req.json().catch(() => ({})));
  if (ids?.length) await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(nowISO(), ...ids).run();
  else await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').bind(nowISO()).run();
  return c.json({ ok: true });
});

// ===================== USERS =====================
export const users = new Hono<AppEnv>();
users.get('/', async (c) => {
  assertPerm(c.get('user'), 'users:read');
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.display_name, u.code_hint, u.employee_id, u.extra_permissions, u.denied_permissions, u.is_active, u.last_login_at, u.created_at, r.code AS role, r.name AS role_name,
     e.first_name || ' ' || e.last_name AS employee_name,
     (SELECT COUNT(*) FROM user_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > datetime('now')) AS active_sessions
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN employees e ON e.id = u.employee_id WHERE u.archived_at IS NULL ORDER BY u.id`,
  ).all();
  return c.json({ data: rows.results });
});
users.get('/meta', async (c) => {
  assertPerm(c.get('user'), 'users:read');
  const roles = await c.env.DB.prepare('SELECT * FROM roles ORDER BY id').all();
  const perms = await c.env.DB.prepare('SELECT * FROM permissions ORDER BY module, action').all();
  const rp = await c.env.DB.prepare('SELECT rp.role_id, p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id').all();
  return c.json({ roles: roles.results, permissions: perms.results, role_permissions: rp.results });
});
const userSchema = z.object({
  display_name: z.string().trim().min(2).max(80),
  role: z.enum(['super_admin', 'admin', 'receptionist', 'coach']),
  employee_id: z.coerce.number().int().positive().optional().nullable(),
  extra_permissions: z.array(z.string()).optional(),
  denied_permissions: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});
users.post('/', async (c) => {
  assertPerm(c.get('user'), 'users:write');
  const b = userSchema.parse(await c.req.json());
  const code = generateAccessCode();
  const role = await c.env.DB.prepare('SELECT id FROM roles WHERE code = ?').bind(b.role).first<{ id: number }>();
  const r = await c.env.DB.prepare(
    'INSERT INTO users (display_name, role_id, code_lookup, code_hint, employee_id, extra_permissions, denied_permissions, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
  ).bind(b.display_name, role!.id, await hashCode(code, c.env.CODE_PEPPER), code.slice(-2), b.employee_id ?? null, JSON.stringify(b.extra_permissions ?? []), JSON.stringify(b.denied_permissions ?? []), c.get('user').id).first<{ id: number }>();
  await audit(c, 'user_create', 'users', r!.id, { role: b.role });
  return c.json({ id: r!.id, code }, 201);
});
users.put('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'users:write');
  const id = Number(c.req.param('id'));
  const b = userSchema.partial().parse(await c.req.json());
  if (id === c.get('user').id && (b.is_active === false || (b.role && b.role !== 'super_admin'))) throw new HttpError(400, 'Vous ne pouvez pas vous désactiver ou vous rétrograder');
  const sets: string[] = [];
  const p: unknown[] = [];
  if (b.display_name) (sets.push('display_name = ?'), p.push(b.display_name));
  if (b.role) {
    const role = await c.env.DB.prepare('SELECT id FROM roles WHERE code = ?').bind(b.role).first<{ id: number }>();
    sets.push('role_id = ?'), p.push(role!.id);
  }
  if (b.employee_id !== undefined) (sets.push('employee_id = ?'), p.push(b.employee_id));
  if (b.extra_permissions) (sets.push('extra_permissions = ?'), p.push(JSON.stringify(b.extra_permissions)));
  if (b.denied_permissions) (sets.push('denied_permissions = ?'), p.push(JSON.stringify(b.denied_permissions)));
  if (b.is_active !== undefined) (sets.push('is_active = ?'), p.push(b.is_active ? 1 : 0));
  if (sets.length) await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...p, id).run();
  if (b.is_active === false) await c.env.DB.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ?").bind(id).run();
  await audit(c, 'user_update', 'users', id, b);
  return c.json({ ok: true });
});
users.post('/:id{[0-9]+}/reset-code', async (c) => {
  assertPerm(c.get('user'), 'users:write');
  const id = Number(c.req.param('id'));
  const code = generateAccessCode();
  await c.env.DB.prepare("UPDATE users SET code_lookup = ?, code_hint = ?, updated_at = datetime('now') WHERE id = ?").bind(await hashCode(code, c.env.CODE_PEPPER), code.slice(-2), id).run();
  await c.env.DB.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ?").bind(id).run();
  await audit(c, 'user_reset_code', 'users', id);
  return c.json({ code });
});
users.post('/:id{[0-9]+}/revoke', async (c) => {
  assertPerm(c.get('user'), 'users:write');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").bind(id).run();
  await audit(c, 'user_revoke_sessions', 'users', id);
  return c.json({ ok: true });
});
users.post('/:id{[0-9]+}/archive', async (c) => {
  assertPerm(c.get('user'), 'users:delete');
  const id = Number(c.req.param('id'));
  if (id === c.get('user').id) throw new HttpError(400, 'Impossible');
  await c.env.DB.prepare("UPDATE users SET archived_at = datetime('now'), is_active = 0 WHERE id = ?").bind(id).run();
  await c.env.DB.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ?").bind(id).run();
  await audit(c, 'user_archive', 'users', id);
  return c.json({ ok: true });
});
users.post('/roles/:role/permissions', async (c) => {
  assertPerm(c.get('user'), 'users:write');
  const role = c.req.param('role');
  if (role === 'super_admin') throw new HttpError(400, 'Le Super Admin a toujours tous les droits');
  const { permissions } = z.object({ permissions: z.array(z.string()) }).parse(await c.req.json());
  const r = await c.env.DB.prepare('SELECT id FROM roles WHERE code = ?').bind(role).first<{ id: number }>();
  if (!r) throw new HttpError(404, 'Rôle inconnu');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(r.id),
    ...permissions.map((p) => c.env.DB.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?').bind(r.id, p)),
  ]);
  await audit(c, 'role_permissions', 'roles', role, { permissions });
  return c.json({ ok: true });
});

// ===================== AUDIT =====================
export const auditLogs = new Hono<AppEnv>();
auditLogs.get('/', async (c) => {
  assertPerm(c.get('user'), 'audit:read');
  const q = c.req.query();
  const params: unknown[] = [];
  let w = 'WHERE 1=1';
  if (q.entity) (w += ' AND a.entity = ?', params.push(q.entity));
  if (q.entity_id) (w += ' AND a.entity_id = ?', params.push(q.entity_id));
  if (q.user_id) (w += ' AND a.user_id = ?', params.push(q.user_id));
  const page = Math.max(1, Number(q.page) || 1);
  const rows = await c.env.DB.prepare(`SELECT a.*, u.display_name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${w} ORDER BY a.id DESC LIMIT 50 OFFSET ?`).bind(...params, (page - 1) * 50).all();
  const tot = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs a ${w}`).bind(...params).first<{ n: number }>();
  return c.json({ data: rows.results, total: tot?.n ?? 0, page, pageSize: 50 });
});

// ===================== SETTINGS & WEBSITE CMS =====================
export const settings = new Hono<AppEnv>();
settings.get('/company', async (c) => {
  const rows = await c.env.DB.prepare('SELECT key, value FROM company_settings').all<{ key: string; value: string }>();
  return c.json(Object.fromEntries(rows.results.map((r) => [r.key, r.value])));
});
settings.put('/company', async (c) => {
  assertPerm(c.get('user'), 'settings:write');
  const b = z.record(z.string().max(60), z.string().max(2000).nullable()).parse(await c.req.json());
  await c.env.DB.batch(Object.entries(b).map(([k, v]) =>
    c.env.DB.prepare("INSERT INTO company_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(k, v)));
  await audit(c, 'company_settings', 'settings', null, Object.keys(b));
  return c.json({ ok: true });
});
settings.get('/website', async (c) => {
  assertPerm(c.get('user'), 'website:read');
  const rows = await c.env.DB.prepare('SELECT key, draft_value, published_value, updated_at FROM website_settings').all<{ key: string; draft_value: string; published_value: string; updated_at: string }>();
  return c.json(Object.fromEntries(rows.results.map((r) => [r.key, { draft: JSON.parse(r.draft_value || 'null'), published: JSON.parse(r.published_value || 'null'), dirty: r.draft_value !== r.published_value, updated_at: r.updated_at }])));
});
settings.put('/website/:key', async (c) => {
  assertPerm(c.get('user'), 'website:write');
  const key = z.enum(['site', 'contact', 'about', 'seo', 'footer', 'home']).parse(c.req.param('key'));
  const value = await c.req.json();
  const s = JSON.stringify(value);
  if (s.length > 100_000) throw new HttpError(413, 'Contenu trop volumineux');
  await c.env.DB.prepare("INSERT INTO website_settings (key, draft_value, updated_by) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET draft_value = excluded.draft_value, updated_at = datetime('now'), updated_by = excluded.updated_by")
    .bind(key, s, c.get('user').id).run();
  return c.json({ ok: true });
});
settings.post('/website/publish', async (c) => {
  assertPerm(c.get('user'), 'website:write');
  await c.env.DB.prepare("UPDATE website_settings SET published_value = draft_value, updated_at = datetime('now')").run();
  await audit(c, 'website_publish', 'website');
  return c.json({ ok: true });
});
settings.post('/website/discard', async (c) => {
  assertPerm(c.get('user'), 'website:write');
  await c.env.DB.prepare('UPDATE website_settings SET draft_value = published_value').run();
  return c.json({ ok: true });
});

/** Upload a file (image/pdf) stored in D1 (≤ 1.5 MB). For larger files, configure R2 (see docs). */
settings.post('/media/upload', async (c) => {
  assertPerm(c.get('user'), 'website:write');
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | null;
  if (!file || typeof file === 'string') throw new HttpError(400, 'Fichier manquant');
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif', 'application/pdf', 'image/x-icon', 'video/mp4'];
  if (!allowed.includes(file.type)) throw new HttpError(415, 'Type de fichier non autorisé');
  if (file.size > 1_500_000) throw new HttpError(413, 'Fichier trop volumineux (max 1,5 Mo)');
  const kind = String(form.get('kind') || 'gallery');
  const r = await c.env.DB.prepare('INSERT INTO website_media (kind, title, category, mime, data, is_public, created_by) VALUES (?,?,?,?,?,?,?) RETURNING id')
    .bind(kind, String(form.get('title') || file.name).slice(0, 200), String(form.get('category') || '') || null, file.type, await file.arrayBuffer(), kind === 'document' ? 0 : 1, c.get('user').id)
    .first<{ id: number }>();
  await audit(c, 'media_upload', 'website_media', r!.id);
  return c.json({ id: r!.id, path: `/api/public/media/${r!.id}` }, 201);
});
