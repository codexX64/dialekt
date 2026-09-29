# Code quality record — Oracle

Method: Project Baseline Requirements & Security Manual, Part III (chapters 37-49)
Reviewed: 2026-09-29   ·   Owner: Codex64

## Behaviour freeze
La version 1 (Python) n'avait aucun essai. Le socle de référence a donc été
fixé avant la réécriture, par caractérisation de ce que le Hub et les données
existantes attendent :

- **Juge** : 214 verdicts produits par `judge.py` sous CPython 3.12 sur des
  entrées fabriquées (`test/fixtures/juge.json`), rejoués à l'identique par le
  portage — gardés comme essai de non-régression, car le juge doit rester sur
  la même échelle que les verdicts déjà enregistrés.
- **Contrat du Hub** : `/api/duel` rend `context`, `qwen`, `claude`, `verdict` ;
  `/api/stats` rend `total`, `judged`, `qwen_winrate`, `avg_qwen`, `avg_claude`,
  `gaps`, `last_gap` ; `/api/health` rend `version`, `ollama`, `models`,
  `ollama_model`, `adversaire`, `claude_cli`, `memory`. Diff de l'API publique
  pour le Hub : vide.
- **Données** : `oracle.db` et `settings.json` de la version 1 relus sans
  conversion (essai « migration »).

Ensemble de référence : 22 essais d'Oracle et 37 du socle, tous au vert,
identiques avant et après la relecture. Depuis : socle ré-embarqué (rotation
de la clé maîtresse et du poivre, 50 essais), paramètres Argon2id de
production dans les essais d'Oracle, un essai sur les fichiers cachés : 23
essais d'Oracle et 50 du socle, tous au vert. Parcours Chromium : 57 écrans ×
largeurs, 0 défaut de mise en page, 0 erreur de console.

Changements de comportement voulus, chacun étant le correctif :

| Avant | Après | Raison |
|---|---|---|
| comptes locaux à mot de passe + TOTP | socle commun : quatre facteurs, sessions serveur, renfort | REQ-AUTH, REQ-SESS |
| identifiants de conversation entiers | références aléatoires de 96 bits | SEC-AUTHZ-006 |
| `/healthz` donnait la version | `{ ok: true }` seulement | SEC-BE-010 |
| adresse d'Ollama visible de tout compte | réservée aux administrateurs | SEC-XSS-006 |
| réponses « local seul » comptées comme victoires | seuls les duels comptent | défaut de la version 1 |
| échec d'un téléchargement annoncé « success » | annoncé comme un échec | défaut de la version 1 |
| duels du Hub jugés sans la question | la question accompagne les réponses | défaut de la version 1 |
| contexte externe collé tel quel dans la consigne | contexte balisé, annoncé comme donnée | SEC-LLM-003 |

