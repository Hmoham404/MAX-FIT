# Sécurité

- **Authentification** : code d’accès personnel (≥ 12 caractères aléatoires), haché HMAC-SHA256 + pepper secret (`CODE_PEPPER`, Workers Secret). Jamais stocké en clair.
- **Sessions** : token opaque 256 bits, seul son SHA-256 est stocké ; expiration 12 h ; révocation individuelle / globale ; déconnexion sécurisée ; changement de code ⇒ révocation des autres sessions.
- **Rate limiting** : 8 échecs de connexion / 15 min / IP.
- **RBAC** : vérifié **côté serveur** sur chaque endpoint (`assertPerm`) ; l’interface masque seulement ce qui est interdit. Champs RH sensibles (CIN, salaire, CNSS, RIB…) filtrés par la permission `hr_sensitive:read`.
- **Injections SQL** : 100 % requêtes paramétrées (`prepare().bind()`), noms de colonnes de tri en liste blanche.
- **Validation** : Zod côté serveur sur toutes les écritures + validation HTML côté client.
- **XSS** : React échappe tout le contenu ; aucun `dangerouslySetInnerHTML` ; en-têtes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` (secureHeaders) ; médias servis avec CSP restrictive.
- **CSRF** : pas de cookie d’authentification ⇒ non exploitable ; en plus, `Content-Type` JSON/multipart exigé et CORS limité aux origines déclarées.
- **API publique** séparée (`/api/public`) : uniquement contenus publiés, aucune donnée client/employé.
- **PWA** : seul le shell statique est mis en cache ; les réponses API ont `Cache-Control: no-store` et ne sont jamais mises en cache. Hors connexion, les écritures sont bloquées côté client.
- **Audit** : connexions, échecs, créations/modifications (avant → après), paiements, annulations, caisse, paie, publication du site.
- **Finance** : aucun paiement supprimé (annulation tracée avec motif), dépenses jamais supprimées, client avec historique financier non supprimable (archivage), paie validée verrouillée (réouverture Super Admin historisée).
- **Documents** : stockés en base avec drapeau `is_public=0` ⇒ servis uniquement via endpoint authentifié.

## Passage aux cookies HttpOnly (même domaine)
Si site et API partagent un domaine (ex. `maxfit.tn` / `api.maxfit.tn`), renvoyer le token via `Set-Cookie: sid=…; HttpOnly; Secure; SameSite=Strict; Path=/` dans `/auth/login` et le lire dans `requireAuth` ; conserver la vérification d’origine.