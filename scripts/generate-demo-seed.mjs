// Generates seeds/demo.sql — DEMO / DEVELOPMENT DATA ONLY. Never apply to a real client's production database.
// Usage: node scripts/generate-demo-seed.mjs  → then: wrangler d1 execute maxfit-db --remote --file seeds/demo.sql
import { writeFileSync, mkdirSync } from 'node:fs';

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addMonths = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const year = today.slice(0, 4);
const out = [];
const ins = (table, row) => out.push(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(q).join(',')});`);
const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=75`;

// ---------- activities ----------
const acts = [
  ['Musculation', 'Strength training', 'تقوية العضلات', 'Musculation', '1534438327276-14e5300c3a48', '#BEF264', 'Plateau complet de machines guidées, charges libres et racks pour développer force et masse musculaire.', 'Full floor of machines, free weights and racks to build strength and muscle.', 'فضاء كامل من الآلات والأوزان الحرة لبناء القوة والكتلة العضلية.'],
  ['Fitness', 'Fitness', 'لياقة بدنية', 'Fitness', '1571019613454-1cb2f99b2d8b', '#38BDF8', 'Cours dynamiques pour tonifier tout le corps en musique.', 'Dynamic classes to tone your whole body to music.', 'حصص ديناميكية لتقوية الجسم كاملاً على أنغام الموسيقى.'],
  ['Cardio', 'Cardio', 'كارديو', 'Cardio', '1576678927484-cc907957088c', '#F97316', 'Tapis, vélos, rameurs et elliptiques dernière génération.', 'Latest treadmills, bikes, rowers and ellipticals.', 'أحدث آلات الجري والدراجات والتجديف.'],
  ['Cross Training', 'Cross Training', 'كروس ترينينغ', 'Fonctionnel', '1599058917212-d750089bc07e', '#EF4444', 'Entraînement fonctionnel haute intensité en petit groupe.', 'High-intensity functional training in small groups.', 'تدريب وظيفي عالي الشدة ضمن مجموعات صغيرة.'],
  ['Boxe', 'Boxing', 'ملاكمة', 'Combat', '1549719386-74dfcbf7dbed', '#EAB308', 'Technique, cardio et confiance en soi sur le ring.', 'Technique, cardio and self-confidence in the ring.', 'تقنية ولياقة وثقة بالنفس على الحلبة.'],
  ['Kickboxing', 'Kickboxing', 'كيك بوكسينغ', 'Combat', '1544117519-31a4b719223d', '#A855F7', 'Pieds-poings pour un défoulement total.', 'Punches and kicks for a total workout.', 'لكمات وركلات لتمرين شامل.'],
  ['Zumba', 'Zumba', 'زومبا', 'Danse', '1524594152303-9fd13543fe6e', '#EC4899', 'Danse fitness latino, ambiance garantie.', 'Latin dance fitness, great vibes guaranteed.', 'رقص لياقة لاتيني بأجواء مميزة.'],
  ['Yoga', 'Yoga', 'يوغا', 'Bien-être', '1544367567-0f2fcb009e0b', '#14B8A6', 'Souplesse, respiration et récupération.', 'Flexibility, breathing and recovery.', 'مرونة وتنفس واسترجاع.'],
  ['Activités enfants', 'Kids activities', 'أنشطة الأطفال', 'Enfants', '1587280501635-68a0e82cd5ff', '#22C55E', 'Motricité, jeux sportifs et initiation multisports de 4 à 11 ans.', 'Motor skills, sports games and multi-sport initiation for ages 4-11.', 'تنمية حركية وألعاب رياضية للأطفال من 4 إلى 11 سنة.'],
  ['Activités juniors', 'Junior activities', 'أنشطة الشباب', 'Juniors', '1517649763962-0c623066013b', '#06B6D4', 'Préparation physique et sports encadrés pour les 12-17 ans.', 'Coached physical preparation for ages 12-17.', 'إعداد بدني مؤطر للفئة 12-17 سنة.'],
  ['Coaching individuel', 'Personal coaching', 'تدريب فردي', 'Coaching', '1583454110551-21f2fa2afe61', '#BEF264', 'Programme sur mesure avec un coach dédié.', 'Tailor-made program with a dedicated coach.', 'برنامج مخصص مع مدرب خاص.'],
];
acts.forEach((a, i) => ins('activities', { id: i + 1, name: a[0], name_en: a[1], name_ar: a[2], category: a[3], image_url: U(a[4]), color: a[5], description: a[6], description_en: a[7], description_ar: a[8], is_published: 1, sort_order: i }));