## Layer status
| Chapter | Subject | Status | What changed |
|---|---|---|---|
| 39 | Comment layer | DONE | bannières de section retirées (8 dans l'interface, 10 dans les comptes du socle, 12 dans la feuille de style) ; apartés d'historique (« la version 1 … ») réécrits en intention ; commentaires gardés : pourquoi, contraintes, références |
| 40 | Naming and vocabulary | DONE | vocabulaire du dépôt : français, métier (duel, adversaire, juge, compte, socle) ; noms génériques renommés (`res` → `resultats`, `trouves`, `reponse` ; `val` → `reserve` ; `tmp` → `provisoire`) ; aide d'essai `monterService` → `monterBanc` |
| 41 | Formatting, layout and whitespace | DONE | style unique : 2 espaces, apostrophes simples, points-virgules, lignes longues tolérées pour les expressions déclaratives de l'interface ; aucun formateur dans le dépôt, aucun n'est introduit |
| 42 | Gratuitous abstraction | DONE | ni interface à une implémentation, ni fabrique, ni suffixe Manager/Service ; l'aide de joignabilité d'Ollama, devenue sans appelant, supprimée |
| 43 | Defensive noise | DONE | 60 `catch` relus un à un, tous étroits (tableau ci-dessous) ; aucun message vague, aucune journalisation d'entrée ou de sortie de fonction |
| 44 | Control flow and idiom | DONE | générateurs asynchrones pour les flux, `for await` sur les réponses, retours anticipés ; aucune imbrication au-delà de trois niveaux dans le serveur |
| 45 | Types, signatures and data shapes | DONE | un contrat par fonction : `idDe` rend un entier ou `null`, les routes lèvent `ErreurHttp` ; `enregistrerDuel` ne rend plus un identifiant que personne ne lisait |
| 46 | Dependencies, configuration, fitting the repository | DONE | aucune dépendance d'exécution ; chaque variable de `.env.example` a un lecteur (vérifié par recherche) ; import inutilisé retiré |
| 47 | Tests | DONE | essais de frontière et de chemins d'erreur : IDOR, balayage sans session et par rôle, bornes, plafonds, cloisonnement, relais déclaré ou non, fichiers cachés ; aucun essai vide ni simulacre de l'objet essayé (les faux sont des serveurs HTTP réels) ; plus aucun paramètre Argon2id abaissé pour aller vite ; trois cassures volontaires, chacune détectée (ci-dessous) |
| 48 | Documentation, furniture and version control | DONE | README décrit le produit, jamais une machine ; `SECURITY.md` et ce fichier ; historique d'un sujet par commit, dans le style du dépôt |

`catch` restants, par raison :

| Raison | Nombre | Où |
|---|---|---|
| adresse ou encodage malformé, refusé | 9 | `src/recherche.js`, `web/rendu.js`, `socle/src/portail.js`, `socle/src/http.js`, `socle/src/config.js` |
| donnée externe illisible (ligne de flux, fichier de réglages, réponse) | 10 | `src/adversaires.js`, `src/ollama.js`, `src/reglages.js`, `web/app.js`, `socle/src/webauthn.js`, `socle/src/http.js`, `socle/web/compte.js`, `socle/essai/client.js` |
| service tiers facultatif (recherche web, mémoire, liste de modèles) : résultat vide annoncé | 3 | `src/recherche.js`, `src/adversaires.js` |
| échec d'un service externe annoncé avec sa cause | 13 | `src/adversaires.js`, `src/ollama.js`, `src/api.js`, `src/synapse.js`, `socle/src/portail.js` |
| vérification cryptographique ou cérémonie WebAuthn refusée | 6 | `socle/src/argon.js`, `socle/src/webauthn.js`, `socle/src/comptes.js`, `socle/src/chiffre.js` |
| refus du garde-fou des modèles traduit en 400 | 3 | `src/adversaires.js`, `src/api.js` |
| présence d'un fichier ou d'un exécutable, processus déjà fini | 3 | `src/adversaires.js`, `socle/src/http.js` |
| annulation de transaction puis relance, canal de notification | 2 | `socle/src/comptes.js` |
| gestionnaire d'erreurs unique d'une requête, d'une action d'interface | 5 | `src/main.js`, `web/app.js`, `web/rendu.js`, `socle/web/compte.js`, `socle/test/banc.js` |
| stockage du navigateur indisponible | 2 | `socle/web/compte.js` |
| configuration illisible (fichier `_FILE`) | 1 | `socle/src/config.js` |
| diagnostic et saut d'essai | 3 | `test/juge.test.js`, `socle/test/crypto.test.js` |

## Tests
Cassures volontaires (REQ-CODE-005) : chacune posée seule, l'essai lancé, le fichier rétabli.

| Cassure | Fichier | Essai qui échoue |
|---|---|---|
| n'importe quel jeton passe pour celui du Hub | `src/api.js` | « le jeton du Hub n'ouvre que duel, chiffres et état » |
| la conversation d'un autre compte devient lisible | `src/base.js` | « les conversations d'un compte sont invisibles et intouchables pour les autres » |
| le juge ne note plus comme la version 1 | `src/juge.js` | « les verdicts de la version Python sont reproduits à l'identique » |

## Repository style profile
Node 24, modules ES, aucune dépendance. Serveur : `node:http`, `node:sqlite`,
`crypto.argon2` ; interface : DOM construit par `h()`, jamais de balisage
injecté. Vocabulaire français, identifiants et messages compris. Erreurs :
`ErreurHttp(status, message, details)` levée au plus près, formatée une seule
fois par `repondreErreur`. Configuration : `lireConfig` sur un schéma, arrêt au
démarrage à la première incohérence. Journalisation : `journal.ecrire` pour ce
qui touche la sécurité, `log` pour l'exploitation. Frontières : `src/` le
service, `socle/` le commun embarqué (modifié dans son propre dépôt, jamais
ici), `web/` l'interface, `test/` les essais. Aides existantes reprises plutôt
que réécrites : `Debit`, `valider`, `lireCorps`, `Routeur`, `feuille`,
`dialogue`, `ajouterPictos`.

## Detection sweep
Commandes de l'annexe B.5, sur `src web test outils socle deploy Dockerfile .github hub.json`
(hors `katex-0.18.7.min.js`, fichier tiers, et `test/fixtures/juge.json`, données) :

| Commande | Résultat |
|---|---|
| bruit de commentaires (`Step`, `Initialize`, `Loop through`, `Return the`…) | 0 |
| bannières (`// ----------`) | 0 |
| « simplified implementation », « for demo purposes »… | 0 |
| emoji | 0 |
| fonctions `process`/`handle`/`manage`/`perform`/`execute`/`do…` | 0 |
| suffixes Manager/Service/Handler/Provider/Factory/Helper/Util/Wrapper/Processor/Engine | 0 |
| fichiers `utils`/`helpers`/`common`/`misc`/`shared` | 0 |
| affectations `data`/`result`/`output`/`temp`/`tmp`/`res`/`ret`/`val`/`obj`/`item` | 0 |
| `catch (e)` et `catch {` | 60, justifiés ci-dessus |
| « An error occurred », « Something went wrong », « Unexpected error » | 0 |
| `: any`, `as unknown as` | 0 |
| essais vides (`assert.ok(true)`, `toBeDefined()`) | 0 |
| `your_api_key`, `xxx`, `changeme`, `<your`, `TODO`, `FIXME`, `placeholder` | 15 : attributs HTML `placeholder` de l'interface, le mot « changement », le gabarit `XXXX-XXXX` du champ de code de secours, et la liste des valeurs d'exemple que la configuration refuse |
| caractères invisibles | 0 |
| imports inutilisés (analyse des liaisons importées) | 0 |
| `npx depcheck` | sans objet : aucune dépendance |

## Verification (chapter 49)
- [x] Full suite passes and matches the baseline — 22 essais d'Oracle et 37 du socle à la relecture ; 23 et 50 aujourd'hui, tous verts
- [x] Public API diff empty — contrat du Hub épinglé par l'essai « le jeton du Hub n'ouvre que duel, chiffres et état »
- [x] Characterisation tests deleted after use — aucun essai temporaire ; les vecteurs du juge restent, volontairement
- [x] Read-aloud test passed — chaque commentaire restant dit pourquoi ou prévient d'une contrainte
- [x] Blind-comparison test passed — les fichiers réécrits suivent le vocabulaire, les aides et la forme du socle
- [x] Commit history: one concern per commit, repository style, no attribution trailers
- [x] REQ-CODE-001 to REQ-CODE-006 all PASS
