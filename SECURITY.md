# Security compliance — DIALEKT

Standard: Project Baseline Requirements & Security Manual, Edition 2.0 (258 controls)
Audited: 2026-09-29, suivi 2026-10-20 (changement de nom, 2.2.0)   ·   Owner: Codex64   ·   Status: NON-COMPLIANT

## Summary
| Part | Controls | Pass | Fail | N/A | Unknown |
|---|---|---|---|---|---|
| I — Baseline requirements | 68 | 54 | 13 | 1 | 0 |
| II — Security controls | 190 | 105 | 27 | 58 | 0 |
| Total | 258 | 159 | 40 | 59 | 0 |

## Authentication posture
Quatre facteurs cumulables sur chaque compte : mot de passe (Argon2id, 64 Mio, 3 passes, parallélisme 4, plancher 19 Mio / 2 / 1, rehachage transparent, liste de fuites locale, 12 à 1024 caractères), application TOTP (RFC 6238, secret généré côté serveur et scellé AES-256-GCM, QR code dessiné dans le navigateur, rejeu refusé), clés d'accès WebAuthn (résidentes, vérification de l'utilisateur exigée, jusqu'à vingt, nommées et révocables) et dix codes de secours de 100 bits hachés. Politique par facteur : mot de passe et TOTP facultatifs, clé requise pour les administrateurs, qui tiennent deux facteurs dont une clé (deux facteurs sans clé en mode HTTP dégradé). Un mot de passe seul n'ouvre qu'une session d'inscription. Sessions serveur (jeton de 256 bits, empreinte seule en base), renouvelées à chaque changement de niveau, 12 heures au plus et 60 minutes d'inactivité, listées et révocables une à une ou toutes. Renfort de cinq minutes avec le facteur le plus fort avant tout changement de facteur, de rôle, d'adresse d'alerte, de politique, avant une suppression ou un export. Limiteur persistant par adresse et par compte, preuve de travail après trois échecs, paliers de verrouillage. La clé maîtresse et le poivre se tournent sans réinscription.


## Suivi du 2026-10-20 (Oracle devient DIALEKT, 2.2.0)
Le service s’appelait « Oracle », le nom d’une grande entreprise : il devient DIALEKT (identifiant `dialekt` dans le Hub, image `ghcr.io/codexx64/dialekt`, variables `DIALEKT_*`). Un ancien `.env` (`ORACLE_*`) vaut encore, le nouveau nom l’emporte ; la base `oracle.db` prend seule le nom `dialekt.db` au démarrage, journaux compris. Essais : `test/dialekt.test.js` (« ancien nom », « migration »).

| # | Gravité | Contrôles | Constat | Commit |
|---|---|---|---|---|
| D1 | MEDIUM | REQ-DATA-001, SEC-BE-010 | Incident du 2026-10-20 sur la VM d’essai : le volume de données appartenait encore à root (créé par la 1.x, étape de reprise du README sautée). Le service s’ouvrait, refusait chaque écriture (« readonly database ») et a fini en boucle de redémarrage sans dire pourquoi. Au démarrage, un dossier ou un fichier de base non inscriptible arrête désormais le service avec sa cause et le remède ; base et journaux SQLite forcés en 0600. | 465e2a5 |

2.2.1 : le manifeste déclare remplacer `oracle` (`replaces`, Hub 0.13.0) ; un service installé sous l’ancien nom se met à jour vers DIALEKT au lieu d’une deuxième installation, réglages de duels renommés compris (essai « réglage renommé » de `test/dialekt.test.js`). Le Hub retient ce remplacement seulement depuis le même registre. Une clé d’accès enregistrée sous l’ancien nom de domaine ne vaut pas sous le nouveau (WebAuthn la lie au domaine) : un compte qui n’avait qu’elle repasse par un lien de réinitialisation du Hub.