// ---------- plans ----------
const cats = { child: 1, junior: 2, adult: 3, senior: 4, student: 5, family: 6 };
const priceGrid = {
  adult: [10, 25, 70, 190, 350, 600], junior: [7, 18, 50, 135, 250, 450], child: [7, 16, 45, 120, 220, 400],
  student: [8, 20, 55, 150, 280, 500], family: [0, 0, 120, 330, 620, 1100],
};
const durations = [['session', 1, 'Une séance', 'Single session', 'حصة واحدة'], ['week', 1, 'Une semaine', 'One week', 'أسبوع'], ['month', 1, 'Un mois', 'One month', 'شهر'], ['month', 3, 'Trois mois', 'Three months', 'ثلاثة أشهر'], ['month', 6, 'Six mois', 'Six months', 'ستة أشهر'], ['month', 12, 'Douze mois', 'Twelve months', 'اثنا عشر شهرا']];
let planId = 0;
const plans = [];
for (const [cat, prices] of Object.entries(priceGrid)) {
  durations.forEach((d, i) => {
    if (!prices[i]) return;
    planId++;
    const p = { id: planId, name: `${d[2]}`, name_en: d[3], name_ar: d[4], category_id: cats[cat], duration_unit: d[0], duration_value: d[1], price: prices[i] * 1000, registration_fee: d[0] === 'month' ? (cat === 'family' ? 30000 : 20000) : 0, activities: '[]', benefits: i >= 3 ? 'Accès illimité • Bilan forme offert • Programme personnalisé' : 'Accès plateau & cours collectifs', conditions: d[0] === 'month' ? 'Frais d’inscription applicables à la première adhésion.' : null, is_featured: i === 3 ? 1 : 0, is_published: 1, sort_order: i };
    plans.push({ ...p, cat });
    ins('subscription_plans', p);
  });
}
ins('promotions', { title: 'Offre Rentrée -15%', description: '15% de réduction sur l’abonnement 3 mois adulte', plan_id: plans.find((p) => p.cat === 'adult' && p.duration_value === 3 && p.duration_unit === 'month').id, discount_type: 'percent', discount_value: 15, start_date: addDays(today, -20), end_date: addDays(today, 30), is_published: 1 });

