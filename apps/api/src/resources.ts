import { z } from 'zod';
import type { Context } from 'hono';
import type { AppEnv } from './types';
import { can } from './lib/auth';
import { type ResourceConfig, zBool, zDate, zIdOpt, zMoney, zOptStr, zTime } from './lib/crud';
import { HttpError, ageFrom, nextNumber, todayISO, audit } from './lib/util';

const activities = z.array(z.coerce.number().int()).optional();

export const activitiesRes: ResourceConfig = {
  name: 'activities',
  table: 'activities',
  module: 'activities',
  softDelete: true,
  schema: z.object({
    name: z.string().trim().min(1).max(120),
    name_en: zOptStr(120),
    name_ar: zOptStr(120),
    description: zOptStr(2000),
    description_en: zOptStr(2000),
    description_ar: zOptStr(2000),
    category: zOptStr(80),
    image_url: zOptStr(1000),
    color: zOptStr(20),
    is_published: zBool.optional(),
    sort_order: z.coerce.number().int().optional(),
  }),
  search: ['t.name', 't.category'],
  filters: { category: 't.category', published: 't.is_published' },
  sortable: ['t.name', 't.sort_order'],
  defaultSort: 't.sort_order ASC, t.name ASC',
};

export const categoriesRes: ResourceConfig = {
  name: 'categories',
  table: 'client_categories',
  module: 'plans',
  schema: z.object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(80),
    min_age: z.coerce.number().int().min(0).max(130).optional().nullable(),
    max_age: z.coerce.number().int().min(0).max(130).optional().nullable(),
    is_minor: zBool.optional(),
    sort_order: z.coerce.number().int().optional(),
  }),
  defaultSort: 't.sort_order ASC',
  hasUpdatedAt: false,
};

export const plansRes: ResourceConfig = {
  name: 'plans',
  table: 'subscription_plans',
  module: 'plans',
  softDelete: true,
  schema: z.object({
    name: z.string().trim().min(1).max(120),
    name_en: zOptStr(120),
    name_ar: zOptStr(120),
    category_id: zIdOpt,
    duration_unit: z.enum(['session', 'day', 'week', 'month']),
    duration_value: z.coerce.number().int().min(1).max(120),
    price: zMoney,
    registration_fee: zMoney.optional(),
    activities,
    benefits: zOptStr(2000),
    conditions: zOptStr(2000),
    is_featured: zBool.optional(),
    is_published: zBool.optional(),
    sort_order: z.coerce.number().int().optional(),
  }),
  select: 't.*, cc.name AS category_name',
  from: 'subscription_plans t LEFT JOIN client_categories cc ON cc.id = t.category_id',
  search: ['t.name'],
  filters: { category_id: 't.category_id', published: 't.is_published' },
  sortable: ['t.price', 't.name', 't.sort_order'],
  defaultSort: 'cc.sort_order ASC, t.sort_order ASC, t.price ASC',
};

export const promotionsRes: ResourceConfig = {
  name: 'promotions',
  table: 'promotions',
  module: 'plans',
  softDelete: true,
  schema: z.object({
    title: z.string().trim().min(1).max(160),
    description: zOptStr(2000),
    plan_id: zIdOpt,
    discount_type: z.enum(['percent', 'amount']),
    discount_value: z.coerce.number().int().min(0),
    start_date: zDate.optional().nullable(),
    end_date: zDate.optional().nullable(),
    is_published: zBool.optional(),
  }),
  select: 't.*, p.name AS plan_name',
  from: 'promotions t LEFT JOIN subscription_plans p ON p.id = t.plan_id',
  search: ['t.title'],
};

const employeeSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  cin: zOptStr(20),
  birth_date: zDate.optional().nullable(),
  phone: zOptStr(30),
  address: zOptStr(300),
  email: z.string().email().optional().nullable().or(z.literal('')),
  position: z.enum(['coach', 'receptionist', 'manager', 'cleaning', 'security', 'other']),
  hire_date: zDate.optional().nullable(),
  contract_type: zOptStr(40),
  cnss_number: zOptStr(40),
  base_salary: zMoney.optional(),
  pay_mode: z.enum(['monthly', 'hourly', 'per_session', 'commission', 'mixed']).optional(),
  hourly_rate: zMoney.optional(),
  session_rate: zMoney.optional(),
  commission_rate: z.coerce.number().int().min(0).max(10000).optional(),
  work_schedule: zOptStr(300),
  status: z.enum(['active', 'inactive', 'left']).optional(),
  bank_rib: zOptStr(40),
  leave_balance: z.coerce.number().int().optional(),
});

export const employeesRes: ResourceConfig = {
  name: 'employees',
  table: 'employees',
  module: 'employees',
  softDelete: true,
  schema: employeeSchema,
  search: ['t.first_name', 't.last_name', 't.matricule', 't.phone'],
  filters: { position: 't.position', status: 't.status' },
  sortable: ['t.last_name', 't.hire_date', 't.matricule'],
  defaultSort: 't.last_name ASC',
  sensitive: {
    perm: 'hr_sensitive:read',
    fields: ['cin', 'birth_date', 'address', 'cnss_number', 'base_salary', 'hourly_rate', 'session_rate', 'commission_rate', 'bank_rib'],
  },
  beforeInsert: async (c, data) => {
    data.matricule = await nextNumber(c.env.DB, 'EMP', todayISO().slice(0, 4));
    if (!can(c.get('user'), 'hr_sensitive:write')) {
      for (const f of employeesRes.sensitive!.fields) delete data[f];
    }
    return data;
  },
  afterWrite: async (c, id, input, isNew) => {
    if (isNew && input.position === 'coach') {
      await c.env.DB.prepare('INSERT OR IGNORE INTO coaches (employee_id) VALUES (?)').bind(id).run();
    }
  },
};

export const coachesRes: ResourceConfig = {
  name: 'coaches',
  table: 'coaches',
  module: 'coaches',
  schema: z.object({
    employee_id: z.coerce.number().int().positive(),
    public_name: zOptStr(120),
    specialties: zOptStr(500),
    specialties_en: zOptStr(500),
    specialties_ar: zOptStr(500),
    qualifications: zOptStr(1000),
    certifications: zOptStr(1000),
    experience_years: z.coerce.number().int().min(0).max(70).optional(),
    bio: zOptStr(3000),
    bio_en: zOptStr(3000),
    bio_ar: zOptStr(3000),
    photo_url: zOptStr(1000),
    activities,
    is_public: zBool.optional(),
    sort_order: z.coerce.number().int().optional(),
  }),
  select: `t.*, e.first_name, e.last_name, e.matricule, e.phone, e.status AS employee_status, e.session_rate, e.pay_mode,
    (SELECT COUNT(*) FROM schedules s WHERE (s.coach_id = t.id OR s.replacement_coach_id = t.id) AND s.status = 'done') AS sessions_done,
    (SELECT COALESCE(SUM(worked_minutes),0) FROM employee_attendance ea WHERE ea.employee_id = t.employee_id AND ea.is_validated = 1) AS worked_minutes`,
  from: 'coaches t JOIN employees e ON e.id = t.employee_id',
  search: ['e.first_name', 'e.last_name', 't.specialties'],
  filters: { public: 't.is_public', active: "(CASE WHEN ? = '1' THEN e.archived_at IS NULL ELSE 1 END)" },
  defaultSort: 't.sort_order ASC, e.last_name ASC',
  sensitive: { perm: 'hr_sensitive:read', fields: ['session_rate', 'phone'] },
};

export const suppliersRes: ResourceConfig = {
  name: 'suppliers',
  table: 'suppliers',
  module: 'suppliers',
  softDelete: true,
  schema: z.object({
    company_name: z.string().trim().min(1).max(160),
    contact_name: zOptStr(120),
    phone: zOptStr(30),
    email: zOptStr(160),
    address: zOptStr(300),
    tax_id: zOptStr(40),
    supply_type: zOptStr(120),
    notes: zOptStr(2000),
  }),
  select: `t.*, (SELECT COALESCE(SUM(amount),0) FROM purchases p WHERE p.supplier_id = t.id) AS total_purchases,
    (SELECT COALESCE(SUM(amount - amount_paid),0) FROM purchases p WHERE p.supplier_id = t.id) AS debt`,
  search: ['t.company_name', 't.contact_name', 't.phone'],
  defaultSort: 't.company_name ASC',
};

