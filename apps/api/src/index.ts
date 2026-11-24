import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import type { AppEnv } from './types';
import { requireAuth, assertPerm } from './lib/auth';
import { crudRouter } from './lib/crud';
import { HttpError } from './lib/util';
import * as R from './resources';
import authRoutes from './routes/auth';
import subs from './routes/subscriptions';
import payrollRoutes from './routes/payroll';
import publicRoutes from './routes/public';
import { payments, receipts, cash, quotations, invoices, expenseActions } from './routes/finance';
import { schedules, checkins, attendance, leaveActions, me } from './routes/hr';
import { dashboard, reports, notifications, users, auditLogs, settings } from './routes/admin';

const app = new Hono<AppEnv>();

app.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
app.use('/api/*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })(c, next);
});

// Private responses must never be cached (PWA / proxies).
app.use('/api/*', async (c, next) => {
  await next();
  if (!c.req.path.startsWith('/api/public')) c.header('Cache-Control', 'no-store');
});

// Basic CSRF defence: state-changing requests must be JSON or multipart from an allowed origin.
app.use('/api/*', async (c, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(c.req.method)) {
    const ct = c.req.header('content-type') || '';
    if (c.req.method !== 'DELETE' && !ct.includes('application/json') && !ct.includes('multipart/form-data')) {
      throw new HttpError(415, 'Content-Type non supporté');
    }
  }
  await next();
});

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: 'Données invalides', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
  }
  if (err instanceof HttpError) {
    return c.json({ error: err.message, details: err.details }, err.status as 400);
  }
  const msg = String((err as Error)?.message || err);
  if (msg.includes('UNIQUE constraint failed')) return c.json({ error: 'Valeur déjà utilisée (doublon)' }, 409);
  if (msg.includes('FOREIGN KEY constraint failed')) return c.json({ error: 'Référence invalide ou élément lié' }, 409);
  console.error(err);
  return c.json({ error: 'Erreur serveur' }, 500);
});

app.get('/', (c) => c.json({ name: 'MAX FIT API — SMART GYM 360', status: 'ok' }));
app.get('/api/health', async (c) => {
  const r = await c.env.DB.prepare('SELECT 1 AS ok').first();
  return c.json({ ok: !!r, env: c.env.ENVIRONMENT });
});

// ---------- public ----------
app.route('/api/public', publicRoutes);
app.route('/api/auth', authRoutes);

// ---------- private ----------
const priv = new Hono<AppEnv>();
priv.use('*', requireAuth);
priv.route('/dashboard', dashboard);
priv.route('/clients', crudRouter(R.clientsRes));
priv.route('/categories', crudRouter(R.categoriesRes));
priv.route('/subscriptions', subs);
priv.route('/plans', crudRouter(R.plansRes));
priv.route('/promotions', crudRouter(R.promotionsRes));
priv.route('/activities', crudRouter(R.activitiesRes));
priv.route('/schedules', schedules);
priv.route('/rooms', crudRouter(R.roomsRes));
priv.route('/schedule-exceptions', crudRouter(R.exceptionsRes));
priv.route('/coaches', crudRouter(R.coachesRes));
priv.route('/employees', crudRouter(R.employeesRes));
priv.route('/contracts', crudRouter(R.contractsRes));
priv.route('/attendance', attendance);
priv.route('/checkins', checkins);
priv.route('/leaves', leaveActions);
priv.route('/leaves', crudRouter(R.leavesRes));
priv.route('/payroll', payrollRoutes);
priv.route('/advances', crudRouter(R.advancesRes));
priv.route('/payments', payments);
priv.route('/receipts', receipts);
priv.route('/cash', cash);
priv.route('/expenses', expenseActions);
priv.route('/expenses', crudRouter(R.expensesRes));
priv.route('/expense-categories', crudRouter(R.expenseCategoriesRes));
priv.route('/quotations', quotations);
priv.route('/invoices', invoices);
priv.route('/suppliers', crudRouter(R.suppliersRes));
priv.route('/purchases', crudRouter(R.purchasesRes));
priv.route('/equipment', crudRouter(R.equipmentRes));
priv.route('/maintenance', crudRouter(R.maintenanceRes));
priv.route('/reports', reports);
priv.route('/notifications', notifications);
priv.route('/users', users);
priv.route('/audit', auditLogs);
priv.route('/settings', settings);
priv.route('/media', crudRouter(R.mediaRes));
priv.route('/me', me);
priv.get('/media/:id{[0-9]+}/file', async (c) => {
  assertPerm(c.get('user'), 'website:read');
  const m = await c.env.DB.prepare('SELECT mime, data FROM website_media WHERE id = ?').bind(Number(c.req.param('id'))).first<{ mime: string; data: ArrayBuffer | null }>();
  if (!m?.data) throw new HttpError(404, 'Introuvable');
  return new Response(new Uint8Array(m.data), { headers: { 'Content-Type': m.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
});
app.route('/api', priv);

app.notFound((c) => c.json({ error: 'Route introuvable' }, 404));

export default app;
