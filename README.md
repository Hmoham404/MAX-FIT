# MAX FIT — SMART GYM 360

**Site web public + ERP BackOffice pour salle de sport (Tunisie).**
*SMART GYM 360 — Designed & Developed by GM LAC.*

| | |
|---|---|
| Site public | https://hmoham404.github.io/MAX-FIT/ |
| BackOffice | https://hmoham404.github.io/MAX-FIT/admin |
| API | https://maxfit-api.foot-arena-pro.workers.dev |

## Architecture

```
GitHub Pages (React SPA, PWA)  ──HTTPS + Bearer token──▶  Cloudflare Worker (Hono API)  ──▶  Cloudflare D1 (SQLite)
```

- **apps/web** — React 18 + Vite + TypeScript + Tailwind, Framer Motion, Lucide, Recharts, TanStack Query, jsPDF/AutoTable, ExcelJS, PWA (vite-plugin-pwa). Site public (FR / EN / AR-RTL, mode jour/nuit avec logo adapté) + BackOffice `/admin`.
- **apps/api** — Cloudflare Worker (Hono + Zod). API REST : `/api/public/*` (publique, aucune donnée personnelle) et `/api/*` privée (authentification + RBAC vérifiés côté serveur).
- **migrations** — schéma SQL D1 versionné (montants en **millimes**, devise TND, fuseau Africa/Tunis).
- **seeds/demo.sql** — données de démonstration (générées par `scripts/generate-demo-seed.mjs`). **Ne jamais appliquer en production.**
- **tests** — tests fonctionnels et de sécurité contre l’API.
- **docs** — documentation technique, sécurité, sauvegarde/restauration, guide utilisateur.

Pourquoi un token Bearer et pas un cookie ? Le site (github.io) et l’API (workers.dev) sont sur deux domaines différents : les navigateurs (Safari, Chrome) bloquent les cookies tiers. Le token de session est opaque (256 bits), stocké haché (SHA-256) en base, expire après 12 h, est révocable, et conservé en `sessionStorage` (effacé à la fermeture du navigateur). Pas de cookie ⇒ pas de CSRF. Si vous servez un jour le site et l’API sous le même domaine (domaine personnalisé), le passage à des cookies HttpOnly/SameSite=Strict est simple (voir docs/SECURITY.md).

## Connexion au BackOffice

La connexion se fait **par code d’accès personnel** (ex. `ABCD-EFGH-JKLM`), pas par email / mot de passe.
- Les codes sont générés aléatoirement (≈ 60 bits), affichés une seule fois, stockés sous forme de HMAC-SHA256 avec un *pepper* secret (`CODE_PEPPER`) jamais présent en base.
- Limitation : 8 échecs / 15 min / IP. Toutes les connexions et échecs sont journalisés.
- Seul le Super Admin crée les comptes (aucune inscription publique), réinitialise les codes et révoque les sessions.

Rôles : **Super Admin**, **Administrateur**, **Réceptionniste**, **Coach** + permissions personnalisables par module × action (lire / écrire / supprimer).

## Développement local

```bash
npm install
npm run db:migrate:local                      # D1 local
cd apps/api && npx wrangler d1 execute maxfit-db --local --file ../../seeds/demo.sql
echo 'CODE_PEPPER="une-longue-chaine-aleatoire-de-32-caracteres-min"' > apps/api/.dev.vars
echo 'BOOTSTRAP_TOKEN="un-token-local"' >> apps/api/.dev.vars
npm run dev:api                               # http://localhost:8787
VITE_API_URL=http://localhost:8787 npm run dev:web
curl -X POST localhost:8787/api/auth/bootstrap -H 'Content-Type: application/json' -d '{"token":"un-token-local","name":"Admin"}'
```

## Déploiement (résumé — détails dans docs/DEPLOYMENT.md)

```bash
npx wrangler login
npx wrangler d1 create maxfit-db                      # copier l'id dans apps/api/wrangler.toml
npm run db:migrate:remote
openssl rand -hex 32 | npx wrangler secret put CODE_PEPPER   (dans apps/api)
openssl rand -hex 24 | npx wrangler secret put BOOTSTRAP_TOKEN
npm run deploy:api
curl -X POST https://<worker>/api/auth/bootstrap -H 'Content-Type: application/json' -d '{"token":"<BOOTSTRAP_TOKEN>","name":"Super Admin"}'
git push origin main                                  # GitHub Actions construit et publie le site sur GitHub Pages
```

## Tests

```bash
API_URL=https://maxfit-api.foot-arena-pro.workers.dev ADMIN_CODE=XXXX-XXXX-XXXX npm test
```
Couvre : connexion, création client, doublons, tuteur obligatoire, abonnement, calcul d’expiration, paiement partiel/intégral, reçu, renouvellement, devis → facture, coach, planning + conflits, synchro planning public, pointage, préparation de paie, clôture de caisse, CMS brouillon/publication, restrictions réceptionniste, protection des API privées, archivage, persistance.

## Points à valider avant mise en production chez un client

- **Paie** : aucun taux légal n’est pré-rempli (CNSS, IRPP, CSS, majorations). Ils doivent être saisis et **validés par un comptable** (Paie → Règles fiscales & sociales). Les bulletins le signalent tant que ce n’est pas fait.
- **Factures** : TVA, timbre fiscal, mentions légales → Paramètres, à valider par le comptable.
- Créer une base D1 **vierge** (sans `seeds/demo.sql`) pour chaque client.

## Évolution SaaS multi-salles

Le schéma est mono-établissement. Pour le multi-salles avec isolation stricte, approche recommandée : **une base D1 par salle** (binding sélectionné selon le sous-domaine / tenant), ce qui garantit l’isolation physique sans modifier les requêtes. Voir docs/ARCHITECTURE.md.