export const purchasesRes: ResourceConfig = {
  name: 'purchases',
  table: 'purchases',
  module: 'suppliers',
  schema: z.object({
    supplier_id: z.coerce.number().int().positive(),
    invoice_number: zOptStr(60),
    label: z.string().trim().min(1).max(200),
    purchase_date: zDate,
    amount: zMoney,
    amount_paid: zMoney.optional(),
    notes: zOptStr(1000),
  }),
  select: 't.*, s.company_name AS supplier_name',
  from: 'purchases t JOIN suppliers s ON s.id = t.supplier_id',
  filters: { supplier_id: 't.supplier_id' },
  search: ['t.label', 't.invoice_number', 's.company_name'],
  defaultSort: 't.purchase_date DESC',
  hasUpdatedAt: false,
};

export const equipmentRes: ResourceConfig = {
  name: 'equipment',
  table: 'equipment',
  module: 'equipment',
  softDelete: true,
  schema: z.object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    brand: zOptStr(80),
    model: zOptStr(80),
    serial_number: zOptStr(80),
    purchase_date: zDate.optional().nullable(),
    supplier_id: zIdOpt,
    purchase_price: zMoney.optional(),
    location: zOptStr(120),
    condition: z.enum(['available', 'broken', 'maintenance', 'retired']).optional(),
    last_maintenance: zDate.optional().nullable(),
    next_maintenance: zDate.optional().nullable(),
  }),
  select: 't.*, s.company_name AS supplier_name',
  from: 'equipment t LEFT JOIN suppliers s ON s.id = t.supplier_id',
  search: ['t.code', 't.name', 't.brand', 't.serial_number'],
  filters: { condition: 't.condition', location: 't.location' },
  sortable: ['t.code', 't.name', 't.next_maintenance'],
  defaultSort: 't.code ASC',
};

export const maintenanceRes: ResourceConfig = {
  name: 'maintenance',
  table: 'maintenance_records',
  module: 'maintenance',
  schema: z.object({
    equipment_id: z.coerce.number().int().positive(),
    kind: z.enum(['preventive', 'corrective', 'cleaning', 'inspection', 'repair']),
    planned_date: zDate,
    done_date: zDate.optional().nullable(),
    technician: zOptStr(120),
    cost: zMoney.optional(),
    status: z.enum(['planned', 'done', 'cancelled']).optional(),
    notes: zOptStr(2000),
  }),
  select: 't.*, e.code AS equipment_code, e.name AS equipment_name',
  from: 'maintenance_records t JOIN equipment e ON e.id = t.equipment_id',
  search: ['e.name', 'e.code', 't.technician'],
  filters: { status: 't.status', kind: 't.kind', equipment_id: 't.equipment_id' },
  defaultSort: 't.planned_date DESC',
  hasUpdatedAt: false,
  afterWrite: async (c, id) => {
    const r = await c.env.DB.prepare('SELECT equipment_id, status, done_date FROM maintenance_records WHERE id = ?')
      .bind(id)
      .first<{ equipment_id: number; status: string; done_date: string | null }>();
    if (r?.status === 'done' && r.done_date) {
      await c.env.DB.prepare(
        "UPDATE equipment SET last_maintenance = ?, condition = CASE WHEN condition IN ('maintenance','broken') THEN 'available' ELSE condition END WHERE id = ?",
      )
        .bind(r.done_date, r.equipment_id)
        .run();
    }
    const next = await c.env.DB.prepare(
      "SELECT MIN(planned_date) AS d FROM maintenance_records WHERE equipment_id = ? AND status = 'planned'",
    )
      .bind(r!.equipment_id)
      .first<{ d: string | null }>();
    await c.env.DB.prepare('UPDATE equipment SET next_maintenance = ? WHERE id = ?').bind(next?.d ?? null, r!.equipment_id).run();
  },
};

