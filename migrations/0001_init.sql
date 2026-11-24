-- MAX FIT / SMART GYM 360 — initial schema (Cloudflare D1 / SQLite)
-- Monetary amounts are stored in MILLIMES (INTEGER). 1 TND = 1000 millimes.
-- Dates: ISO strings (YYYY-MM-DD / YYYY-MM-DDTHH:mm:ss) in Africa/Tunis local time.

PRAGMA foreign_keys = ON;

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- super_admin | admin | receptionist | coach
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- module:action  e.g. clients:write
  module TEXT NOT NULL,
  action TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  code_lookup TEXT NOT NULL UNIQUE,   -- HMAC-SHA256(access code, server pepper)
  code_hint TEXT,                      -- last 2 chars, for admins
  employee_id INTEGER,
  extra_permissions TEXT NOT NULL DEFAULT '[]',   -- JSON array of permission codes
  denied_permissions TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  archived_at TEXT
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,                 -- SHA-256 of the bearer token
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, created_at);

CREATE TABLE client_categories (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  min_age INTEGER,
  max_age INTEGER,
  is_minor INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  matricule TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  gender TEXT CHECK (gender IN ('M','F')),
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  registration_date TEXT NOT NULL,
  category_id INTEGER REFERENCES client_categories(id),
  activities TEXT NOT NULL DEFAULT '[]',   -- JSON array of activity ids
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  archived_at TEXT
);
CREATE INDEX idx_clients_name ON clients(last_name, first_name);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_category ON clients(category_id);