## Control status
| ID | Severity | Status | Evidence | Notes |
|---|---|---|---|---|
| REQ-AUTH-001 | CRITICAL | PASS | `socle/src/comptes.js:25` ; mot de passe, TOTP, clés et codes de secours cumulables : essai `socle/test/parcours.test.js:159` | socle vérifié par ses propres essais (parcours.test.js, 37 essais) avant embarquement |
| REQ-AUTH-002 | CRITICAL | PASS | `socle/src/comptes.js:28` ; `socle/src/index.js:49` ; réglable sans déploiement : `socle/src/portail.js:476` | défaut : mot de passe et TOTP facultatifs, clé requise pour les administrateurs |
| REQ-AUTH-003 | CRITICAL | PASS | `socle/src/webauthn.js:26` ; vingt clés nommées : `socle/src/comptes.js:39` ; renommer et retirer : `socle/src/portail.js:316` | liste avec dates de création et d’usage dans la page Sécurité |
| REQ-AUTH-004 | CRITICAL | PASS | `socle/src/webauthn.js:46` ; origine `socle/src/webauthn.js:47` ; rpIdHash `socle/src/webauthn.js:103` | défi à usage unique lié à la session, UP et UV exigés, signature et compteur vérifiés |
| REQ-AUTH-005 | CRITICAL | PASS | `socle/src/comptes.js:732` ; renfort et fermeture des autres sessions : `socle/src/comptes.js:748` | la notification part à l’adresse vérifiée quand un relais existe (voir REQ-AUTH-014) |
| REQ-AUTH-006 | CRITICAL | PASS | `socle/src/comptes.js:993` ; jeton de 20 minutes, haché, unique : `socle/src/comptes.js:37` | essai `socle/test/parcours.test.js:242` |
| REQ-AUTH-007 | HIGH | PASS | `socle/src/comptes.js:40` ; 100 bits, haché Argon2id, usage unique : `socle/src/comptes.js:532` | alerte « secours.utilise » (courriel si relais, voir REQ-AUTH-014) |
| REQ-AUTH-008 | HIGH | PASS | `socle/src/totp.js:35` ; rejeu refusé (totp_pas) : `socle/src/comptes.js:624` | RFC 6238, 6 chiffres, 30 s, ±1 pas, secret scellé AES-256-GCM |
| REQ-AUTH-009 | CRITICAL | PASS | aucune voie SMS ni code par courriel : `grep -rniE "sms\|twilio" socle/src src` → 0 ligne ; connexions possibles : `socle/src/comptes.js:465`, `socle/src/comptes.js:491`, `socle/src/comptes.js:513`, `socle/src/comptes.js:578` | un mot de passe seul n’ouvre qu’une session d’inscription |
| REQ-AUTH-010 | CRITICAL | PASS | `socle/src/limiteur.js:20` (SQLite, par adresse et par compte, paliers de verrou, preuve de travail) ; appliqué à mot de passe, TOTP, secours, clé, jetons, adresse d’alerte | essai `socle/test/parcours.test.js:180` |
| REQ-AUTH-011 | HIGH | PASS | vérification leurre : `socle/src/argon.js:110` ; message unique | essai `socle/test/parcours.test.js:81` |
| REQ-AUTH-012 | HIGH | PASS | `socle/src/comptes.js:1032` : l’adresse n’existe que dans le jeton haché tant qu’elle n’est pas vérifiée ; `socle/src/comptes.js:1041` | l’adresse ne sert qu’aux alertes : ni identifiant, ni récupération, ni droit ; pas d’inscription libre (invitation seulement) |
| REQ-AUTH-013 | HIGH | PASS | `socle/src/comptes.js:831` | en mode HTTP dégradé la clé est impossible : la règle retombe sur deux facteurs, affiché en permanence (voir REQ-WEB-001) |
| REQ-AUTH-014 | MEDIUM | FAIL | `socle/src/notifications.js:97` ; « ce n’était pas moi » : `socle/src/comptes.js:1019` | implémenté et essayé (`socle/test/courriel.test.js:63` par courriel») ; ne part que si un relais SMTP est configuré → action H2 |
| REQ-CRYPT-001 | CRITICAL | PASS | `socle/src/argon.js:15` ; 64 Mio, t=3, p=4 par défaut : `socle/src/index.js:42` | Argon2id natif de Node (crypto.argon2), sel de 16 octets par empreinte ; les essais tournent aux paramètres de production, sans réglage abaissé (`test/dialekt.test.js:21`) |
| REQ-CRYPT-002 | HIGH | PASS | `socle/src/argon.js:72` ; écrit dans la même requête : `socle/src/argon.js:129` | scrypt hérité et paramètres plus faibles remplacés à la connexion |
| REQ-CRYPT-003 | MEDIUM | N/A | bcrypt absent : `grep -rniE "bcrypt" socle/src src` → 0 ligne ; Argon2id seul |  |
| REQ-CRYPT-004 | HIGH | PASS | `socle/src/motdepasse.js:12`, `socle/src/motdepasse.js:13`, liste de fuites locale `socle/src/motdepasse.js:18` | contrôlé côté serveur, sans règle de composition ni rotation forcée |
| REQ-CRYPT-005 | HIGH | PASS | `socle/src/outils.js:16` ; comparaisons `socle/src/outils.js:23` ; `grep -rnE "Math.random\|uuidv1" src web socle/src socle/web` → 0 ligne | jetons de 256 bits, sessions de 256 bits, défis WebAuthn aléatoires |
| REQ-CRYPT-006 | MEDIUM | PASS | sessions : `socle/src/comptes.js:294` ; jetons : `socle/src/comptes.js:967` ; secours : `socle/src/comptes.js:532` | essai `socle/test/courriel.test.js:108` |
| REQ-SESS-001 | CRITICAL | PASS | `socle/src/http.js:105` ; __Host- en HTTPS : `socle/src/portail.js:51` | essai `test/dialekt.test.js:58` ; aucune session dans le stockage du navigateur |
| REQ-SESS-002 | CRITICAL | PASS | `socle/src/comptes.js:304` à la connexion, au renfort et à chaque changement de facteur ou de rôle | pas de jeton de rafraîchissement : sessions serveur |
| REQ-SESS-003 | HIGH | PASS | `socle/src/comptes.js:343` ; révocation : `socle/src/portail.js:326` et incident : `socle/src/portail.js:489` | appareil, adresse IP, première et dernière vue |
| REQ-SESS-004 | HIGH | PASS | `socle/src/comptes.js:750` ; déconnexion serveur : `socle/src/portail.js:276` |  |
| REQ-SESS-005 | HIGH | PASS | `socle/src/comptes.js:427` ; facteur le plus fort : `socle/src/comptes.js:761` | facteurs, adresse d’alerte, rôles, suppression, politique, export ; réglages et téléchargements de DIALEKT réservés aux administrateurs |
| REQ-SESS-006 | MEDIUM | PASS | 12 h absolues, 60 min d’inactivité : `socle/src/index.js:40` | pas de JWT |
| REQ-ANON-001 | CRITICAL | PASS | `git log --format="%an <%ae>" \| sort -u` → une ligne, le pseudonyme du projet sur GitHub | identité posée dans le dépôt avant tout commit ; voir la note sur l’orthographe du pseudonyme dans « Human actions required » |
| REQ-ANON-002 | CRITICAL | PASS | commande « personal infrastructure, paths and networks » de l’annexe B.1, lancée sur l’arbre sans ce fichier → 4 lignes, toutes la propriété JavaScript `x.local` (carte du modèle local, `web/app.js:310`) : aucun chemin, aucune adresse privée, aucun domaine local | l’historique publié est traité dans le rapport d’anonymat hors dépôt |
| REQ-ANON-003 | CRITICAL | FAIL | liste et crochet global à poser sur le poste de développement | action H4 |
| REQ-ANON-004 | CRITICAL | PASS | `git log --format=%B \| grep -inE "co-authored-by\|generated with\|🤖"` → 0 ligne ; les mentions de « Claude » et de « ChatGPT » désignent les adversaires du duel, fonction du produit | contrôlé en CI : `.github/workflows/verification.yml:60` |
| REQ-ANON-005 | HIGH | PASS | `package.json:6` sans champ auteur ; `LICENSE:3` | le README décrit le projet, jamais une machine ni une personne |
| REQ-ANON-006 | HIGH | PASS | `git ls-files "*.png" "*.jpg" "*.pdf" "*.mp4"` → 0 fichier ; seules images : SVG texte (`web/icone.svg:1`) | polices WOFF2 : métadonnées de la fonderie uniquement |
| REQ-ANON-007 | HIGH | PASS | données d’essai fabriquées : `test/faux.js:7`, comptes « ana », « bruno », « chloe », adresses exemple.org | relu intégralement |
| REQ-ANON-008 | MEDIUM | FAIL | `git log --format=%aI \| grep -v "+00:00$" \| wc -l` → 5 (commits publiés avant cette session) | tous les nouveaux commits sont en UTC ; les cinq anciens sont publiés : décision H12 |
| REQ-ANON-009 | MEDIUM | FAIL | pages d’erreur sans chemin : `socle/src/http.js:171` ; domaine et WHOIS hors dépôt | action H13 |
| REQ-ANON-010 | MEDIUM | PASS | identité stable et unique, dates réelles (TZ=UTC, jamais antidatées) | aucune politique de contribution externe (dépôt personnel) |
| REQ-CFG-001 | CRITICAL | PASS | `git grep -nIiE "(api[_-]?key\|secret\|token\|password\|bearer)\s*[=:]\s*[\"'][^\"']{8,}"` → 4 lignes : deux gabarits Compose (`deploy/compose.hub.yml:42`), le vecteur public de la RFC 6238 (`socle/test/crypto.test.js:106`) et un jeton factice d’essai ; detect-secrets → 5 résultats : 4 alphabets (Base32, Crockford, suites de clavier) et le même vecteur RFC | gitleaks en CI : `.github/workflows/verification.yml:48` |
| REQ-CFG-002 | CRITICAL | PASS | clés des fournisseurs lues côté serveur seulement : `src/config.js:26` ; rien de secret dans `web/app.js:8` | le navigateur n’appelle que DIALEKT |
| REQ-CFG-003 | HIGH | FAIL | VM d’essai et production distinctes (instruction de l’exploitant) | clés séparées par environnement à vérifier et à émettre : action H6 |
| REQ-CFG-004 | HIGH | PASS | `socle/src/config.js:14` ; ensemble : `socle/src/index.js:71` | essai `test/dialekt.test.js:310` |
| REQ-CFG-005 | HIGH | PASS | inventaire, émetteur et procédure par secret ci-dessous (« Secrets inventory ») ; SOCLE_CLE se tourne sans réinscription : `socle/src/comptes.js:123`, champ du Hub `hub.json:237` ; exercice de bout en bout : `node outils/exercice-rotation.mjs \| grep -c "^OK "` → 12, sur 12 vérifications (clé tournée sur une instance lancée comme en production, TOTP, clé d’accès et code de secours toujours valables, clé inconnue refusée) | essai du socle `socle/test/rotation.test.js:14` ; les clés des fournisseurs vues pendant le développement restent à brûler : SEC-SECRETS-006, action H5 |
| REQ-CI-001 | CRITICAL | FAIL | `.github/workflows/verification.yml:48` | Actions désactivées par la facturation, crochet local et protection de poussée à activer : actions H3, H4 |
| REQ-CI-002 | HIGH | FAIL | `.github/workflows/verification.yml:109` | bloquant une fois les Actions rétablies et le contrôle requis : action H3 |
| REQ-CI-003 | HIGH | FAIL | verrou : `deploy/claude-code/package-lock.json:3` ; audit : `.github/workflows/verification.yml:39` ; SBOM : `.github/workflows/publish.yml:88` | aucune dépendance d’exécution ; contrôle requis et alertes à activer : action H3 |
| REQ-CI-004 | HIGH | FAIL | `.github/workflows/verification.yml:85` | échoue tant que le secret n’existe pas : action H4 |
| REQ-CI-005 | MEDIUM | FAIL | permissions minimales `.github/workflows/verification.yml:16` ; actions épinglées par commit | protection de branche : action H3 |
| REQ-CI-006 | MEDIUM | PASS | `test/dialekt.test.js:94`, `test/dialekt.test.js:114` | chaque route mutante essayée sans session et avec le mauvais rôle |
| REQ-WEB-001 | CRITICAL | FAIL | HSTS dès que la requête est chiffrée : `socle/src/http.js:88` | DIALEKT est aujourd’hui servi en HTTP sur le réseau local : action H1 |
| REQ-WEB-002 | HIGH | PASS | `socle/src/http.js:62` ; `curl -sI /` → script-src 'self' 'nonce-…', object-src 'none', base-uri 'none', frame-ancestors 'none' | zéro violation au parcours Chromium (57 écrans × largeurs, 0 erreur console) |
| REQ-WEB-003 | HIGH | PASS | `socle/src/http.js:79` ; no-store : `socle/src/http.js:150` | aucun en-tête Server ni X-Powered-By (`curl -sI`) |
| REQ-WEB-004 | HIGH | PASS | aucun en-tête CORS émis : `curl -D - -H "Origin: https://evil.example" /api/health` → aucun Access-Control-* | API de même origine |
| REQ-WEB-005 | HIGH | PASS | CSRF : `socle/src/portail.js:98` ; JSON exigé : `socle/src/http.js:122` ; aucune URL fournie par l’utilisateur n’est appelée (adresses du Hub seulement : `src/config.js:23`) | aucune redirection, aucun webhook reçu |
| REQ-WEB-006 | CRITICAL | PASS | schéma strict sur chaque corps : `src/api.js:83` ; propriété dans la requête : `src/base.js:98` | erreurs génériques : `socle/src/http.js:159` |
| REQ-WEB-007 | HIGH | PASS | requêtes préparées partout ; `grep -rnE "innerHTML\|execSync\|eval\(" src web socle/src socle/web` → 2 lignes, toutes deux dans le gabarit du socle (`socle/web/gabarit.js:115`), où le balisage est écrit dans le code et les valeurs posées en nœuds ; processus sans shell : `src/adversaires.js:213` |  |
| REQ-WEB-008 | MEDIUM | PASS | toutes les requêtes : `src/main.js:38` ; corps bornés : `socle/src/http.js:128` ; listes plafonnées : `src/base.js:98` ; coût : `src/api.js:48` | essai `test/dialekt.test.js:219` |
| REQ-DATA-001 | CRITICAL | PASS | SQLite embarqué, aucun port : `src/base.js:43` | dossier de données en 0700 : `src/base.js:31` ; base et journaux en 0600, dossier ou fichier non inscriptible refusé au démarrage avec sa cause : `src/base.js:21` |
| REQ-DATA-002 | HIGH | FAIL | secrets TOTP chiffrés : `socle/src/chiffre.js:60` ; aucune connexion réseau à la base | chiffrement du disque des hôtes : action H7 |
| REQ-DATA-003 | HIGH | FAIL | aucune sauvegarde automatisée du volume à ce jour | sauvegardes chiffrées hors hôte (fonction du Hub, en cours) et exercice de restauration daté : action H8 |
| REQ-DATA-004 | HIGH | PASS | `socle/src/journal.js:10` ; refus : `socle/src/portail.js:110` ; limites : `socle/src/limiteur.js:48` ; sortie hors service : `socle/src/index.js:96` | acteur, action, objet, date, adresse, requête ; essai `socle/test/surveillance.test.js:33` |
| REQ-DATA-005 | MEDIUM | PASS | vigie : `socle/src/vigie.js:11` ; runbook ci-dessous ; révocation globale : `socle/src/portail.js:489` | exercice du runbook à dater : action H8 |
| REQ-DATA-006 | MEDIUM | PASS | `web/confidentialite.txt:7` ; effacement : `src/base.js:217` ; export : `socle/src/portail.js:344` | violation : délai de 72 h dans le runbook |
| REQ-DATA-007 | MEDIUM | PASS | pièces jointes texte seulement, 5 au plus, 60 000 caractères : `src/api.js:19` ; jamais écrites sur disque ni resservies | aucun envoi de fichier binaire, aucun import par URL |
| REQ-CODE-001 | HIGH | PASS | essais de référence avant nettoyage : 22/22 ; API publique inchangée pour le Hub (/api/duel, /api/stats, /api/health, /healthz) | voir NO-VIBE.md |
| REQ-CODE-002 | HIGH | PASS | voir NO-VIBE.md, couche des commentaires |  |
| REQ-CODE-003 | HIGH | PASS | voir NO-VIBE.md, couches structurelle et défensive |  |
| REQ-CODE-004 | HIGH | PASS | voir NO-VIBE.md, profil de style du dépôt |  |
| REQ-CODE-005 | MEDIUM | PASS | trois cassures volontaires (jeton du Hub, IDOR sur les conversations, barème du juge), chacune détectée par un essai : NO-VIBE.md, « Tests » |  |
| REQ-CODE-006 | MEDIUM | PASS | `git log --stat` : un sujet par commit, style du dépôt |  |
| GOV-001 | HIGH | PASS | ce document : revue datée, périmètre (258 contrôles), résolution ligne par ligne | à refaire à chaque changement généré important |
| GOV-002 | MEDIUM | PASS | section « Inventory » ci-dessous : routes, données, tiers, secrets |  |
| GOV-003 | LOW | FAIL | `socle/src/portail.js:151` ; contact : `src/main.js:18` | essai `test/dialekt.test.js:138` ; activer le signalement privé sur le dépôt : action H3 |
| GOV-004 | MEDIUM | FAIL | VM d’essai distincte de la production (règle de l’exploitant) ; données d’essai fabriquées | secrets et comptes tiers distincts à confirmer : action H6 |
| GOV-005 | HIGH | FAIL | jeton CI éphémère et limité : `.github/workflows/publish.yml:26` | 2FA sur GitHub et consoles des fournisseurs : action H3 |
| SEC-SECRETS-001 | CRITICAL | PASS | `git grep` de REQ-CFG-001 → aucune valeur ; detect-secrets → alphabets et vecteur public seulement | historique : gitleaks en CI (H3) |
| SEC-SECRETS-002 | CRITICAL | PASS | aucune variable publique ; interface servie telle quelle : `web/index.html:11` | aucune construction : rien n’est injecté dans le code servi |
| SEC-SECRETS-003 | CRITICAL | PASS | `.gitignore:3` ; seuls web/ et socle/web sont servis, extensions connues : essai `test/dialekt.test.js:145` (`/.env`, `/.git/config`, remontées de dossier → 404) | `.env.example:23` sans valeur |
| SEC-SECRETS-004 | HIGH | PASS | secrets posés par le Hub depuis son coffre : `deploy/compose.hub.yml:47` ; fichiers acceptés : `socle/src/config.js:5` | jamais dans un fichier du volume ni dans la CI |
| SEC-SECRETS-005 | HIGH | FAIL | une clé par fournisseur, lue par DIALEKT seul | restreindre et budgéter les clés chez les fournisseurs : action H6 |
| SEC-SECRETS-006 | HIGH | FAIL | procédure de rotation par secret ci-dessous, sans interruption autre qu’un redémarrage : `socle/src/comptes.js:123` | rotation des clés vues pendant le développement : action H5 |
| SEC-SECRETS-007 | HIGH | PASS | clé maîtresse 32 octets aléatoires : `socle/src/chiffre.js:24` ; valeurs d’exemple refusées : `socle/src/config.js:54` | aucun repli de secret par défaut |
| SEC-SECRETS-008 | MEDIUM | PASS | `socle/src/config.js:14` ; mode dégradé affiché en permanence : `socle/web/compte.js:769` | aucun mode débogage, aucun compte de démonstration |
| SEC-AUTH-001 | CRITICAL | PASS | voir REQ-CRYPT-001 |  |
| SEC-AUTH-002 | MEDIUM | PASS | voir REQ-CRYPT-004 |  |
| SEC-AUTH-003 | CRITICAL | PASS | voir REQ-AUTH-010 |  |
| SEC-AUTH-004 | MEDIUM | PASS | voir REQ-AUTH-011 |  |
| SEC-AUTH-005 | CRITICAL | PASS | voir REQ-AUTH-006 ; lien depuis l’adresse publique : `socle/src/portail.js:56` | sans adresse publique, l’origine attestée par le navigateur de l’administrateur, contrôlée sur la même requête |
| SEC-AUTH-006 | MEDIUM | PASS | confirmation sur la nouvelle adresse et avis à l’ancienne : `socle/src/comptes.js:1047` | essai `socle/test/courriel.test.js:122` |
| SEC-AUTH-007 | HIGH | PASS | TOTP et clés pour tous, second facteur imposé aux administrateurs : `socle/src/comptes.js:178` | codes de secours toujours émis |
| SEC-AUTH-008 | HIGH | N/A | aucune connexion par fournisseur externe : `grep -rniE "oauth\|openid\|id_token\|redirect_uri" socle/src src` → seulement le nom de variable CLAUDE_CODE_OAUTH_TOKEN (jeton transmis à la CLI de l’adversaire) |  |
| SEC-AUTH-009 | HIGH | PASS | les liens reçus par courriel demandent un geste : `socle/web/compte.js:452` ; uniques et courts : `socle/src/comptes.js:38` | aucune connexion sans mot de passe par courriel |
| SEC-AUTH-010 | CRITICAL | PASS | `socle/src/portail.js:7` appelé par chaque route : `src/api.js:39` | essai de balayage sans session |
| SEC-AUTH-011 | HIGH | PASS | `socle/src/http.js:171` ; session illisible = pas de session : `socle/src/comptes.js:310` | aucun chemin d’exception n’ouvre l’accès |
| SEC-SESS-001 | CRITICAL | PASS | voir REQ-SESS-001 |  |
| SEC-SESS-002 | HIGH | PASS | `grep -rn "localStorage" web socle/web` → thème clair ou sombre seulement (`socle/web/compte.js:302`) |  |
| SEC-SESS-003 | HIGH | PASS | 256 bits : `socle/src/comptes.js:289` | renouvelé à chaque changement de niveau |
| SEC-SESS-004 | HIGH | PASS | voir REQ-SESS-003, REQ-SESS-004 et REQ-SESS-006 |  |
| SEC-SESS-005 | CRITICAL | N/A | aucun JWT : `grep -rniE "jwt\|jsonwebtoken\|jose" src web socle` → 0 ligne |  |
| SEC-SESS-006 | MEDIUM | N/A | aucun jeton de rafraîchissement : sessions serveur (voir SEC-SESS-005) |  |
| SEC-SESS-007 | MEDIUM | PASS | voir REQ-SESS-005 ; avis par courriel via le canal d’alerte | courriel : H2 |
| SEC-AUTHZ-001 | CRITICAL | PASS | `src/base.js:86` ; chaque requête filtre par le compte de la session | essai IDOR |
| SEC-AUTHZ-002 | CRITICAL | PASS | `src/api.js:129` ; rôle lu en base : `socle/src/portail.js:120` |  |
| SEC-AUTHZ-003 | HIGH | PASS | schémas stricts, champs inconnus refusés : `socle/src/schema.js:69` | essai `test/dialekt.test.js:213` |
| SEC-AUTHZ-004 | HIGH | PASS | route inconnue → 404 : `src/api.js:217` ; seules routes publiques : `src/api.js:62` et l’état du portail |  |
| SEC-AUTHZ-005 | CRITICAL | N/A | aucune organisation ni espace partagé : chaque objet appartient à un seul compte (`src/base.js:98`) |  |
| SEC-AUTHZ-006 | LOW | PASS | `src/base.js:12` : 96 bits aléatoires, l’entier interne ne sort pas | essai « identifiant public aléatoire » |
| SEC-AUTHZ-007 | HIGH | PASS | plafonds côté serveur : `src/api.js:48` ; jetons bornés : `src/config.js:45` | aucun prix, aucun crédit |
| SEC-AUTHZ-008 | MEDIUM | PASS | aucune fonction cachée côté client : chaque bouton appelle une route contrôlée côté serveur (balayage des rôles) |  |
| SEC-INJ-001 | CRITICAL | PASS | requêtes préparées ; LIKE échappé : `src/base.js:79` ; LIMIT lié : `src/base.js:98` | aucune valeur de requête dans le texte SQL |
| SEC-INJ-002 | HIGH | N/A | aucun ORM : node:sqlite, requêtes préparées seulement |  |
| SEC-INJ-003 | HIGH | N/A | aucune base documentaire : SQLite seulement |  |
| SEC-INJ-004 | CRITICAL | PASS | `src/adversaires.js:213` sans shell ; question par l’entrée standard | essai `test/dialekt.test.js:328` |
| SEC-INJ-005 | HIGH | PASS | `socle/src/http.js:205` | aucun nom de fichier fourni par l’utilisateur n’est ouvert |
| SEC-INJ-006 | HIGH | N/A | aucun moteur de gabarit : `grep -rniwE "handlebars\|ejs\|nunjucks\|mustache" src socle/src` → 0 ligne ; `grep -rnE "new Function\|node:vm" src socle/src` → 0 ligne |  |
| SEC-INJ-007 | HIGH | N/A | aucun analyseur XML côté serveur : `grep -rniE "xml2js\|sax\|libxml\|fast-xml" src socle/src` → 0 ligne |  |
| SEC-INJ-008 | HIGH | PASS | JSON seulement ; clés de prototype refusées : `socle/src/schema.js:6` | aucune fusion récursive d’un corps de requête |
| SEC-XSS-001 | CRITICAL | PASS | `grep -rnE "innerHTML\|outerHTML\|insertAdjacentHTML\|document.write" web socle/web` → 2 lignes, le gabarit du socle (balisage du code, valeurs en nœuds), que DIALEKT n’emploie pas ; texte seulement : `socle/web/compte.js:16` |  |
| SEC-XSS-002 | HIGH | PASS | Markdown rendu en nœuds DOM, jamais en HTML : `web/rendu.js:1` ; liens http(s) seulement : `web/rendu.js:7` | formules KaTeX sans confiance : `web/rendu.js:27` |
| SEC-XSS-003 | HIGH | PASS | aucun eval, setTimeout chaîne ni affectation de location : `grep -rnE "eval\(\|new Function\|location\.href *=" web socle/web` → 0 ligne | le hash ne sert qu’à choisir une page : `web/app.js:496` |
| SEC-XSS-004 | HIGH | PASS | voir REQ-WEB-002 |  |
| SEC-XSS-005 | MEDIUM | PASS | seul échange : le Worker de preuve de travail, de même origine : `socle/web/compte.js:236` | aucune iframe, aucune écoute de window message |
| SEC-XSS-006 | MEDIUM | PASS | aucune carte de source servie ; erreurs réduites à un message : `socle/src/http.js:171` | l’adresse d’Ollama n’est montrée qu’aux administrateurs |
| SEC-XSS-007 | MEDIUM | N/A | aucune redirection pilotée par paramètre : `grep -rnE "searchParams.get\(.(next\|redirect)" src web socle` → 0 ligne |  |
| SEC-XSS-008 | MEDIUM | PASS | aucun script tiers : KaTeX servi par DIALEKT, empreinte vérifiée (`web/vendor/PROVENANCE:4`) | essai `test/fournitures.test.js:10` |
| SEC-HDR-001 | HIGH | FAIL | voir REQ-WEB-001 | action H1 |
| SEC-HDR-002 | HIGH | PASS | voir REQ-WEB-002 |  |
| SEC-HDR-003 | MEDIUM | PASS | `socle/src/http.js:79` ; Permissions-Policy refuse toutes les capacités (`curl -sI /`) | X-Frame-Options DENY en plus de frame-ancestors |
| SEC-HDR-004 | LOW | PASS | `curl -sI /` : ni Server ni X-Powered-By |  |
| SEC-HDR-005 | MEDIUM | PASS | no-store sur l’API et les pages : `socle/src/http.js:150` | fichiers statiques du socle en cache public d’une heure |
| SEC-HDR-006 | CRITICAL | PASS | voir REQ-WEB-004 |  |
| SEC-HDR-007 | HIGH | PASS | voir REQ-SESS-001 |  |
| SEC-CSRF-001 | HIGH | PASS | SameSite=Strict + origine + jeton : `socle/src/portail.js:98` | essai `socle/test/parcours.test.js:200` |
| SEC-CSRF-002 | MEDIUM | PASS | `socle/src/http.js:122` | 415 sur tout autre type |
| SEC-CSRF-003 | MEDIUM | PASS | aucune écriture sur GET : routes GET en lecture seule (src/api.js, socle/src/portail.js) | les liens de courriel demandent un geste, puis un POST |
| SEC-CSRF-004 | CRITICAL | PASS | aucune URL fournie par l’utilisateur n’est appelée : destinations fixées par la configuration (`src/config.js:23`, `src/config.js:28`) et recherche vers DuckDuckGo (`src/recherche.js:31`) | les liens des résultats ne sont jamais ouverts par le serveur |
| SEC-CSRF-005 | HIGH | PASS | aucun webhook reçu ; envois vers SYNAPSE, adresse posée par le Hub : `src/config.js:39` |  |
| SEC-CSRF-006 | MEDIUM | N/A | aucune redirection : voir SEC-XSS-007 |  |
| SEC-API-001 | HIGH | PASS | voir REQ-WEB-006 ; paramètres de chemin : `src/base.js:12` |  |
| SEC-API-002 | HIGH | PASS | global : `src/main.js:38` ; duels par minute et par jour : `src/api.js:28` | essais « plafond de duels par minute » et « plafond journalier » |
| SEC-API-003 | MEDIUM | PASS | `src/base.js:91` ; recherche limitée à 40 |  |
| SEC-API-004 | HIGH | PASS | duels réduits aux champs utiles : `src/base.js:117` ; aucun secret ni empreinte dans les réponses | essai « rien d’interne » |
| SEC-API-005 | MEDIUM | PASS | 405 avec Allow : `src/api.js:218` ; aucune page de documentation (essai « pas de page de doc ») | TRACE et OPTIONS → 405 |
| SEC-API-006 | HIGH | N/A | aucun GraphQL : `grep -rniE "graphql\|apollo" src web socle` → 0 ligne |  |
| SEC-API-007 | MEDIUM | PASS | un seul formateur d’erreurs : `socle/src/http.js:159` | transactions pour les écritures multiples : `socle/src/comptes.js:147` |
| SEC-API-008 | MEDIUM | N/A | aucune opération monétaire ni crédit : `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |  |
| SEC-API-009 | HIGH | PASS | pas de RPC : chaque route HTTP vérifie session, rôle et schéma (voir SEC-AUTH-010) |  |
| SEC-API-010 | MEDIUM | PASS | `socle/src/http.js:128` ; 64 Kio par défaut, 512 Kio pour un duel avec pièces jointes | essai 413 sur 600 000 caractères |
| SEC-DB-001 | CRITICAL | PASS | voir REQ-DATA-001 |  |
| SEC-DB-002 | HIGH | N/A | SQLite embarqué sans rôle ni identifiant : `src/base.js:43` |  |
| SEC-DB-003 | HIGH | FAIL | aucun trafic réseau vers la base ; secrets de facteurs chiffrés | chiffrement du disque des hôtes : action H7 |
| SEC-DB-004 | MEDIUM | PASS | secrets TOTP scellés AES-256-GCM liés au compte : `socle/src/chiffre.js:60` ; clés d’API hors base |  |
| SEC-DB-005 | CRITICAL | PASS | voir SEC-INJ-001 |  |
| SEC-DB-006 | HIGH | FAIL | voir REQ-DATA-003 | action H8 |
| SEC-DB-007 | MEDIUM | PASS | essais sur données fabriquées ; aucun compte par défaut : jeton d’installation exigé (`socle/src/comptes.js:249`) |  |
| SEC-DB-008 | CRITICAL | N/A | le navigateur ne parle jamais à la base : SQLite côté serveur seulement |  |
| SEC-DB-009 | LOW | PASS | `src/base.js:44` ; listes plafonnées | un seul processus, pas de pool nécessaire |
| SEC-DB-010 | LOW | PASS | export de données tracé : `socle/src/portail.js:347` | aucun export administratif en masse |
| SEC-FILE-001 | HIGH | PASS | aucun fichier binaire accepté : pièces jointes texte en JSON, type énuméré (`src/api.js:20`) | une « image » n’est qu’un nom mentionné dans la consigne |
| SEC-FILE-002 | MEDIUM | PASS | 5 pièces, 60 000 caractères chacune, corps de 512 Kio : `src/api.js:19` |  |
| SEC-FILE-003 | HIGH | PASS | rien n’est écrit sur disque : les pièces jointes ne vivent que le temps du duel (`src/duel.js:40`) |  |
| SEC-FILE-004 | HIGH | PASS | aucun fichier d’utilisateur n’est resservi |  |
| SEC-FILE-005 | CRITICAL | PASS | aucun fichier d’utilisateur stocké : rien à protéger au téléchargement |  |
| SEC-FILE-006 | MEDIUM | N/A | aucun fichier partagé entre utilisateurs : les pièces jointes ne sont ni stockées ni redistribuées |  |
| SEC-FILE-007 | LOW | N/A | aucune image acceptée : pièces jointes texte seulement |  |
| SEC-FILE-008 | HIGH | N/A | aucun import par URL : voir SEC-CSRF-004 |  |
| SEC-PAY-001 | CRITICAL | N/A | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |  |
| SEC-PAY-002 | CRITICAL | N/A | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement ; aucun webhook reçu |  |
| SEC-PAY-003 | HIGH | N/A | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement ; aucun abonnement |  |
| SEC-PAY-004 | HIGH | N/A | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |  |
| SEC-PAY-005 | HIGH | N/A | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |  |
| SEC-PAY-006 | HIGH | PASS | vérification : 5 par heure par compte et par adresse (`socle/src/portail.js:38`) ; alertes : 30 par heure et par compte (`socle/src/notifications.js:98`) |  |
| SEC-PAY-007 | MEDIUM | FAIL | le domaine d’expédition est celui du relais de l’exploitant | SPF, DKIM et DMARC à publier avec le relais : action H2 |
| SEC-PAY-008 | MEDIUM | PASS | aucun mot de passe dans un courriel ; liens uniques, hachés, de 30 minutes (`socle/src/comptes.js:38`) ou 72 heures pour fermer les sessions (`socle/src/notifications.js:27`) | le lien de révocation ne peut que fermer des sessions |
| SEC-NEXT-001 | CRITICAL | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |  |
| SEC-NEXT-002 | CRITICAL | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |  |
| SEC-NEXT-003 | HIGH | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |  |
| SEC-NEXT-004 | CRITICAL | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |  |
| SEC-NEXT-005 | HIGH | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |  |
| SEC-NEXT-006 | HIGH | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |  |
| SEC-NEXT-007 | HIGH | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |  |
| SEC-NEXT-008 | MEDIUM | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne ; aucun déploiement Vercel |  |
| SEC-NEXT-009 | MEDIUM | N/A | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne ; aucune bibliothèque de cache client |  |
| SEC-BAAS-001 | CRITICAL | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-002 | CRITICAL | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-003 | CRITICAL | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-004 | HIGH | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-005 | CRITICAL | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-006 | HIGH | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-007 | MEDIUM | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-008 | CRITICAL | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-009 | CRITICAL | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-010 | HIGH | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BAAS-011 | HIGH | N/A | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |  |
| SEC-BE-001 | MEDIUM | PASS | en-têtes posés avant toute route, erreurs comprises : `src/main.js:49` | pas d’Express : équivalent explicite |
| SEC-BE-002 | MEDIUM | PASS | corps bornés ; 404 pour l’inconnu ; relais de confiance explicites : `socle/src/http.js:14` | essai « relais non déclaré ignoré » |
| SEC-BE-003 | HIGH | PASS | voir SEC-INJ-004 et SEC-INJ-008 ; aucun import dynamique d’un chemin fourni | KaTeX importé depuis un chemin fixe dans le navigateur |
| SEC-BE-004 | HIGH | PASS | aucune dépendance d’exécution ; CLI de l’adversaire verrouillée : `deploy/claude-code/package-lock.json:3`, installée sans script : `Dockerfile:14` | `npm audit --package-lock-only` → 0 vulnérabilité |
| SEC-BE-005 | CRITICAL | N/A | aucun Django : service Node |  |
| SEC-BE-006 | HIGH | N/A | aucun Flask ni FastAPI : la version Python est retirée par cette réécriture |  |
| SEC-BE-007 | HIGH | N/A | aucun code Python servi |  |
| SEC-BE-008 | HIGH | N/A | aucun PHP |  |
| SEC-BE-009 | MEDIUM | PASS | `Dockerfile:30` ; base slim épinglée ; données en 0700 |  |
| SEC-BE-010 | MEDIUM | PASS | `socle/src/http.js:159` ; sonde publique réduite à « vivant » : `src/api.js:62` | état détaillé derrière session ou jeton du Hub ; adresse interne d’Ollama réservée aux administrateurs |
| SEC-WP-001 | CRITICAL | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-WP-002 | HIGH | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-WP-003 | HIGH | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-WP-004 | MEDIUM | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-WP-005 | MEDIUM | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-WP-006 | CRITICAL | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-WP-007 | HIGH | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-WP-008 | MEDIUM | N/A | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |  |
| SEC-INFRA-001 | HIGH | FAIL | voir REQ-WEB-001 | action H1 |
| SEC-INFRA-002 | MEDIUM | FAIL | aucun domaine dans le dépôt | DNS, CAA et verrou du registraire du domaine éventuel : action H13 |
| SEC-INFRA-003 | HIGH | FAIL | hôtes de l’exploitant | pare-feu, SSH par clé, mises à jour : action H9 |
| SEC-INFRA-004 | MEDIUM | FAIL | `Dockerfile:5` ; `Dockerfile:30` ; `deploy/compose.hub.yml:14` ; `deploy/compose.hub.yml:17` ; `deploy/compose.hub.yml:19` | crible de l’image (Grype en CI, Trivy au déploiement) à exécuter : actions H3, H14 |
| SEC-INFRA-005 | CRITICAL | N/A | aucun stockage objet : `grep -rniE "s3\|aws\|gcs\|azure\|bucket" src socle/src` → 0 ligne |  |
| SEC-INFRA-006 | HIGH | N/A | aucun nuage : service auto-hébergé, aucune clé IAM |  |
| SEC-INFRA-007 | HIGH | FAIL | permissions minimales, actions épinglées, aucun secret pour les demandes de fusion | protection de branche et revue requise : action H3 |
| SEC-INFRA-008 | MEDIUM | FAIL | empreinte d’image, provenance et SBOM à la publication : `.github/workflows/publish.yml:87` | la publication tourne sur les Actions (H3) ; en attendant, l’image est construite sur la VM |
| SEC-INFRA-009 | MEDIUM | N/A | aucune infrastructure décrite en code : `find . -name "*.tf" -o -name "Pulumi.yaml"` → 0 fichier |  |
| SEC-DEP-001 | HIGH | PASS | `deploy/claude-code/package-lock.json:3` ; `Dockerfile:14` | aucune dépendance à la racine |
| SEC-DEP-002 | HIGH | FAIL | `.github/workflows/verification.yml:39` chaque lundi | alertes Dependabot et contrôle requis : action H3 |
| SEC-DEP-003 | MEDIUM | PASS | une seule dépendance, la CLI officielle de l’adversaire ; KaTeX vendu avec provenance |  |
| SEC-DEP-004 | MEDIUM | PASS | versions exactes ; actions par commit (`.github/workflows/verification.yml:23`) | mises à jour relues à la main |
| SEC-DEP-005 | MEDIUM | PASS | `Dockerfile:14` ; seul script exécuté, relu : `Dockerfile:15` | copie du binaire natif de la plateforme |
| SEC-DEP-006 | LOW | FAIL | `.github/workflows/publish.yml:88` | produit par la publication (H3) |
| SEC-DEP-007 | MEDIUM | PASS | voir SEC-XSS-008 |  |
| SEC-DEP-008 | LOW | FAIL | audit hebdomadaire en CI | abonnement aux avis GitHub : action H3 |
| SEC-LLM-001 | CRITICAL | PASS | clés lues côté serveur seulement : `src/adversaires.js:35` | jamais dans une réponse ni dans le navigateur |
| SEC-LLM-002 | CRITICAL | PASS | session membre exigée, débit par minute, quota par jour, jetons plafonnés : `src/api.js:48`, `src/reglages.js:36` | plafond global chez le fournisseur : action H6 |
| SEC-LLM-003 | HIGH | PASS | contenu externe cloisonné : `src/reglages.js:25` ; le verdict est un calcul, jamais un modèle (`src/juge.js:148`) | essai `test/dialekt.test.js:232` |
| SEC-LLM-004 | HIGH | PASS | réponses rendues en nœuds DOM sans HTML (voir SEC-XSS-002) ; jamais exécutées ni passées à SQL |  |
| SEC-LLM-005 | CRITICAL | PASS | aucun outil : `src/adversaires.js:211` ; dossier vide, environnement minimal, sans session conservée | essai `test/dialekt.test.js:315` |
| SEC-LLM-006 | HIGH | PASS | seule la conversation du compte sert d’historique : `src/base.js:140` ; aucun secret dans la consigne | SYNAPSE ne reçoit jamais le texte des conversations |
| SEC-LLM-007 | MEDIUM | PASS | service réservé aux comptes invités ; consigne cadrée : `src/reglages.js:8` ; conversations gardées pour enquête | garde-fou des modèles : `src/adversaires.js:49` |
| SEC-LLM-008 | LOW | PASS | modèles choisis dans la liste renvoyée par le fournisseur ; aucune base vectorielle |  |
| SEC-LOG-001 | MEDIUM | PASS | voir REQ-DATA-004 ; identifiant de requête : `socle/src/requete.js:12` |  |
| SEC-LOG-002 | HIGH | PASS | `socle/src/journal.js:10` ; jamais le texte des conversations au journal | essai « ni mot de passe ni secret au journal » |
| SEC-LOG-003 | MEDIUM | FAIL | sortie standard conservée par Docker, hors de portée du service : `deploy/compose.hub.yml:27` | collecteur central hors hôte : action H11 |
| SEC-LOG-004 | MEDIUM | PASS | vigie : échecs, refus, limites, erreurs, connexion d’un administrateur (`socle/src/vigie.js:11`) ; refus d’origine et de jeton anti-CSRF journalisés : `socle/src/portail.js:109` ; dépense : `src/api.js:56` | courriel (H2) et alertes de facturation (H6) pour sortir de l’application |
| SEC-LOG-005 | LOW | FAIL | sonde du Hub sur /healthz toutes les 30 s (`hub.json:480`) | surveillance externe : action H10 |
| SEC-LOG-006 | MEDIUM | PASS | runbook ci-dessous |  |
| SEC-LOG-007 | HIGH | PASS | fermeture globale des sessions : `socle/src/portail.js:489` ; rotation de SOCLE_CLE exercée (`outils/exercice-rotation.mjs:1`) ; l’adversaire, seule fonction payante, se coupe en vidant sa clé dans le Hub puis en redéployant (runbook) |  |
| SEC-PRIV-001 | MEDIUM | PASS | `web/confidentialite.txt:7` avec durées ; purges automatiques : `socle/src/comptes.js:1062` |  |
| SEC-PRIV-002 | MEDIUM | PASS | un cookie de session indispensable, documenté ; aucun traceur (`web/confidentialite.txt:49`) |  |
| SEC-PRIV-003 | MEDIUM | PASS | `web/confidentialite.txt:34` nomme chaque destinataire ; lien depuis la page Sécurité |  |
| SEC-PRIV-004 | MEDIUM | PASS | export : `socle/src/portail.js:344` ; effacement en libre-service sous renfort, identifiant retapé : `socle/src/comptes.js:932` ; conversations, projets et quotas avec le compte : `src/base.js:217` | essais `test/dialekt.test.js:154` et `test/dialekt.test.js:171` |
| SEC-PRIV-005 | HIGH | FAIL | voir REQ-DATA-002 | action H7 |
| SEC-PRIV-006 | LOW | FAIL | destinataires nommés dans `web/confidentialite.txt:40` | conditions et accord de traitement du fournisseur choisi : action H15 |
| SEC-PRIV-007 | MEDIUM | PASS | runbook : notification sous 72 heures |  |
| SEC-PRIV-008 | LOW | PASS | `web/confidentialite.txt:70` | aucune catégorie particulière de données |
| SEC-TEST-001 | MEDIUM | FAIL | `.github/workflows/verification.yml:113` | Actions : H3 |
| SEC-TEST-002 | HIGH | FAIL | voir REQ-CI-001 | actions H3, H4 |
| SEC-TEST-003 | HIGH | FAIL | dépendances : audit ; image : `.github/workflows/publish.yml:49` | actions H3, H14 |
| SEC-TEST-004 | MEDIUM | FAIL | aucun passage DAST encore | ZAP en mode « baseline » contre la VM d’essai : action H14 |
| SEC-TEST-005 | LOW | FAIL | voir REQ-WEB-001 | notation après HTTPS : action H1 |
| SEC-TEST-006 | HIGH | PASS | voir REQ-CI-006 |  |
| SEC-TEST-007 | LOW | PASS | sondage manuel mené le jour de cet audit : identifiants devinés, champs inconnus, rôles, corps géants, fichiers piégés, injection dans la consigne — chacun devenu un essai |  |
| SEC-TEST-008 | LOW | N/A | ni argent, ni santé, ni large public : service auto-hébergé pour quelques comptes invités ; `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |  |