export const expenseCategoriesRes: ResourceConfig = {
  name: 'expense_categories',
  table: 'expense_categories',
  module: 'expenses',
  schema: z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(80) }),
  defaultSort: 't.name ASC',
  hasUpdatedAt: false,
};

export const roomsRes: ResourceConfig = {
  name: 'rooms',
  table: 'rooms',
  module: 'schedules',
  schema: z.object({ name: z.string().trim().min(1).max(80), capacity: z.coerce.number().int().min(1).optional() }),
  defaultSort: 't.name ASC',
  hasUpdatedAt: false,
};

export const exceptionsRes: ResourceConfig = {
  name: 'schedule_exceptions',
  table: 'schedule_exceptions',
  module: 'schedules',
  schema: z.object({ exception_date: zDate, kind: z.enum(['holiday', 'closure']), label: z.string().trim().min(1).max(160) }),
  defaultSort: 't.exception_date DESC',
  hasUpdatedAt: false,
};

export const advancesRes: ResourceConfig = {
  name: 'salary_advances',
  table: 'salary_advances',
  module: 'payroll',
  schema: z.object({
    employee_id: z.coerce.number().int().positive(),
    amount: zMoney,
    given_at: zDate,
    period: z.string().regex(/^\d{4}-\d{2}$/),
    notes: zOptStr(500),
  }),
  select: "t.*, e.first_name || ' ' || e.last_name AS employee_name",
  from: 'salary_advances t JOIN employees e ON e.id = t.employee_id',
  filters: { period: 't.period', employee_id: 't.employee_id' },
  defaultSort: 't.given_at DESC',
  hasUpdatedAt: false,
  beforeInsert: async (c, data) => {
    const locked = await c.env.DB.prepare("SELECT status FROM payroll_periods WHERE period = ? AND status != 'draft'")
      .bind(data.period)
      .first();
    if (locked) throw new HttpError(409, 'La paie de ce mois est déjà validée.');
    return data;
  },
};

export const contractsRes: ResourceConfig = {
  name: 'employee_contracts',
  table: 'employee_contracts',
  module: 'hr_sensitive',
  schema: z.object({
    employee_id: z.coerce.number().int().positive(),
    contract_type: z.string().trim().min(1).max(40),
    start_date: zDate,
    end_date: zDate.optional().nullable(),
    base_salary: zMoney.optional(),
    notes: zOptStr(1000),
  }),
  filters: { employee_id: 't.employee_id' },
  defaultSort: 't.start_date DESC',
  hasUpdatedAt: false,
};

export const leavesRes: ResourceConfig = {
  name: 'leaves',
  table: 'leaves',
  module: 'leaves',
  schema: z.object({
    employee_id: z.coerce.number().int().positive(),
    leave_type: z.enum(['paid', 'sick', 'unpaid', 'justified_absence', 'unjustified_absence']),
    start_date: zDate,
    end_date: zDate,
    reason: zOptStr(1000),
  }),
  columns: ['employee_id', 'leave_type', 'start_date', 'end_date', 'reason'],
  select: "t.*, e.first_name || ' ' || e.last_name AS employee_name, e.leave_balance",
  from: 'leaves t JOIN employees e ON e.id = t.employee_id',
  search: ['e.first_name', 'e.last_name'],
  filters: { status: 't.status', employee_id: 't.employee_id', leave_type: 't.leave_type', year: "substr(t.start_date,1,4) = ?" },
  defaultSort: 't.start_date DESC',
  hasUpdatedAt: false,
  beforeInsert: (_c, data) => {
    const s = new Date(String(data.start_date)).getTime();
    const e = new Date(String(data.end_date)).getTime();
    if (e < s) throw new HttpError(400, 'La date de fin doit être après la date de début');
    data.days = Math.round((e - s) / 86400000) + 1;
    return data;
  },
  beforeUpdate: async (c, id, data) => {
    const r = await c.env.DB.prepare('SELECT status, start_date, end_date FROM leaves WHERE id = ?').bind(id).first<{
      status: string;
      start_date: string;
      end_date: string;
    }>();
    if (r?.status !== 'pending') throw new HttpError(409, 'Un congé déjà traité ne peut plus être modifié');
    const s = new Date(String(data.start_date ?? r.start_date)).getTime();
    const e = new Date(String(data.end_date ?? r.end_date)).getTime();
    data.days = Math.round((e - s) / 86400000) + 1;
    return data;
  },
};

