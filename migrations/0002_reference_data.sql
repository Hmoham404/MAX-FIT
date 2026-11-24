-- Reference data required in every environment (production included). No personal data here.

INSERT INTO roles (id, code, name) VALUES
 (1,'super_admin','Super Admin'),
 (2,'admin','Administrateur'),
 (3,'receptionist','Réceptionniste'),
 (4,'coach','Coach');

-- modules x actions
WITH modules(m) AS (VALUES
 ('dashboard'),('finance_stats'),('clients'),('subscriptions'),('plans'),('activities'),('schedules'),
 ('coaches'),('employees'),('hr_sensitive'),('attendance'),('leaves'),('payroll'),('payments'),('cash'),
 ('expenses'),('quotations'),('invoices'),('receipts'),('suppliers'),('equipment'),('maintenance'),
 ('reports'),('notifications'),('website'),('users'),('settings'),('audit'),('self')),
actions(a) AS (VALUES ('read'),('write'),('delete'))
INSERT INTO permissions (code, module, action)
SELECT m || ':' || a, m, a FROM modules, actions;

-- super_admin: everything
INSERT INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions;

-- admin: everything except users management and system settings write
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions
WHERE module NOT IN ('users') AND code NOT IN ('settings:write','settings:delete');

-- receptionist
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN (
 'dashboard:read','clients:read','clients:write','subscriptions:read','subscriptions:write',
 'plans:read','activities:read','schedules:read','coaches:read','payments:read','payments:write',
 'receipts:read','cash:read','cash:write','notifications:read','notifications:write',
 'self:read','self:write');

-- coach
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code IN ('dashboard:read','schedules:read','self:read','self:write','activities:read');

INSERT INTO client_categories (code, name, min_age, max_age, is_minor, sort_order) VALUES
 ('child','Enfant',4,11,1,1),
 ('junior','Junior',12,17,1,2),
 ('adult','Adulte',18,59,0,3),
 ('senior','Senior',60,120,0,4),
 ('student','Étudiant',18,30,0,5),
 ('family','Famille',NULL,NULL,0,6);

INSERT INTO expense_categories (code, name) VALUES
 ('salaries','Salaires'),('rent','Loyer'),('electricity','Électricité'),('water','Eau'),
 ('internet','Internet'),('cleaning','Nettoyage'),('maintenance','Maintenance'),
 ('equipment','Équipements'),('marketing','Marketing'),('supplies','Fournitures'),('other','Autres dépenses');

INSERT INTO rooms (name, capacity) VALUES
 ('Plateau Musculation',60),('Studio Cours Collectifs',30),('Ring / Zone Combat',20),('Zone Cardio',40),('Studio Kids',20);

-- Payroll rules: DELIBERATELY set to 0 and NOT validated. The accountant must enter the legal
-- Tunisian rates (CNSS, IRPP brackets, CSS...) with their effective date before any real payroll.
INSERT INTO payroll_rules (code, label, value_json, effective_from, validated_by_accountant, notes) VALUES
 ('cnss_employee','Cotisation CNSS salarié','{"rate_bp":0}','2026-01-01',0,'À renseigner et valider par le comptable'),
 ('cnss_employer','Cotisation CNSS employeur (informative)','{"rate_bp":0}','2026-01-01',0,'À renseigner et valider par le comptable'),
 ('css','Contribution sociale de solidarité','{"rate_bp":0}','2026-01-01',0,'À renseigner et valider par le comptable'),
 ('irpp_brackets','Barème IRPP annuel','{"brackets":[],"professional_expenses_bp":0,"professional_expenses_cap":0}','2026-01-01',0,'Tranches annuelles [{"upTo":millimes|null,"rate_bp":...}] — à valider'),
 ('overtime_rate','Majoration heures supplémentaires','{"rate_bp":0}','2026-01-01',0,'Ex: 2500 = +25% — à valider'),
 ('monthly_hours','Heures mensuelles de référence','{"hours":0}','2026-01-01',0,'Base de calcul des retenues d''absence — à valider');

INSERT INTO company_settings (key, value) VALUES
 ('company_name','MAX FIT'),
 ('legal_name','MAX FIT SARL'),
 ('tax_id',''),
 ('address','Tunisie'),
 ('phone',''),
 ('email',''),
 ('currency','TND'),
 ('timezone','Africa/Tunis'),
 ('default_vat_bp','0'),
 ('stamp_duty','0'),
 ('invoice_footer','Merci pour votre confiance.'),
 ('signatory','La Direction'),
 ('accountant_validated','0');