// ---------- employees & coaches ----------
const firstM = ['Mohamed', 'Ahmed', 'Youssef', 'Amine', 'Karim', 'Bilel', 'Skander', 'Aziz', 'Hamza', 'Walid', 'Rami', 'Oussama', 'Firas', 'Seifeddine', 'Houssem'];
const firstF = ['Amira', 'Sarra', 'Ines', 'Mariem', 'Nour', 'Yasmine', 'Rania', 'Eya', 'Salma', 'Chaima', 'Fatma', 'Asma', 'Rim', 'Molka', 'Hiba'];
const lastN = ['Ben Ali', 'Trabelsi', 'Gharbi', 'Jaziri', 'Haddad', 'Mejri', 'Sassi', 'Chaabane', 'Ayari', 'Dridi', 'Hammami', 'Khelifi', 'Bouazizi', 'Mansouri', 'Zouari', 'Ferchichi', 'Belhadj', 'Masmoudi', 'Karray', 'Baccouche'];
const staff = [
  ['coach', 'M', 'Musculation, préparation physique', [1, 11]], ['coach', 'F', 'Fitness, Zumba', [2, 7]], ['coach', 'M', 'Boxe, Kickboxing', [5, 6]],
  ['coach', 'M', 'Cross Training, Cardio', [4, 3]], ['coach', 'F', 'Yoga, Pilates', [8]], ['coach', 'F', 'Activités enfants & juniors', [9, 10]],
  ['receptionist', 'F'], ['receptionist', 'F'], ['receptionist', 'M'], ['cleaning', 'M'], ['cleaning', 'F'], ['manager', 'M'],
];
staff.forEach((s, i) => {
  const id = i + 1;
  const fn = s[1] === 'M' ? firstM[i] : firstF[i];
  const coach = s[0] === 'coach';
  ins('employees', {
    id, matricule: `EMP-${year}-${String(id).padStart(4, '0')}`, first_name: fn, last_name: lastN[i], cin: String(int(10000000, 19999999)).slice(0, 8), birth_date: `${int(1985, 2001)}-0${int(1, 9)}-1${int(0, 9)}`,
    phone: `${pick(['2', '5', '9'])}${int(1000000, 9999999)}`, address: pick(['Tunis', 'Ariana', 'La Marsa', 'Ben Arous', 'Manouba']), email: `${fn.toLowerCase()}@maxfit.tn`,
    position: s[0], hire_date: addMonths(today, -int(3, 40)), contract_type: coach ? pick(['CDD', 'freelance']) : 'CDI', cnss_number: String(int(10000000, 99999999)),
    base_salary: coach ? (i % 2 ? 600000 : 0) : s[0] === 'manager' ? 1400000 : s[0] === 'receptionist' ? 750000 : 600000,
    pay_mode: coach ? (i % 2 ? 'mixed' : 'per_session') : 'monthly', hourly_rate: 0, session_rate: coach ? 25000 : 0, commission_rate: 0,
    work_schedule: coach ? 'Selon planning' : s[0] === 'receptionist' ? (i % 2 ? '06:00-14:00' : '14:00-22:00') : '07:00-15:00', status: 'active', leave_balance: 18,
  });
  if (coach) {
    ins('coaches', { id: i + 1, employee_id: id, public_name: `${fn} ${lastN[i][0]}.`, specialties: s[2], specialties_en: s[2], specialties_ar: s[2], certifications: pick(['Diplôme d’État ISSEP', 'BPJEPS AF', 'Certification CrossFit L1', 'Yoga Alliance 200h']), experience_years: int(3, 12), bio: `Coach passionné(e) spécialisé(e) en ${s[2].toLowerCase()}. Accompagne chaque membre avec exigence et bienveillance.`, bio_en: `Passionate coach specialised in ${s[2]}.`, bio_ar: `مدرب متخصص في ${s[2]}.`, photo_url: U(pick(['1567013127542-490d757e51fc', '1594381898411-846e7d193883', '1605296867304-46d5465a13f1', '1571731956672-f2b94d7dd0cb', '1518310383802-640c2de311b2', '1609899464726-209befaac5bc'])), activities: JSON.stringify(s[3]), is_public: 1, sort_order: i });
  }
});
out.push(`INSERT INTO document_counters (prefix, period, last_value) VALUES ('EMP', '${year}', ${staff.length});`);

