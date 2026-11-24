# Déploiement & mise à jour

## 1. Prérequis
- Node.js 20+, Git, un compte Cloudflare (gratuit), un compte GitHub.
- `npx wrangler login` (ouvre le navigateur pour autoriser Wrangler — **action manuelle**).

## 2. Base de données D1
```bash
npx wrangler d1 create maxfit-db          # noter database_id → apps/api/wrangler.toml
cd apps/api
npx wrangler d1 migrations apply maxfit-db --remote
# DÉMO UNIQUEMENT :
node ../../scripts/generate-demo-seed.mjs && npx wrangler d1 execute maxfit-db --remote --file ../../seeds/demo.sql
```

## 3. Secrets (jamais dans Git)
```bash
cd apps/api
openssl rand -hex 32 | npx wrangler secret put CODE_PEPPER
openssl rand -hex 24 | npx wrangler secret put BOOTSTRAP_TOKEN
```
⚠️ Changer `CODE_PEPPER` invalide tous les codes d’accès existants.

## 4. API
Adapter `ALLOWED_ORIGINS` dans `apps/api/wrangler.toml` (origines autorisées du site), puis :
```bash
npx wrangler deploy
```

## 5. Premier Super Admin
```bash
curl -X POST https://<worker>.workers.dev/api/auth/bootstrap \
  -H 'Content-Type: application/json' -d '{"token":"<BOOTSTRAP_TOKEN>","name":"Super Admin"}'
```
La réponse contient le code d’accès (affiché une seule fois). L’endpoint se désactive dès qu’un utilisateur existe. Vous pouvez ensuite supprimer le secret : `npx wrangler secret delete BOOTSTRAP_TOKEN`.

## 6. Site (GitHub Pages)
- Pousser sur `main` : le workflow `.github/workflows/deploy.yml` construit le site et le publie sur la branche `gh-pages`.
- GitHub → Settings → Pages → Source : *Deploy from a branch* → `gh-pages` / root (une seule fois).
- Variable de dépôt optionnelle `VITE_API_URL` (Settings → Secrets and variables → Actions → Variables).
- Routes SPA : `404.html` est une copie de `index.html` (générée au build).

### Alternative : Cloudflare Pages
```bash
cd apps/web && npm run build && npx wrangler pages deploy dist --project-name maxfit-gym
```

## 7. Déploiement automatique de l’API (optionnel)
Créer un token Cloudflare (Workers + D1 edit) → secret GitHub `CLOUDFLARE_API_TOKEN` et variable `DEPLOY_API=true`.

## 8. Domaine personnalisé
- Site : GitHub Pages → Custom domain (CNAME) ; ajouter le domaine dans `ALLOWED_ORIGINS` ; build avec `BASE_PATH=/`.
- API : Cloudflare → Workers → Custom domain (ex. `api.maxfit.tn`), puis variable `VITE_API_URL`.

## Mise à jour
```bash
git pull
# nouvelles migrations éventuelles
cd apps/api && npx wrangler d1 migrations apply maxfit-db --remote && npx wrangler deploy
git push origin main      # republie le site
```