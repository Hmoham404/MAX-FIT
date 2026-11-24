import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { loadUserFromToken } from '../lib/auth';
import { addDays, todayISO } from '../lib/util';

/**
 * PUBLIC endpoints: no authentication, never expose personal data
 * (no phone, salary, CIN, client data...). Only explicitly published content.
 */
const pub = new Hono<AppEnv>();

pub.use('*', async (c, next) => {
  await next();
  if (c.res.status === 200 && !c.req.query('preview')) c.header('Cache-Control', 'public, max-age=30');
});

pub.get('/site', async (c) => {
  const db = c.env.DB;
  let draft = false;
  if (c.req.query('preview') === '1') {
    const h = c.req.header('authorization') || '';
    const u = h.startsWith('Bearer ') ? await loadUserFromToken(db, h.slice(7)) : null;
    draft = !!u?.permissions.has('website:read');
    c.header('Cache-Control', 'no-store');
  }
  const settings = await db.prepare('SELECT key, draft_value, published_value FROM website_settings').all<{ key: string; draft_value: string; published_value: string }>();
  const s = Object.fromEntries(settings.results.map((r) => [r.key, JSON.parse((draft ? r.draft_value : r.published_value) || 'null')]));
  const activities = await db.prepare(
    'SELECT id, name, name_en, name_ar, description, description_en, description_ar, category, image_url, color FROM activities WHERE is_published = 1 AND archived_at IS NULL ORDER BY sort_order, name',
  ).all();
  const plans = await db.prepare(
    `SELECT p.id, p.name, p.name_en, p.name_ar, p.duration_unit, p.duration_value, p.price, p.registration_fee, p.benefits, p.conditions, p.is_featured,
      cc.code AS category_code, cc.name AS category_name
     FROM subscription_plans p LEFT JOIN client_categories cc ON cc.id = p.category_id WHERE p.is_published = 1 AND p.archived_at IS NULL ORDER BY cc.sort_order, p.sort_order, p.price`,
  ).all();
  const today = todayISO();
  const promotions = await db.prepare(
    `SELECT id, title, description, plan_id, discount_type, discount_value, start_date, end_date FROM promotions
     WHERE is_published = 1 AND archived_at IS NULL AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)`,
  ).bind(today, today).all();
  const coaches = await db.prepare(
    `SELECT co.id, COALESCE(co.public_name, e.first_name || ' ' || e.last_name) AS name, co.specialties, co.specialties_en, co.specialties_ar,
      co.certifications, co.experience_years, co.bio, co.bio_en, co.bio_ar, co.photo_url, co.activities
     FROM coaches co JOIN employees e ON e.id = co.employee_id WHERE co.is_public = 1 AND e.archived_at IS NULL ORDER BY co.sort_order`,
  ).all();
  const gallery = await db.prepare(
    "SELECT id, title, category, url, mime, (data IS NOT NULL) AS has_blob FROM website_media WHERE kind = 'gallery' AND is_public = 1 ORDER BY sort_order, id DESC LIMIT 60",
  ).all();
  const rooms = await db.prepare('SELECT id, name FROM rooms ORDER BY name').all();
  return c.json({ ...s, activities: activities.results, plans: plans.results, promotions: promotions.results, coaches: coaches.results, gallery: gallery.results, rooms: rooms.results, preview: draft });
});

pub.get('/schedule', async (c) => {
  const from = c.req.query('from') || todayISO();
  const to = c.req.query('to') || addDays(from, 6);
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.session_date, s.start_time, s.end_time, s.age_category, s.status, s.capacity, s.activity_id, a.name AS activity_name, a.name_en AS activity_name_en, a.name_ar AS activity_name_ar,
      a.color AS activity_color, a.category AS activity_category, r.name AS room_name,
      COALESCE(s.replacement_coach_id, s.coach_id) AS coach_id,
      COALESCE(rc.public_name, re.first_name || ' ' || re.last_name, co.public_name, ce.first_name || ' ' || ce.last_name) AS coach_name
     FROM schedules s JOIN activities a ON a.id = s.activity_id
     LEFT JOIN coaches co ON co.id = s.coach_id LEFT JOIN employees ce ON ce.id = co.employee_id
     LEFT JOIN coaches rc ON rc.id = s.replacement_coach_id LEFT JOIN employees re ON re.id = rc.employee_id
     LEFT JOIN rooms r ON r.id = s.room_id
     WHERE s.is_published = 1 AND s.session_date BETWEEN ? AND ? ORDER BY s.session_date, s.start_time`,
  ).bind(from, addDays(from, 41) < to ? addDays(from, 41) : to).all();
  const exceptions = await c.env.DB.prepare('SELECT exception_date, kind, label FROM schedule_exceptions WHERE exception_date BETWEEN ? AND ?').bind(from, to).all();
  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ data: rows.results, exceptions: exceptions.results });
});

pub.get('/media/:id{[0-9]+}', async (c) => {
  const m = await c.env.DB.prepare('SELECT mime, data, url FROM website_media WHERE id = ? AND is_public = 1').bind(Number(c.req.param('id'))).first<{ mime: string; data: ArrayBuffer | null; url: string | null }>();
  if (!m) return c.text('Not found', 404);
  if (!m.data && m.url) return c.redirect(m.url);
  if (!m.data) return c.text('Not found', 404);
  return new Response(new Uint8Array(m.data as ArrayBuffer), {
    headers: { 'Content-Type': m.mime || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" },
  });
});

export default pub;