export const expensesRes: ResourceConfig = {
  name: 'expenses',
  table: 'expenses',
  module: 'expenses',
  schema: z.object({
    category_id: z.coerce.number().int().positive(),
    supplier_id: zIdOpt,
    label: z.string().trim().min(1).max(200),
    amount: zMoney.refine((v) => v > 0, 'Montant > 0'),
    method: z.enum(['cash', 'transfer', 'card', 'cheque', 'other']),
    spent_at: zDate,
    notes: zOptStr(1000),
  }),
  select: 't.*, ec.name AS category_name, ec.code AS category_code, s.company_name AS supplier_name',
  from: 'expenses t JOIN expense_categories ec ON ec.id = t.category_id LEFT JOIN suppliers s ON s.id = t.supplier_id',
  search: ['t.label', 't.reference', 'ec.name'],
  filters: {
    category_id: 't.category_id',
    method: 't.method',
    from: 't.spent_at >= ?',
    to: 't.spent_at <= ?',
    active: "(CASE WHEN ? = '1' THEN t.cancelled_at IS NULL ELSE 1 END)",
  },
  sortable: ['t.spent_at', 't.amount'],
  defaultSort: 't.spent_at DESC, t.id DESC',
  hasUpdatedAt: false,
  beforeInsert: async (c, data) => {
    data.reference = await nextNumber(c.env.DB, 'DEP', todayISO().slice(0, 4));
    return data;
  },
  afterWrite: async (c, id, input, isNew) => {
    // Cash expenses are recorded as an "out" movement of the user's open register.
    if (!isNew || input.method !== 'cash') return;
    const reg = await c.env.DB.prepare("SELECT id FROM cash_registers WHERE status = 'open' AND opened_by = ? ORDER BY id DESC LIMIT 1")
      .bind(c.get('user').id)
      .first<{ id: number }>();
    if (!reg) return;
    const e = await c.env.DB.prepare('SELECT reference, label, amount FROM expenses WHERE id = ?').bind(id).first<{
      reference: string;
      label: string;
      amount: number;
    }>();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO cash_transactions (register_id, direction, amount, method, reference, justification, expense_id, created_by) VALUES (?, 'out', ?, 'cash', ?, ?, ?, ?)",
      ).bind(reg.id, e!.amount, e!.reference, e!.label, id, c.get('user').id),
      c.env.DB.prepare('UPDATE expenses SET cash_register_id = ? WHERE id = ?').bind(reg.id, id),
    ]);
  },
  beforeDelete: async () => {
    throw new HttpError(409, 'Une dépense ne se supprime pas : utilisez l’annulation.');
  },
};

export const mediaRes: ResourceConfig = {
  name: 'media',
  table: 'website_media',
  module: 'website',
  schema: z.object({
    kind: z.enum(['gallery', 'logo', 'hero', 'document', 'other']).optional(),
    title: zOptStr(200),
    category: zOptStr(80),
    url: zOptStr(2000),
    is_public: zBool.optional(),
    sort_order: z.coerce.number().int().optional(),
  }),
  select: 't.id, t.kind, t.title, t.category, t.url, t.mime, t.is_public, t.sort_order, t.created_at, (t.data IS NOT NULL) AS has_blob',
  filters: { kind: 't.kind', category: 't.category' },
  defaultSort: 't.sort_order ASC, t.id DESC',
  hasUpdatedAt: false,
};