// ---------- clients ----------
const clientRows = [];
for (let i = 1; i <= 50; i++) {
  const g = rnd() < 0.55 ? 'M' : 'F';
  const r = rnd();
  const kind = r < 0.14 ? 'child' : r < 0.3 ? 'junior' : r < 0.94 ? 'adult' : 'senior';
  const age = kind === 'child' ? int(5, 11) : kind === 'junior' ? int(12, 17) : kind === 'adult' ? int(18, 55) : int(60, 70);
  const birth = `${Number(today.slice(0, 4)) - age - 1}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
  const reg = addDays(today, -int(0, 420));
  const fn = g === 'M' ? pick(firstM) : pick(firstF);
  const ln = pick(lastN);
  const actsFor = kind === 'child' ? [9] : kind === 'junior' ? [10, pick([1, 5, 4])] : [1, pick([2, 3, 4, 5, 6, 7, 8])];
  const c = { id: i, matricule: `MF-${year}-${String(i).padStart(5, '0')}`, first_name: fn, last_name: ln, birth_date: birth, gender: g, phone: `${pick(['2', '5', '9'])}${int(1000000, 9999999)}`, email: rnd() < 0.5 ? `${fn.toLowerCase()}.${ln.toLowerCase().replace(/ /g, '')}${i}@mail.tn` : null, address: pick(['Tunis', 'Ariana', 'La Marsa', 'Ben Arous', 'Manouba', 'Le Kram', null]), registration_date: reg, category_id: cats[kind], activities: JSON.stringify([...new Set(actsFor)]), status: 'active', notes: null };
  clientRows.push({ ...c, kind });
  ins('clients', c);
  if (kind === 'child' || kind === 'junior') {
    ins('guardians', { client_id: i, full_name: `${pick(firstM)} ${ln}`, phone: `${pick(['2', '5', '9'])}${int(1000000, 9999999)}`, relationship: pick(['Père', 'Mère', 'Tuteur']), emergency_contact: `${pick(['2', '5', '9'])}${int(1000000, 9999999)}` });
  }
}
out.push(`INSERT INTO document_counters (prefix, period, last_value) VALUES ('MF', '${year}', 50);`);

// ---------- subscriptions, payments, receipts ----------
let subId = 0, payId = 0, recId = 0;
const endOf = (start, p) => p.duration_unit === 'session' ? start : p.duration_unit === 'week' ? addDays(start, 6) : addDays(addMonths(start, p.duration_value), -1);
for (const c of clientRows) {
  const catKey = c.kind === 'senior' ? 'adult' : c.kind;
  const options = plans.filter((p) => p.cat === catKey && p.duration_unit === 'month');
  // 1 to 3 successive subscriptions
  let start = c.registration_date;
  const n = int(1, 3);
  for (let k = 0; k < n; k++) {
    const p = pick(options);
    const end = endOf(start, p);
    if (start > today) break;
    subId++;
    const fee = k === 0 ? p.registration_fee : 0;
    const discount = rnd() < 0.15 ? Math.round(p.price * 0.1) : 0;
    const final = p.price + fee - discount;
    const r = rnd();
    const paid = end < today ? (r < 0.9 ? final : Math.round(final / 2)) : r < 0.65 ? final : r < 0.85 ? Math.round(final / 2 / 1000) * 1000 : 0;
    ins('subscriptions', { id: subId, reference: `ABN-${year}-${String(subId).padStart(5, '0')}`, client_id: c.id, plan_id: p.id, category_id: p.category_id, activities: c.activities, start_date: start, end_date: end, duration_label: `${p.duration_value} month`, base_price: p.price, registration_fee: fee, discount, final_price: final, amount_paid: paid, status: 'active', created_at: start + ' 10:00:00' });
    ins('subscription_history', { subscription_id: subId, action: k === 0 ? 'created' : 'renewed', details: JSON.stringify({ plan: p.name, start, end, final }), created_at: start + ' 10:00:00' });
    // split payment in 1 or 2 parts
    const parts = paid > 0 && paid === final && rnd() < 0.3 ? [Math.round(paid / 2 / 1000) * 1000, paid - Math.round(paid / 2 / 1000) * 1000] : paid > 0 ? [paid] : [];
    let acc = 0;
    parts.forEach((amt, j) => {
      payId++; recId++;
      acc += amt;
      const at = (j === 0 ? start : addDays(start, int(5, 20) > 0 && addDays(start, 10) <= today ? 10 : 0)) + ` ${String(int(7, 21)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00`;
      const method = pick(['cash', 'cash', 'cash', 'card', 'transfer', 'cheque']);
      ins('payments', { id: payId, reference: `PAY-${year}-${String(payId).padStart(5, '0')}`, client_id: c.id, subscription_id: subId, source: 'subscription', amount: amt, method, paid_at: at });
      ins('subscription_payments', { subscription_id: subId, payment_id: payId });
      ins('receipts', { id: recId, number: `REC-${year}-${String(recId).padStart(4, '0')}`, payment_id: payId, client_id: c.id, subscription_id: subId, amount: amt, remaining: final - acc, method, issued_at: at });
    });
    start = addDays(end, int(1, 25));
  }
}
// other revenues (single sessions, accessories)
for (let i = 0; i < 40; i++) {
  payId++; recId++;
  const at = addDays(today, -int(0, 180)) + ` ${String(int(7, 21)).padStart(2, '0')}:15:00`;
  const src = pick(['session', 'session', 'accessory', 'coaching']);
  const amt = src === 'session' ? 10000 : src === 'coaching' ? 40000 : pick([15000, 25000, 35000]);
  ins('payments', { id: payId, reference: `PAY-${year}-${String(payId).padStart(5, '0')}`, source: src, amount: amt, method: 'cash', paid_at: at, notes: src === 'accessory' ? pick(['Gants de boxe', 'Shaker', 'Serviette MAX FIT', 'Bouteille']) : src === 'coaching' ? 'Séance coaching privé' : 'Séance unique' });
  ins('receipts', { id: recId, number: `REC-${year}-${String(recId).padStart(4, '0')}`, payment_id: payId, amount: amt, remaining: 0, method: 'cash', issued_at: at });
}
out.push(`INSERT INTO document_counters (prefix, period, last_value) VALUES ('ABN', '${year}', ${subId}), ('PAY', '${year}', ${payId}), ('REC', '${year}', ${recId});`);

// ---------- schedule (6 weeks: -2 .. +4) ----------
const weekly = [
  // dow (1=Mon), start, end, activity, coach, room, age
  [1, '07:00', '08:00', 4, 4, 2, 'Adultes'], [1, '18:00', '19:00', 2, 2, 2, 'Adultes'], [1, '19:00', '20:30', 5, 3, 3, 'Adultes'], [1, '17:00', '18:00', 9, 6, 5, 'Enfants'],
  [2, '09:00', '10:00', 8, 5, 2, 'Adultes'], [2, '18:00', '19:00', 7, 2, 2, 'Adultes'], [2, '19:00', '20:00', 4, 4, 1, 'Adultes'], [2, '17:00', '18:30', 10, 6, 3, 'Juniors'],
  [3, '07:00', '08:00', 3, 4, 4, 'Adultes'], [3, '18:00', '19:30', 6, 3, 3, 'Adultes'], [3, '19:00', '20:00', 2, 2, 2, 'Adultes'], [3, '17:00', '18:00', 9, 6, 5, 'Enfants'],
  [4, '09:00', '10:00', 8, 5, 2, 'Adultes'], [4, '18:00', '19:00', 7, 2, 2, 'Adultes'], [4, '19:00', '20:30', 5, 3, 3, 'Adultes'], [4, '18:00', '19:00', 11, 1, 1, 'Adultes'],
  [5, '07:00', '08:00', 4, 4, 2, 'Adultes'], [5, '18:00', '19:00', 2, 2, 2, 'Adultes'], [5, '17:00', '18:30', 10, 6, 3, 'Juniors'],
  [6, '10:00', '11:00', 9, 6, 5, 'Enfants'], [6, '10:00', '11:30', 4, 4, 1, 'Adultes'], [6, '11:00', '12:00', 8, 5, 2, 'Adultes'], [6, '16:00', '17:00', 7, 2, 2, 'Adultes'],
];
const d0 = new Date(today + 'T00:00:00Z');
const monday = addDays(today, -((d0.getUTCDay() + 6) % 7));
let schedId = 0;
for (let w = -2; w <= 4; w++) {
  for (const s of weekly) {
    schedId++;
    const date = addDays(monday, w * 7 + s[0] - 1);
    ins('schedules', { id: schedId, activity_id: s[3], coach_id: s[4], room_id: s[5], session_date: date, start_time: s[1], end_time: s[2], age_category: s[6], capacity: s[3] === 11 ? 1 : 20, status: date < today ? 'done' : 'scheduled', is_published: 1, recurrence_group: `weekly-${s.join('-')}` });
  }
}

// ---------- client check-ins (last 30 days) ----------
for (let d = 30; d >= 0; d--) {
  const date = addDays(today, -d);
  const n = int(12, 35);
  for (let i = 0; i < n; i++) {
    const h = pick([6, 7, 8, 9, 10, 12, 13, 17, 17, 18, 18, 18, 19, 19, 20, 21]);
    ins('attendance', { client_id: int(1, 50), checked_in_at: `${date}T${String(h).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00` });
  }
}

// ---------- employee attendance (last 20 days, validated before last week) ----------
for (let d = 20; d >= 1; d--) {
  const date = addDays(today, -d);
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  if (dow === 0) continue;
  for (let e = 7; e <= 12; e++) {
    const isMorning = e % 2 === 0;
    const es = e === 7 || e === 9 ? (isMorning ? '06:00' : '14:00') : e === 8 ? '14:00' : '07:00';
    const ee = es === '06:00' ? '14:00' : es === '14:00' ? '22:00' : '15:00';
    const absent = rnd() < 0.04;
    const late = rnd() < 0.2 ? int(5, 25) : 0;
    const [h, m] = es.split(':').map(Number);
    const ci = `${String(h + Math.floor((m + late) / 60)).padStart(2, '0')}:${String((m + late) % 60).padStart(2, '0')}`;
    const extra = rnd() < 0.15 ? 60 : 0;
    const [eh] = ee.split(':').map(Number);
    const co = `${String(eh + extra / 60).padStart(2, '0')}:00`;
    const worked = absent ? 0 : (eh * 60 + extra) - (h * 60 + m + late) - 30;
    const expected = (eh - h) * 60 - 30;
    ins('employee_attendance', { employee_id: e, work_date: date, check_in: absent ? null : ci, check_out: absent ? null : co, break_minutes: 30, expected_start: es, expected_end: ee, day_type: absent ? 'absent' : 'work', worked_minutes: worked, late_minutes: absent ? 0 : late, early_leave_minutes: 0, overtime_minutes: absent ? 0 : Math.max(0, worked - expected), is_validated: d > 7 ? 1 : 0 });
  }
}
ins('leaves', { employee_id: 8, leave_type: 'paid', start_date: addDays(today, 10), end_date: addDays(today, 14), days: 5, reason: 'Congé annuel', status: 'pending' });
ins('leaves', { employee_id: 3, leave_type: 'sick', start_date: addDays(today, -12), end_date: addDays(today, -11), days: 2, reason: 'Certificat médical', status: 'approved' });

// ---------- suppliers, purchases, equipment, maintenance ----------
const sup = [['TechnoGym Tunisie', 'Équipements sportifs'], ['SportNutri SARL', 'Accessoires & nutrition'], ['CleanPro', 'Produits d’entretien'], ['ElecServices', 'Maintenance électrique']];
sup.forEach((s, i) => ins('suppliers', { id: i + 1, company_name: s[0], contact_name: `${pick(firstM)} ${pick(lastN)}`, phone: `7${int(1000000, 9999999)}`, email: `contact@${s[0].toLowerCase().replace(/[^a-z]/g, '')}.tn`, address: 'Tunis', tax_id: `${int(1000000, 9999999)}/A/M/000`, supply_type: s[1] }));
ins('purchases', { supplier_id: 1, invoice_number: 'F-2026-118', label: 'Banc de développé couché + rack', purchase_date: addDays(today, -60), amount: 4200000, amount_paid: 3000000 });
ins('purchases', { supplier_id: 2, invoice_number: 'SN-447', label: 'Lot accessoires (gants, cordes, shakers)', purchase_date: addDays(today, -25), amount: 850000, amount_paid: 850000 });
ins('purchases', { supplier_id: 3, invoice_number: 'CP-0912', label: 'Produits d’entretien trimestriels', purchase_date: addDays(today, -15), amount: 320000, amount_paid: 0 });
const eqs = [['TAP-01', 'Tapis de course', 'Technogym', 'Run 700', 'Zone Cardio'], ['TAP-02', 'Tapis de course', 'Technogym', 'Run 700', 'Zone Cardio'], ['VEL-01', 'Vélo elliptique', 'Life Fitness', 'X3', 'Zone Cardio'], ['RAM-01', 'Rameur', 'Concept2', 'RowErg', 'Zone Cardio'], ['PRE-01', 'Presse à cuisses', 'Hammer Strength', 'Leg Press', 'Plateau Musculation'], ['BAN-01', 'Banc développé couché', 'Eleiko', 'Pro', 'Plateau Musculation'], ['POU-01', 'Poulie vis-à-vis', 'Matrix', 'Versa', 'Plateau Musculation'], ['RIN-01', 'Ring de boxe', 'Everlast', '5x5', 'Ring / Zone Combat'], ['SAC-01', 'Sac de frappe', 'Everlast', '120cm', 'Ring / Zone Combat'], ['VEL-02', 'Vélo de biking', 'Keiser', 'M3i', 'Studio Cours Collectifs']];
eqs.forEach((e, i) => ins('equipment', { id: i + 1, code: e[0], name: e[1], brand: e[2], model: e[3], serial_number: `SN${int(100000, 999999)}`, purchase_date: addMonths(today, -int(6, 30)), supplier_id: 1, purchase_price: int(800, 9000) * 1000, location: e[4], condition: i === 3 ? 'broken' : i === 6 ? 'maintenance' : 'available', last_maintenance: addDays(today, -int(20, 90)), next_maintenance: addDays(today, int(2, 60)) }));
ins('maintenance_records', { equipment_id: 1, kind: 'preventive', planned_date: addDays(today, 3), status: 'planned', technician: 'TechnoGym SAV' });
ins('maintenance_records', { equipment_id: 4, kind: 'repair', planned_date: addDays(today, 1), status: 'planned', technician: 'ElecServices', notes: 'Courroie à remplacer' });
ins('maintenance_records', { equipment_id: 7, kind: 'corrective', planned_date: addDays(today, -2), status: 'planned', technician: 'Matrix SAV' });
ins('maintenance_records', { equipment_id: 2, kind: 'cleaning', planned_date: addDays(today, -20), done_date: addDays(today, -20), status: 'done', technician: 'Équipe interne', cost: 0 });

// ---------- expenses (last 6 months) ----------
let depId = 0;
for (let m = 5; m >= 0; m--) {
  const month = addMonths(today.slice(0, 7) + '-01', -m);
  const items = [[2, 'Loyer local', 2500000], [3, 'Facture STEG', int(350, 650) * 1000], [4, 'Facture SONEDE', int(60, 140) * 1000], [5, 'Abonnement fibre', 89000], [6, 'Produits d’entretien', int(80, 200) * 1000], [9, 'Publicité Facebook / Instagram', int(100, 300) * 1000]];
  for (const it of items) {
    const date = addDays(month, int(1, 25));
    if (date > today) continue;
    depId++;
    ins('expenses', { reference: `DEP-${year}-${String(depId).padStart(4, '0')}`, category_id: it[0], label: it[1], amount: it[2], method: it[0] === 2 ? 'transfer' : pick(['cash', 'transfer']), spent_at: date, supplier_id: it[0] === 6 ? 3 : null });
  }
}
out.push(`INSERT INTO document_counters (prefix, period, last_value) VALUES ('DEP', '${year}', ${depId});`);

// ---------- quotations & invoices ----------
ins('quotations', { id: 1, number: `DEV-${year}-0001`, prospect_name: 'Société Alpha Tech', prospect_phone: '71234567', issue_date: addDays(today, -10), valid_until: addDays(today, 20), vat_rate_bp: 1900, total_ht: 3000000, total_vat: 570000, total_ttc: 3570000, conditions: 'Abonnement entreprise 10 salariés — 12 mois. Paiement 50% à la commande.', status: 'sent' });
ins('quotation_items', { quotation_id: 1, designation: 'Abonnement annuel salarié', quantity: 10, unit_price: 300000, discount_bp: 0, total: 3000000 });
ins('quotations', { id: 2, number: `DEV-${year}-0002`, client_id: 3, issue_date: addDays(today, -3), valid_until: addDays(today, 27), vat_rate_bp: 0, total_ht: 400000, total_vat: 0, total_ttc: 400000, conditions: 'Pack 10 séances de coaching individuel.', status: 'accepted' });
ins('quotation_items', { quotation_id: 2, designation: 'Séance coaching individuel', quantity: 10, unit_price: 40000, discount_bp: 0, total: 400000 });
ins('invoices', { id: 1, number: `FAC-${year}-0001`, customer_name: 'Club Sportif Ennasr', customer_phone: '71999888', issue_date: addDays(today, -30), due_date: addDays(today, -15), vat_rate_bp: 1900, stamp_duty: 1000, total_ht: 1200000, total_vat: 228000, total_ttc: 1229000, amount_paid: 600000, status: 'partial' });
ins('invoice_items', { invoice_id: 1, designation: 'Location salle — 8 séances', quantity: 8, unit_price: 150000, discount_bp: 0, total: 1200000 });
payId++; recId++;
ins('payments', { id: payId, reference: `PAY-${year}-${String(payId).padStart(5, '0')}`, invoice_id: 1, source: 'invoice', amount: 600000, method: 'transfer', paid_at: addDays(today, -25) + ' 11:00:00', notes: `Facture FAC-${year}-0001` });
ins('receipts', { id: recId, number: `REC-${year}-${String(recId).padStart(4, '0')}`, payment_id: payId, amount: 600000, remaining: 629000, method: 'transfer', issued_at: addDays(today, -25) + ' 11:00:00' });
out.push(`UPDATE document_counters SET last_value = ${payId} WHERE prefix = 'PAY'; UPDATE document_counters SET last_value = ${recId} WHERE prefix = 'REC';`);
out.push(`INSERT INTO document_counters (prefix, period, last_value) VALUES ('DEV', '${year}', 2), ('FAC', '${year}', 1);`);

// ---------- gallery ----------
const gal = [['1534438327276-14e5300c3a48', 'Plateau musculation', 'Espaces'], ['1540497077202-7c8a3999166f', 'Zone cardio', 'Équipements'], ['1517836357463-d25dfeac3438', 'Haltères', 'Équipements'], ['1576678927484-cc907957088c', 'Tapis de course', 'Équipements'], ['1599058917212-d750089bc07e', 'Cross training', 'Espaces'], ['1549719386-74dfcbf7dbed', 'Zone boxe', 'Espaces'], ['1518611012118-696072aa579a', 'Cours collectifs', 'Espaces'], ['1571019613454-1cb2f99b2d8b', 'Fitness', 'Infrastructures'], ['1583454110551-21f2fa2afe61', 'Coaching', 'Infrastructures']];
gal.forEach((g, i) => ins('website_media', { kind: 'gallery', title: g[1], category: g[2], url: U(g[0]), is_public: 1, sort_order: i }));

// ---------- contact demo values ----------
out.push(`UPDATE company_settings SET value = 'Avenue Habib Bourguiba, Tunis' WHERE key = 'address';`);
out.push(`UPDATE company_settings SET value = '+216 20 000 000' WHERE key = 'phone';`);

mkdirSync('seeds', { recursive: true });
writeFileSync('seeds/demo.sql', '-- DEMO DATA — generated ' + new Date().toISOString() + '\n' + out.join('\n') + '\n');
console.log(`seeds/demo.sql written: ${out.length} statements`);
