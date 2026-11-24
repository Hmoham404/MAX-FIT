# Architecture technique

## Modules API (apps/api/src)
| Fichier | Rôle |
|---|---|
| `index.ts` | App Hono, CORS, en-têtes sécurité, gestion d’erreurs, montage des routes |
| `lib/auth.ts` | Codes d’accès, sessions, RBAC |
| `lib/crud.ts` | Moteur CRUD générique (pagination, recherche, filtres, tri, archivage, audit) |
| `lib/payments.ts` | **Seul point de création d’un encaissement** (paiement + reçu + mouvement de caisse) |
| `resources.ts` | Configuration des ressources (clients, employés, activités, tarifs…) |
| `routes/subscriptions.ts` | Moteur d’abonnements (création, paiement, renouvellement, suspension, prolongation, changement de formule…) |
| `routes/finance.ts` | Paiements, reçus, caisse, devis, factures |
| `routes/hr.ts` | Planning (conflits, récurrence), fréquentation, pointage, congés, espace personnel |
| `routes/payroll.ts` | Moteur de paie paramétrable et versionné |
| `routes/admin.ts` | Dashboard, rapports, notifications, utilisateurs, audit, paramètres, CMS |
| `routes/public.ts` | API publique du site |

## Règles financières (anti double comptage)
- **Facturé (CA)** = prix final des abonnements créés + factures émises + autres recettes directes.
- **Encaissé** = somme de la table `payments` (non annulés). Chaque encaissement n’existe qu’une fois, quel que soit son origine (abonnement, facture, séance…).
- **Dépenses** = table `expenses` ; les salaires y entrent **uniquement** au paiement de la paie (une ligne par bulletin).
- **Résultat de gestion** = encaissé − dépenses.
- Statut de **paiement** (payé / partiel / impayé) distinct du statut de **validité** (valide / expiré / suspendu / à venir).

## Multi-salles (SaaS)
Recommandation : une base D1 par établissement (isolation physique). Le Worker choisit le binding selon le tenant (sous-domaine ou en-tête signé). Les migrations s’appliquent à chaque base. Alternative : colonne `gym_id` sur toutes les tables + filtrage systématique dans `crud.ts`.