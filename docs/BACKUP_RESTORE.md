# Sauvegarde & restauration

## Sauvegarde manuelle
```bash
cd apps/api
npx wrangler d1 export maxfit-db --remote --output ../../backups/maxfit-$(date +%F).sql
```
Script : `node scripts/backup.mjs` (même commande, horodatée). Conserver les fichiers hors du dépôt Git (dossier `backups/` ignoré) — ils contiennent des données personnelles : stockage chiffré obligatoire.

## Time Travel (point-in-time)
D1 conserve un historique de 30 jours (offre payante) / 7 jours (gratuite) :
```bash
npx wrangler d1 time-travel info maxfit-db
npx wrangler d1 time-travel restore maxfit-db --timestamp=2026-11-20T10:00:00Z
```

## Restauration complète dans une nouvelle base
```bash
npx wrangler d1 create maxfit-db-restore
npx wrangler d1 execute maxfit-db-restore --remote --file backups/maxfit-AAAA-MM-JJ.sql
# remplacer database_id dans wrangler.toml puis
npx wrangler deploy
```
Tester la restauration au moins une fois par trimestre.