// ---------------- Clients ----------------
const guardianSchema = z
  .object({
    full_name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(6).max(30),
    relationship: zOptStr(60),
    emergency_contact: zOptStr(120),
  })
  .optional()
  .nullable();

export const clientSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  birth_date: zDate.optional().nullable(),
  gender: z.enum(['M', 'F']).optional().nullable(),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal('')),
  address: zOptStr(300),
  registration_date: zDate.optional(),
  category_id: zIdOpt,
  activities,
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  notes: zOptStr(2000),
  guardian: guardianSchema,
  force: z.boolean().optional(),
});

async function autoCategory(db: D1Database, birth: string | null | undefined): Promise<number | null> {
  const age = ageFrom(birth ?? null);
  if (age == null) return null;
  const r = await db
    .prepare(
      "SELECT id FROM client_categories WHERE code IN ('child','junior','adult','senior') AND (min_age IS NULL OR min_age <= ?) AND (max_age IS NULL OR max_age >= ?) ORDER BY sort_order LIMIT 1",
    )
    .bind(age, age)
    .first<{ id: number }>();
  return r?.id ?? null;
}

async function checkDuplicate(c: Context<AppEnv>, data: Record<string, unknown>, excludeId?: number) {
  const dup = await c.env.DB.prepare(
    `SELECT id, matricule, first_name, last_name FROM clients
     WHERE archived_at IS NULL AND id != ? AND (
       (phone = ? AND lower(first_name) = lower(?))
       OR (lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND COALESCE(birth_date,'') = COALESCE(?, ''))
     ) LIMIT 1`,
  )
    .bind(excludeId ?? 0, data.phone ?? '', data.first_name ?? '', data.first_name ?? '', data.last_name ?? '', data.birth_date ?? null)
    .first<{ matricule: string; first_name: string; last_name: string }>();
  if (dup) {
    throw new HttpError(409, `Doublon probable : ${dup.first_name} ${dup.last_name} (${dup.matricule}). Cochez « forcer » pour confirmer.`, {
      duplicate: dup,
    });
  }
}