CREATE TABLE guardians (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship TEXT,
  emergency_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE activities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT, name_ar TEXT,
  description TEXT, description_en TEXT, description_ar TEXT,
  category TEXT,
  image_url TEXT,
  color TEXT DEFAULT '#BEF264',
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE subscription_plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT, name_ar TEXT,
  category_id INTEGER REFERENCES client_categories(id),
  duration_unit TEXT NOT NULL CHECK (duration_unit IN ('session','day','week','month')),
  duration_value INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL,                  -- millimes
  registration_fee INTEGER NOT NULL DEFAULT 0,
  activities TEXT NOT NULL DEFAULT '[]',
  benefits TEXT, conditions TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE promotions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  plan_id INTEGER REFERENCES subscription_plans(id),
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','amount')),
  discount_value INTEGER NOT NULL DEFAULT 0,   -- percent, or millimes
  start_date TEXT, end_date TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  category_id INTEGER REFERENCES client_categories(id),
  activities TEXT NOT NULL DEFAULT '[]',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_label TEXT,
  sessions_total INTEGER,
  base_price INTEGER NOT NULL,
  registration_fee INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  final_price INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled','replaced')),
  suspended_at TEXT,
  suspended_days INTEGER NOT NULL DEFAULT 0,
  promotion_id INTEGER REFERENCES promotions(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);
CREATE INDEX idx_subs_client ON subscriptions(client_id);
CREATE INDEX idx_subs_end ON subscriptions(end_date);

CREATE TABLE subscription_history (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  action TEXT NOT NULL,
  details TEXT,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every money received (single source of truth for "encaissé")
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  client_id INTEGER REFERENCES clients(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  invoice_id INTEGER,
  source TEXT NOT NULL DEFAULT 'subscription', -- subscription|registration|session|coaching|accessory|invoice|other
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','transfer','card','cheque','other')),
  paid_at TEXT NOT NULL,
  notes TEXT,
  cash_register_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  cancelled_at TEXT
);
CREATE INDEX idx_payments_date ON payments(paid_at);

CREATE TABLE subscription_payments (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  PRIMARY KEY (subscription_id, payment_id)
);

CREATE TABLE receipts (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id),
  client_id INTEGER REFERENCES clients(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  amount INTEGER NOT NULL,
  remaining INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE document_counters (
  prefix TEXT NOT NULL,
  period TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, period)
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  matricule TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  cin TEXT,
  birth_date TEXT,
  phone TEXT,
  address TEXT,
  email TEXT,
  position TEXT NOT NULL,   -- coach|receptionist|manager|cleaning|security|other
  hire_date TEXT,
  contract_type TEXT,       -- CDI|CDD|SIVP|freelance|other
  cnss_number TEXT,
  base_salary INTEGER NOT NULL DEFAULT 0,
  pay_mode TEXT NOT NULL DEFAULT 'monthly' CHECK (pay_mode IN ('monthly','hourly','per_session','commission','mixed')),
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  session_rate INTEGER NOT NULL DEFAULT 0,
  commission_rate INTEGER NOT NULL DEFAULT 0,    -- percent * 100
  work_schedule TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  bank_rib TEXT,
  leave_balance INTEGER NOT NULL DEFAULT 0,      -- in half-days*? stored as days*10
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  archived_at TEXT
);

CREATE TABLE coaches (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
  public_name TEXT,
  specialties TEXT, specialties_en TEXT, specialties_ar TEXT,
  qualifications TEXT,
  certifications TEXT,
  experience_years INTEGER DEFAULT 0,
  bio TEXT, bio_en TEXT, bio_ar TEXT,
  photo_url TEXT,
  activities TEXT NOT NULL DEFAULT '[]',
  is_public INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE employee_contracts (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  contract_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  base_salary INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE employee_documents (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  title TEXT NOT NULL,
  media_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  capacity INTEGER DEFAULT 20
);

CREATE TABLE schedules (
  id INTEGER PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id),
  coach_id INTEGER REFERENCES coaches(id),
  room_id INTEGER REFERENCES rooms(id),
  session_date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time TEXT NOT NULL,            -- HH:mm
  end_time TEXT NOT NULL,
  age_category TEXT,
  capacity INTEGER DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','full','done')),
  recurrence_group TEXT,
  replacement_coach_id INTEGER REFERENCES coaches(id),
  is_published INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);
CREATE INDEX idx_schedules_date ON schedules(session_date);

CREATE TABLE schedule_exceptions (
  id INTEGER PRIMARY KEY,
  exception_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('holiday','closure')),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Client check-ins (fréquentation)
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  schedule_id INTEGER REFERENCES schedules(id),
  checked_in_at TEXT NOT NULL,
  created_by INTEGER
);
CREATE INDEX idx_attendance_date ON attendance(checked_in_at);

CREATE TABLE employee_attendance (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  check_in TEXT, check_out TEXT,        -- HH:mm
  break_minutes INTEGER NOT NULL DEFAULT 0,
  expected_start TEXT, expected_end TEXT,
  day_type TEXT NOT NULL DEFAULT 'work' CHECK (day_type IN ('work','absent','leave','rest','holiday')),
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_leave_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  correction_reason TEXT,
  is_validated INTEGER NOT NULL DEFAULT 0,
  validated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  UNIQUE (employee_id, work_date)
);

CREATE TABLE leaves (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('paid','sick','unpaid','justified_absence','unjustified_absence')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by INTEGER,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

-- Payroll rules: versioned by effective date, MUST be validated by an accountant.
CREATE TABLE payroll_rules (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,                  -- cnss_employee | cnss_employer | irpp_brackets | css | overtime_rate | working_hours
  label TEXT NOT NULL,
  value_json TEXT NOT NULL,            -- e.g. {"rate_bp": 0}  (basis points) or brackets
  effective_from TEXT NOT NULL,
  validated_by_accountant INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  UNIQUE (code, effective_from)
);

CREATE TABLE payroll_periods (
  id INTEGER PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,         -- YYYY-MM
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','paid','closed')),
  validated_at TEXT, validated_by INTEGER,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE payroll_records (
  id INTEGER PRIMARY KEY,
  period_id INTEGER NOT NULL REFERENCES payroll_periods(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  number TEXT NOT NULL UNIQUE,
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  absence_days INTEGER NOT NULL DEFAULT 0,
  gross INTEGER NOT NULL DEFAULT 0,
  social_contrib INTEGER NOT NULL DEFAULT 0,
  irpp INTEGER NOT NULL DEFAULT 0,
  other_deductions INTEGER NOT NULL DEFAULT 0,
  advances INTEGER NOT NULL DEFAULT 0,
  net INTEGER NOT NULL DEFAULT 0,
  net_to_pay INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  expense_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (period_id, employee_id)
);

CREATE TABLE payroll_items (
  id INTEGER PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('earning','deduction')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  base TEXT,
  amount INTEGER NOT NULL,
  is_manual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE salary_advances (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  amount INTEGER NOT NULL,
  given_at TEXT NOT NULL,
  period TEXT NOT NULL,               -- payroll month it is deducted from
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE cash_registers (
  id INTEGER PRIMARY KEY,
  opened_by INTEGER NOT NULL,
  opened_at TEXT NOT NULL,
  opening_balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at TEXT
);

CREATE TABLE cash_transactions (
  id INTEGER PRIMARY KEY,
  register_id INTEGER NOT NULL REFERENCES cash_registers(id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT NOT NULL,
  justification TEXT NOT NULL,
  payment_id INTEGER, expense_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER NOT NULL
);

CREATE TABLE cash_closures (
  id INTEGER PRIMARY KEY,
  register_id INTEGER NOT NULL UNIQUE REFERENCES cash_registers(id),
  theoretical_balance INTEGER NOT NULL,
  actual_balance INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  notes TEXT,
  closed_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  supplier_id INTEGER,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'cash',
  spent_at TEXT NOT NULL,
  notes TEXT,
  payroll_record_id INTEGER,
  cash_register_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  cancelled_at TEXT
);
CREATE INDEX idx_expenses_date ON expenses(spent_at);

CREATE TABLE quotations (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER REFERENCES clients(id),
  prospect_name TEXT, prospect_phone TEXT,
  issue_date TEXT NOT NULL,
  valid_until TEXT,
  vat_rate_bp INTEGER NOT NULL DEFAULT 0,
  total_ht INTEGER NOT NULL DEFAULT 0,
  total_vat INTEGER NOT NULL DEFAULT 0,
  total_ttc INTEGER NOT NULL DEFAULT 0,
  conditions TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','refused','expired','invoiced')),
  invoice_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE quotation_items (
  id INTEGER PRIMARY KEY,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  discount_bp INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL
);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER REFERENCES clients(id),
  customer_name TEXT, customer_phone TEXT, customer_tax_id TEXT,
  quotation_id INTEGER REFERENCES quotations(id),
  issue_date TEXT NOT NULL,
  due_date TEXT,
  vat_rate_bp INTEGER NOT NULL DEFAULT 0,
  stamp_duty INTEGER NOT NULL DEFAULT 0,
  total_ht INTEGER NOT NULL DEFAULT 0,
  total_vat INTEGER NOT NULL DEFAULT 0,
  total_ttc INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  discount_bp INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL
);

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT, email TEXT, address TEXT,
  tax_id TEXT,
  supply_type TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  invoice_number TEXT,
  label TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE equipment (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT, model TEXT, serial_number TEXT,
  purchase_date TEXT,
  supplier_id INTEGER REFERENCES suppliers(id),
  purchase_price INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  condition TEXT NOT NULL DEFAULT 'available' CHECK (condition IN ('available','broken','maintenance','retired')),
  last_maintenance TEXT,
  next_maintenance TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE maintenance_records (
  id INTEGER PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  kind TEXT NOT NULL CHECK (kind IN ('preventive','corrective','cleaning','inspection','repair')),
  planned_date TEXT NOT NULL,
  done_date TEXT,
  technician TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  dedupe_key TEXT UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE website_settings (
  key TEXT PRIMARY KEY,
  draft_value TEXT,
  published_value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER
);

CREATE TABLE website_pages (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  draft_json TEXT,
  published_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE website_media (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'gallery',    -- gallery|logo|hero|document|other
  title TEXT,
  category TEXT,
  url TEXT,                                -- external URL, or NULL when stored in blob
  mime TEXT,
  data BLOB,                               -- small uploads (<1.5MB)
  is_public INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE company_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