INSERT INTO website_settings (key, draft_value, published_value) VALUES
 ('site','{"name":"MAX FIT","slogan":{"fr":"Dépasse tes limites.","en":"Push past your limits.","ar":"تجاوز حدودك."},"slogans":{"fr":["Dépasse tes limites.","Force. Discipline. Résultats.","Ton corps, ton énergie."],"en":["Push past your limits.","Strength. Discipline. Results.","Your body, your energy."],"ar":["تجاوز حدودك.","قوة. انضباط. نتائج.","جسمك، طاقتك."]},"colors":{"primary":"#BEF264","dark":"#0B0D10","anthracite":"#171A20"},"logoLight":"","logoDark":"","favicon":"","heroImage":"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2000&q=80","heroVideo":""}','{"name":"MAX FIT","slogan":{"fr":"Dépasse tes limites.","en":"Push past your limits.","ar":"تجاوز حدودك."},"slogans":{"fr":["Dépasse tes limites.","Force. Discipline. Résultats.","Ton corps, ton énergie."],"en":["Push past your limits.","Strength. Discipline. Results.","Your body, your energy."],"ar":["تجاوز حدودك.","قوة. انضباط. نتائج.","جسمك، طاقتك."]},"colors":{"primary":"#BEF264","dark":"#0B0D10","anthracite":"#171A20"},"logoLight":"","logoDark":"","favicon":"","heroImage":"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2000&q=80","heroVideo":""}'),
 ('contact','{"address":"Tunisie","phone":"","whatsapp":"","email":"","facebook":"https://www.facebook.com/profile.php?id=100063693144042","instagram":"","mapsEmbed":"","hours":[{"days":{"fr":"Lundi – Samedi","en":"Monday – Saturday","ar":"الإثنين – السبت"},"time":"06:00 – 22:00"},{"days":{"fr":"Dimanche","en":"Sunday","ar":"الأحد"},"time":"08:00 – 14:00"}]}','{"address":"Tunisie","phone":"","whatsapp":"","email":"","facebook":"https://www.facebook.com/profile.php?id=100063693144042","instagram":"","mapsEmbed":"","hours":[{"days":{"fr":"Lundi – Samedi","en":"Monday – Saturday","ar":"الإثنين – السبت"},"time":"06:00 – 22:00"},{"days":{"fr":"Dimanche","en":"Sunday","ar":"الأحد"},"time":"08:00 – 14:00"}]}'),
 ('about','{"fr":{"story":"MAX FIT est née d''une passion : offrir à chacun un espace d''entraînement premium, accessible et motivant.","mission":"Accompagner chaque membre vers ses objectifs avec un encadrement professionnel.","vision":"Devenir la référence du fitness en Tunisie.","values":["Respect","Discipline","Performance","Convivialité"]},"en":{"story":"MAX FIT was born from a passion: giving everyone a premium, accessible and motivating training space.","mission":"Guide every member towards their goals with professional coaching.","vision":"Become the fitness reference in Tunisia.","values":["Respect","Discipline","Performance","Community"]},"ar":{"story":"وُلد MAX FIT من شغف: توفير فضاء تدريب راقٍ ومحفّز ومتاح للجميع.","mission":"مرافقة كل منخرط نحو أهدافه بتأطير احترافي.","vision":"أن نكون المرجع في اللياقة البدنية في تونس.","values":["الاحترام","الانضباط","الأداء","الروح الجماعية"]}}','{"fr":{"story":"MAX FIT est née d''une passion : offrir à chacun un espace d''entraînement premium, accessible et motivant.","mission":"Accompagner chaque membre vers ses objectifs avec un encadrement professionnel.","vision":"Devenir la référence du fitness en Tunisie.","values":["Respect","Discipline","Performance","Convivialité"]},"en":{"story":"MAX FIT was born from a passion: giving everyone a premium, accessible and motivating training space.","mission":"Guide every member towards their goals with professional coaching.","vision":"Become the fitness reference in Tunisia.","values":["Respect","Discipline","Performance","Community"]},"ar":{"story":"وُلد MAX FIT من شغف: توفير فضاء تدريب راقٍ ومحفّز ومتاح للجميع.","mission":"مرافقة كل منخرط نحو أهدافه بتأطير احترافي.","vision":"أن نكون المرجع في اللياقة البدنية في تونس.","values":["الاحترام","الانضباط","الأداء","الروح الجماعية"]}}'),
 ('seo','{"title":"MAX FIT — Salle de sport premium en Tunisie","description":"Musculation, cardio, cross training, boxe, yoga, cours enfants. Coachs diplômés, planning, tarifs.","keywords":"salle de sport, fitness, musculation, Tunisie, MAX FIT"}','{"title":"MAX FIT — Salle de sport premium en Tunisie","description":"Musculation, cardio, cross training, boxe, yoga, cours enfants. Coachs diplômés, planning, tarifs.","keywords":"salle de sport, fitness, musculation, Tunisie, MAX FIT"}'),
 ('footer','{"text":{"fr":"Votre salle de sport premium.","en":"Your premium gym.","ar":"قاعة الرياضة الراقية الخاصة بك."}}','{"text":{"fr":"Votre salle de sport premium.","en":"Your premium gym.","ar":"قاعة الرياضة الراقية الخاصة بك."}}');