export const clientsRes: ResourceConfig = {
  name: 'clients',
  table: 'clients',
  module: 'clients',
  softDelete: true,
  schema: clientSchema,
  columns: ['first_name', 'last_name', 'birth_date', 'gender', 'phone', 'email', 'address', 'registration_date', 'category_id', 'activities', 'status', 'notes'],
  select: `t.*, cc.name AS category_name, cc.code AS category_code, cc.is_minor,
    g.full_name AS guardian_name, g.phone AS guardian_phone, g.relationship AS guardian_relationship, g.emergency_contact AS guardian_emergency,
    (SELECT s.id FROM subscriptions s WHERE s.client_id = t.id AND s.status IN ('active','suspended') ORDER BY s.end_date DESC LIMIT 1) AS current_subscription_id,
    (SELECT s.end_date FROM subscriptions s WHERE s.client_id = t.id AND s.status IN ('active','suspended') ORDER BY s.end_date DESC LIMIT 1) AS current_end_date,
    (SELECT p.name FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.client_id = t.id AND s.status IN ('active','suspended') ORDER BY s.end_date DESC LIMIT 1) AS current_plan,
    (SELECT COALESCE(SUM(s.final_price - s.amount_paid),0) FROM subscriptions s WHERE s.client_id = t.id AND s.status != 'cancelled' AND s.status != 'replaced') AS balance_due`,
  from: 'clients t LEFT JOIN client_categories cc ON cc.id = t.category_id LEFT JOIN guardians g ON g.client_id = t.id',
  search: ['t.matricule', 't.first_name', 't.last_name', 't.phone', "t.first_name || ' ' || t.last_name"],
  filters: {
    category: 'cc.code',
    category_id: 't.category_id',
    status: 't.status',
    gender: 't.gender',
    activity: "EXISTS (SELECT 1 FROM json_each(t.activities) j WHERE j.value = CAST(? AS INTEGER))",
    validity: `(CASE ?
      WHEN 'valid' THEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = t.id AND s.status = 'active' AND s.end_date >= date('now','+1 hour'))
      WHEN 'expired' THEN NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = t.id AND s.status = 'active' AND s.end_date >= date('now','+1 hour'))
      WHEN 'unpaid' THEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = t.id AND s.status NOT IN ('cancelled','replaced') AND s.final_price > s.amount_paid)
      ELSE 1 END)`,
    registered_from: 't.registration_date >= ?',
    registered_to: 't.registration_date <= ?',
  },
  sortable: ['t.matricule', 't.last_name', 't.registration_date', 't.birth_date', 'current_end_date', 'balance_due'],
  defaultSort: 't.id DESC',
  transform: (r) => ({ ...r, age: ageFrom(r.birth_date as string | null) }),
  beforeInsert: async (c, data) => {
    const raw = (await c.req.json().catch(() => ({}))) as { force?: boolean; guardian?: { full_name?: string } | null };
    if (!raw.force) await checkDuplicate(c, data);
    // Validate BEFORE inserting: a minor must have a guardian.
    const age = ageFrom((data.birth_date as string) ?? null);
    let minorCat = false;
    if (data.category_id) {
      const cc = await c.env.DB.prepare('SELECT is_minor FROM client_categories WHERE id = ?').bind(data.category_id).first<{ is_minor: number }>();
      minorCat = cc?.is_minor === 1;
    }
    if (((age != null && age < 18) || minorCat) && !raw.guardian?.full_name) {
      throw new HttpError(400, 'Parent / tuteur obligatoire pour un mineur');
    }
    data.matricule = await nextNumber(c.env.DB, 'MF', todayISO().slice(0, 4), 5);
    data.registration_date = data.registration_date || todayISO();
    if (!data.category_id) data.category_id = await autoCategory(c.env.DB, data.birth_date as string);
    if (!data.status) data.status = 'active';
    return data;
  },
  beforeUpdate: async (c, id, data) => {
    if (data.birth_date !== undefined && !data.category_id) {
      const cat = await autoCategory(c.env.DB, data.birth_date as string);
      if (cat) data.category_id = cat;
    }
    return data;
  },
  afterWrite: async (c, id, input) => {
    const cat = await c.env.DB.prepare(
      'SELECT cc.is_minor FROM clients t LEFT JOIN client_categories cc ON cc.id = t.category_id WHERE t.id = ?',
    )
      .bind(id)
      .first<{ is_minor: number | null }>();
    const age = ageFrom((input.birth_date as string) ?? null);
    const minor = cat?.is_minor === 1 || (age != null && age < 18);
    const g = input.guardian as { full_name: string; phone: string; relationship?: string; emergency_contact?: string } | null | undefined;
    if (g && g.full_name) {
      await c.env.DB.prepare(
        `INSERT INTO guardians (client_id, full_name, phone, relationship, emergency_contact) VALUES (?,?,?,?,?)
         ON CONFLICT(client_id) DO UPDATE SET full_name=excluded.full_name, phone=excluded.phone, relationship=excluded.relationship,
         emergency_contact=excluded.emergency_contact, updated_at=datetime('now')`,
      )
        .bind(id, g.full_name, g.phone, g.relationship ?? null, g.emergency_contact ?? null)
        .run();
    } else if (minor && input.guardian === undefined) {
      const has = await c.env.DB.prepare('SELECT 1 FROM guardians WHERE client_id = ?').bind(id).first();
      if (!has) throw new HttpError(400, 'Parent / tuteur obligatoire pour un mineur');
    }
  },
  beforeDelete: async (c, id) => {
    const fin = await c.env.DB.prepare('SELECT 1 FROM payments WHERE client_id = ? UNION SELECT 1 FROM subscriptions WHERE client_id = ? LIMIT 1')
      .bind(id, id)
      .first();
    if (fin) throw new HttpError(409, 'Ce client possède un historique financier : utilisez l’archivage.');
    await c.env.DB.prepare('DELETE FROM guardians WHERE client_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM attendance WHERE client_id = ?').bind(id).run();
  },
};

export { audit };