## Not applicable
| ID | Why, with proof |
|---|---|
| REQ-CRYPT-003 | bcrypt absent : `grep -rniE "bcrypt" socle/src src` → 0 ligne ; Argon2id seul |
| SEC-AUTH-008 | aucune connexion par fournisseur externe : `grep -rniE "oauth\|openid\|id_token\|redirect_uri" socle/src src` → seulement le nom de variable CLAUDE_CODE_OAUTH_TOKEN (jeton transmis à la CLI de l’adversaire) |
| SEC-SESS-005 | aucun JWT : `grep -rniE "jwt\|jsonwebtoken\|jose" src web socle` → 0 ligne |
| SEC-SESS-006 | aucun jeton de rafraîchissement : sessions serveur (voir SEC-SESS-005) |
| SEC-AUTHZ-005 | aucune organisation ni espace partagé : chaque objet appartient à un seul compte (`src/base.js:98`) |
| SEC-INJ-002 | aucun ORM : node:sqlite, requêtes préparées seulement |
| SEC-INJ-003 | aucune base documentaire : SQLite seulement |
| SEC-INJ-006 | aucun moteur de gabarit : `grep -rniwE "handlebars\|ejs\|nunjucks\|mustache" src socle/src` → 0 ligne ; `grep -rnE "new Function\|node:vm" src socle/src` → 0 ligne |
| SEC-INJ-007 | aucun analyseur XML côté serveur : `grep -rniE "xml2js\|sax\|libxml\|fast-xml" src socle/src` → 0 ligne |
| SEC-XSS-007 | aucune redirection pilotée par paramètre : `grep -rnE "searchParams.get\(.(next\|redirect)" src web socle` → 0 ligne |
| SEC-CSRF-006 | aucune redirection : voir SEC-XSS-007 |
| SEC-API-006 | aucun GraphQL : `grep -rniE "graphql\|apollo" src web socle` → 0 ligne |
| SEC-API-008 | aucune opération monétaire ni crédit : `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |
| SEC-DB-002 | SQLite embarqué sans rôle ni identifiant : `src/base.js:43` |
| SEC-DB-008 | le navigateur ne parle jamais à la base : SQLite côté serveur seulement |
| SEC-FILE-006 | aucun fichier partagé entre utilisateurs : les pièces jointes ne sont ni stockées ni redistribuées |
| SEC-FILE-007 | aucune image acceptée : pièces jointes texte seulement |
| SEC-FILE-008 | aucun import par URL : voir SEC-CSRF-004 |
| SEC-PAY-001 | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |
| SEC-PAY-002 | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement ; aucun webhook reçu |
| SEC-PAY-003 | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement ; aucun abonnement |
| SEC-PAY-004 | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |
| SEC-PAY-005 | `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |
| SEC-NEXT-001 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |
| SEC-NEXT-002 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |
| SEC-NEXT-003 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |
| SEC-NEXT-004 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |
| SEC-NEXT-005 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |
| SEC-NEXT-006 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |
| SEC-NEXT-007 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne |
| SEC-NEXT-008 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne ; aucun déploiement Vercel |
| SEC-NEXT-009 | Node sans cadriciel : `package.json:5`, aucune dépendance ; `grep -rniE "next/\|nextjs\|use server" src web socle` → 0 ligne ; aucune bibliothèque de cache client |
| SEC-BAAS-001 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-002 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-003 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-004 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-005 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-006 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-007 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-008 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-009 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-010 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BAAS-011 | `grep -rniE "supabase\|firebase\|firestore\|postgrest" src web socle` → 0 ligne ; base SQLite embarquée : `src/base.js:43` |
| SEC-BE-005 | aucun Django : service Node |
| SEC-BE-006 | aucun Flask ni FastAPI : la version Python est retirée par cette réécriture |
| SEC-BE-007 | aucun code Python servi |
| SEC-BE-008 | aucun PHP |
| SEC-WP-001 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-WP-002 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-WP-003 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-WP-004 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-WP-005 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-WP-006 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-WP-007 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-WP-008 | application Node écrite ici : `grep -rniE "wordpress\|wp-admin\|bubble\|webflow" src web socle` → 0 ligne |
| SEC-INFRA-005 | aucun stockage objet : `grep -rniE "s3\|aws\|gcs\|azure\|bucket" src socle/src` → 0 ligne |
| SEC-INFRA-006 | aucun nuage : service auto-hébergé, aucune clé IAM |
| SEC-INFRA-009 | aucune infrastructure décrite en code : `find . -name "*.tf" -o -name "Pulumi.yaml"` → 0 fichier |
| SEC-TEST-008 | ni argent, ni santé, ni large public : service auto-hébergé pour quelques comptes invités ; `grep -rniE "stripe\|paypal\|checkout\|invoice\|payout\|refund" src web/*.js socle/src socle/web/*.js` → 0 ligne : aucun paiement |

## Anonymity (REQ-ANON-001 to -010)
Arbre de travail : 0 occurrence de la liste d'anonymat et des motifs de l'annexe B.1 ; 4 correspondances du motif « .local » sont une propriété JavaScript. Cette version retire 19 occurrences dans 6 fichiers du dernier arbre publié (domaine, fuseau horaire, chemins et montages de l'hôte, nom de compte de l'hôte, référence à l'infrastructure personnelle) et nettoie les métadonnées d'un fichier binaire embarqué. Exposition résiduelle : ces 19 occurrences et un décalage horaire non nul (auteur et validateur) restent dans les 5 commits publiés avant cette session. Les 9 nouveaux commits sont en UTC, sous l'identité unique du dépôt, sans mention d'outil. Détail, options et commandes dans le rapport d'anonymat hors dépôt.
## Human actions required
Ce qu'aucun agent ne peut faire à la place de l'exploitant. Cette liste bloque la mise en production tant qu'elle n'est pas vide.

| # | Action | Contrôles | Étapes |
|---|---|---|---|
| H1 | Servir DIALEKT en HTTPS | REQ-WEB-001, SEC-HDR-001, SEC-INFRA-001, SEC-TEST-005 | Dans le Hub : Relay ou certificat de l'autorité locale pour DIALEKT ; déclarer l'adresse du relais dans « Relais de confiance » (SOCLE_PROXYS) ; passer « Accès sans HTTPS » à Non ; « Adresse publique » en https:// ; vérifier `curl -sI https://<dialekt>/ \| grep -i strict-transport-security` ; noter l'hôte sur SSL Labs ou testssl.sh. |
| H2 | Relais SMTP et adresses d'alerte | REQ-AUTH-014, SEC-PAY-007 | Réglages avancés de DIALEKT dans le Hub : relais, port, chiffrement, identifiants, adresse d'expédition, adresse publique ; publier SPF, DKIM et DMARC pour le domaine d'expédition ; chaque administrateur ajoute puis confirme son adresse dans Sécurité → Alertes par courriel. |
| H3 | GitHub | REQ-CI-001…005, GOV-003, GOV-005, SEC-INFRA-007/008, SEC-TEST-001…003, SEC-DEP-002/006/008 | Rétablir la facturation pour réactiver les Actions ; Settings → Branches : protéger `main` (pas de poussée forcée, contrôles requis : essais, secrets, identite, anonymat, analyse) ; Code security : Dependabot alerts, secret scanning et push protection, private vulnerability reporting ; 2FA sur le compte et sur chaque console de fournisseur. |
| H4 | Liste d'anonymat | REQ-ANON-003, REQ-CI-004, REQ-CI-001 | Sur le poste : `~/.config/git/denylist.txt` (un terme par ligne) et crochet global `core.hooksPath` qui refuse un commit dont le diff contient un terme, plus `gitleaks protect --staged` ; sur GitHub : secret de dépôt `LISTE_ANONYMAT` avec les mêmes termes. |
| H5 | Brûler les clés vues pendant le développement | SEC-SECRETS-006 | Chez chaque fournisseur utilisé comme adversaire, révoquer la clé saisie pendant les essais et en émettre une neuve ; `claude setup-token` pour un nouveau jeton Claude Code et révoquer l'ancien ; coller les nouvelles valeurs dans le Hub ; vérifier un duel. Cet échange tient lieu d'exercice de rotation. |
| H6 | Clés par environnement, budgets | REQ-CFG-003, SEC-SECRETS-005, GOV-004, SEC-LLM-002 | Une clé pour la VM d'essai, une autre pour la production, chacune avec un plafond mensuel et une alerte de facturation chez le fournisseur. |
| H7 | Chiffrement des disques | REQ-DATA-002, SEC-DB-003, SEC-PRIV-005 | LUKS (ou chiffrement du stockage de l'hyperviseur) sur les hôtes qui portent le volume de données. |
| H8 | Sauvegardes et exercices | REQ-DATA-003, SEC-DB-006, REQ-DATA-005 | Sauvegardes chiffrées hors hôte du volume de DIALEKT (fonction du Hub en cours) ; restauration réelle sur la VM, datée ici ; dérouler une fois le runbook ci-dessous. |
| H9 | Hôtes | SEC-INFRA-003 | Pare-feu (seuls les ports publiés), SSH par clé sans root, mises à jour de sécurité automatiques, fail2ban. |
| H10 | Disponibilité vue de l'extérieur | SEC-LOG-005 | Une sonde externe sur /healthz, ou décision écrite : service de réseau local seulement, sondes du Hub suffisantes. |
| H11 | Journaux centralisés | SEC-LOG-003 | Transférer les journaux des conteneurs vers un collecteur hors de l'hôte (pilote de journalisation Docker ou agent). |
| H12 | Décalage horaire dans l'historique publié | REQ-ANON-008 | Voir le rapport d'anonymat hors dépôt : recréer le dépôt depuis l'arbre propre (recommandé, après avoir vérifié qu'aucune bifurcation n'existe), ou réécrire et forcer la poussée, ou accepter l'exposition. Vérifier aussi les paquets du compte (image de la version 1 et son étiquette) et supprimer les journaux d'Actions antérieurs à cette version. |
| H13 | Domaine | REQ-ANON-009, SEC-INFRA-002 | Protection WHOIS, verrou du registraire, 2FA, enregistrement CAA, suppression des enregistrements orphelins. |
| H14 | Crible au déploiement | SEC-INFRA-004, SEC-TEST-003, SEC-TEST-004 | Sur la VM : `trivy image dialekt:2.0.0` sans CRITICAL ni HIGH corrigeable ; `zap-baseline.py -t http://<vm>:8112` ; résultats notés ici. |
| H15 | Transferts hors UE | SEC-PRIV-006 | Accepter les conditions de traitement du fournisseur choisi comme adversaire, ou choisir un fournisseur de l'UE (Mistral) ou le mode local seul. |

Orthographe du pseudonyme : le manuel nomme l'identité « Codex64 » ; les commits, la licence et le compte GitHub portent la forme du compte, identique dans tout l'historique. Changer maintenant créerait une seconde identité dans le journal git ; à trancher par l'exploitant.

## Secrets inventory
| Secret | Where it lives | Scope | Rotation procedure | Last rotated |
|---|---|---|---|---|
| SOCLE_CLE (tirée par le Hub) | coffre du Hub → variable du conteneur | scelle les secrets TOTP | réglages avancés de DIALEKT dans le Hub : l'actuelle dans « Clé maîtresse remplacée », une neuve (`openssl rand -base64 32`) dans « Clé maîtresse », redéployer (TOTP rescellés, journal `coffre.tourne`), vider le champ, redéployer | création à l'installation ; procédure exercée le 2026-09-29 (`outils/exercice-rotation.mjs`) |
| DIALEKT_HUB_TOKEN (HUB_TOKEN, tiré par le Hub) | coffre du Hub → variable | /api/duel, /api/stats, /api/health | régénérer dans le Hub, redéployer DIALEKT | création à l'installation |
| ADVERSAIRE_CLE (émise par le fournisseur de l'adversaire) | coffre du Hub → variable | appels à l'adversaire | révoquer chez le fournisseur, en émettre une neuve, la coller dans le Hub, redéployer | à faire (H5) |
| CLAUDE_CODE_OAUTH_TOKEN (émis par `claude setup-token`) | coffre du Hub → variable | CLI de l'adversaire | `claude setup-token`, révoquer l'ancien dans le compte, coller, redéployer | à faire (H5) |
| SYNAPSE_JETON (tiré par SYNAPSE, remis par le Hub) | dérivé par le Hub | écriture des événements de DIALEKT dans SYNAPSE | révoquer le jeton de cerveau dans SYNAPSE ; le Hub en dérive un neuf au redéploiement | géré par le Hub |
| SOCLE_JETON_INSTALLATION (tiré par le socle) | tiré au premier démarrage, journaux du conteneur | création du premier compte, puis inutile | aucun : invalide dès qu'un compte existe | — |
| SOCLE_SMTP_MOTDEPASSE (émis par le fournisseur de courriel) | coffre du Hub → variable | relais des alertes | changer chez le fournisseur de courriel, coller dans le Hub, redéployer | à la mise en service (H2) |
| MEMORY_API_KEY (émise par la mémoire externe) | variable | mémoire externe facultative | changer côté mémoire, puis dans le Hub | non utilisé |

## Incident runbook
Détecter : alertes « vigie » et « dépense » dans la page Sécurité des administrateurs (et par courriel, H2) ; journal `docker logs <dialekt> | grep '"resultat":"refus"'`.

```bash
# 1. Fermer toutes les sessions sauf la sienne (renfort demandé)
#    Page Comptes → « Fermer toutes les sessions », ou :
curl -X POST -H 'Content-Type: application/json' -H "X-CSRF: $CSRF" -b "$COOKIE" https://<dialekt>/api/compte/admin/sessions/fermer-tout -d '{}'
# 2. Couper l'adversaire (plus aucun appel payant)
#    Hub → DIALEKT → Réglages → vider la clé de l'adversaire → Redéployer
# 3. Tourner les secrets touchés : voir « Secrets inventory »
# 4. Forcer un nouveau mot de passe : Page Comptes → compte → « Réinitialiser » (le second facteur reste exigé)
# 5. Restaurer : arrêter DIALEKT, remettre dialekt.db et settings.json depuis la sauvegarde chiffrée, redémarrer
docker compose -p <dialekt> stop && docker run --rm -v <volume>:/data -v <sauvegarde>:/b busybox sh -c 'cp /b/dialekt.db /data/ && cp /b/settings.json /data/ && chown 1000:1000 /data/*' && docker compose -p <dialekt> start
# 6. Vérifier la chaîne du journal : Page Comptes → Journal de sécurité (« chaîne intacte »)
```
Communiquer : prévenir les comptes concernés ; si des données personnelles ont pu être lues, notifier l'autorité de contrôle sous 72 heures à compter de la découverte (heure de découverte, nature, comptes touchés, mesures prises), et les personnes si le risque est élevé. Revue après incident : cause, chronologie, contrôle qui a manqué, correctif et essai de non-régression.

## Inventory
Routes publiques : `GET /healthz`, `GET /.well-known/security.txt`, `GET /api/compte/etat`, cérémonies de connexion et d'installation (`/api/compte/connexion*`, `/api/compte/installation`, `/api/compte/jeton*`, `/api/compte/courriel/verifier`, `/api/compte/pas-moi/lien`, `/api/compte/deconnexion`), fichiers de `web/` et `socle/web/`. Jeton du Hub : `GET /api/health`, `GET /api/stats`, `POST /api/duel`. Session (lecture) : `/api/models`, `/api/conversations`, `/api/search`, `GET /api/conversation/:ref`, `GET /api/projects`, `/api/compte/*` du compte. Session (membre) : `POST /api/duel/stream`, écritures sur conversations et projets. Administrateur : `POST /api/config`, `POST /api/pull`, `/api/compte/admin/*`.

Données : `dialekt.db` (`oracle.db` avant le changement de nom) (comptes, sessions, jetons hachés, alertes, journal chaîné, conversations, projets, quotas — sensibilité : personnelle), `settings.json` (réglages), volume `/app/data`, dossier en 0700.

Tiers : fournisseur de l'adversaire (clé ou jeton), DuckDuckGo (recherche web, sans clé), Ollama et SYNAPSE de l'exploitant, relais SMTP de l'exploitant.

Suivi du 2026-10-25 (2.2.2) : mise en page, et relais de confiance. Socle 6f2c864 embarqué : un seul écart entre cartes (`--ecart`, 16 px, 12 px sur petit écran), deux colonnes finissant à la même ligne, cartes des pages Sécurité et Comptes l'une sous l'autre, et un contrôle de mise en page qui relève tout écart différent et toute colonne inégale. DIALEKT prend cet écart dans la salle de duel (`web/dialekt.css`) : entre la question, les deux réponses, le verdict, l'échange suivant et la saisie ; les deux réponses d'une rangée finissent à la même ligne ; un fil court se pose au-dessus de la saisie au lieu de laisser un trou sous la dernière réponse ; la liste des conversations et les cartes de Réglages occupent la hauteur de leur rangée ; une conversation ou un projet au nom coupé est une ligne de données, nom entier au survol ; les idées de l'accueil tiennent sur une ligne au téléphone. Le socle nomme désormais `.barre` sa barre d'outils : les barres du verdict, qui portaient ce nom, s'affichaient vides ; elles deviennent `.crit-barre`. Relais de confiance : ouvert en HTTPS par Relay (tunnel Cloudflare), DIALEKT se croyait en HTTP et refusait les clés d'accès, le relais de confiance du manifeste étant vide (`X-Forwarded-Proto` n'est lu que d'un relais déclaré, `socle/src/http.js:43`) ; défaut désormais : le réseau Docker du Hub (`hub.json`, « Relais de confiance »), une adresse du réseau local n'est jamais de confiance. Essai : `test/dialekt.test.js` (« derrière Relay »), le défaut lu comme le socle le lit. Le parcours du navigateur contrôle aussi la page Comptes. Aucune route ne change, aucun contrôle ne change de statut. Essais : 29 du service, 77 du socle ; parcours du navigateur dans les quatre gammes (SOMA, Console, Exploitation, Lavande) : 64 écrans × largeurs chacune, 0 défaut, 0 erreur de console. DIALEKT garde son apparence propre quelle que soit la gamme posée : les quatre passes rendent la même interface.
