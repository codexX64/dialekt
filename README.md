# Oracle

Une IA locale (Ollama) en duel contre une IA en ligne — Claude, ChatGPT, Kimi,
Mistral, DeepSeek, Gemini, Groq, OpenRouter ou toute API compatible OpenAI.
Un juge **déterministe**, jamais un modèle, départage les deux réponses sur des
critères mesurables.

Projet [CodexX64](https://github.com/CodexX64). Licence MIT.

## Ce que fait Oracle

- **Duel** : la même question aux deux modèles, en parallèle et en flux ; le juge
  note substance, richesse, structure, concision et latence, puis désigne un
  gagnant. Les questions trop courtes et les réponses presque identiques ne sont
  pas départagées.
- **Local seul** : le modèle local, sans adversaire ni verdict.
- **Conversations** privées à chaque compte, recherche, épinglage, projets,
  export Markdown.
- **Rendu** Markdown, tableaux, blocs de code, formules (KaTeX servi par Oracle,
  sortie MathML).
- **Recherche web** activable par message, **pièces jointes** texte.
- **Modèles** : choix à la volée, téléchargement depuis l'interface.
- **Statistiques** des duels départagés.

## Comptes et sécurité

Oracle repose sur le socle commun des services : comptes nominatifs, rôles
(`admin`, `membre`, `lecture`), et au moins deux facteurs pour se connecter.

- **Clé d'accès** (Touch ID, Face ID, Windows Hello, clé USB) — exigée pour un
  administrateur quand Oracle est servi en HTTPS.
- **Application d'authentification** (TOTP), configurée par un QR code généré
  localement, dans le navigateur : le secret ne quitte jamais Oracle.
- **Mot de passe** (Argon2id), selon la politique choisie.
- **Dix codes de secours** à usage unique.

Chaque connexion d'un nouvel appareil et chaque changement de facteur est
signalé dans la page Sécurité et, si un relais SMTP est configuré, à l'adresse
d'alerte vérifiée du compte, avec un lien qui ferme toutes les sessions.

Sessions côté serveur, cookies `HttpOnly` et `SameSite=Strict`, en-tête CSRF,
politique de contenu stricte avec nonce, limitation des tentatives avec preuve
de travail, journal de sécurité chaîné. Le détail, contrôle par contrôle, est
dans [SECURITY.md](SECURITY.md).

Les clés d'accès n'existent que sur une page HTTPS. Sans HTTPS, `SOCLE_HTTP=1`
ouvre un mode dégradé, affiché comme tel partout : réservé à un réseau de
confiance, le temps de servir Oracle en HTTPS.

**Tourner la clé maîtresse.** Dans le Hub (réglages avancés d'Oracle) ou dans
`.env` : la clé actuelle dans `SOCLE_CLE_ANCIENNE`, une neuve
(`openssl rand -base64 32`) dans `SOCLE_CLE`, puis redémarrer. Oracle rescelle
chaque secret TOTP en une transaction et le note au journal de sécurité
(`coffre.tourne`) ; les codes de secours restent valables. Vider ensuite
`SOCLE_CLE_ANCIENNE` et redémarrer. Une clé que la base ne connaît pas arrête le
démarrage au lieu de perdre les secrets.

## Installation par le Hub

Dans le Hub : Extensions → Oracle → Installer. Le Hub génère la clé maîtresse
et le jeton de service, branche l'Ollama déclaré et, si elle est installée, la
mémoire SYNAPSE.

Au premier démarrage, Oracle écrit son **jeton d'installation** dans ses
journaux (bouton Journaux du service). Il ne sert qu'une fois : à créer le
premier compte administrateur.

## Installation seule

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs oracle | grep "Jeton d'installation"
```

Ouvrir ensuite `http://<hôte>:8112`, coller le jeton, créer le compte et son
second facteur.

Sans Docker : Node 24.7 ou plus récent, puis `npm start` (aucune dépendance à
installer). Les tests : `npm test`.

## Mise à jour depuis la version 1

La version 2 reprend `oracle.db` et `settings.json` sans perte :

- les comptes et leurs mots de passe Argon2id sont repris tels quels ;
- les secrets TOTP, stockés en clair en version 1, sont scellés ;
- les anciens codes de secours (trop courts) sont remplacés à la connexion
  suivante ;
- chaque conversation et chaque projet reçoit son propriétaire ; ceux qui n'en
  avaient pas vont au premier administrateur.

Le conteneur ne tourne plus en `root`. Un volume créé par la version 1 doit
donc changer de propriétaire une fois, avant le premier démarrage de la 2 :

```bash
docker run --rm -v <volume>:/data busybox cp /data/oracle.db /data/oracle.db.v1
docker run --rm -v <volume>:/data busybox chown -R 1000:1000 /data
```

Claude Code ne se branche plus en montant le dossier `~/.claude` de l'hôte :
l'image embarque Claude Code, qui s'authentifie par le jeton de
`claude setup-token` (`CLAUDE_CODE_OAUTH_TOKEN`).

## L'adversaire

| `ADVERSAIRE` | Adversaire | Authentification |
|---|---|---|
| `claude-code` | Claude, par Claude Code | `CLAUDE_CODE_OAUTH_TOKEN` (abonnement) |
| `claude-api` | Claude, par l'API Anthropic | `ADVERSAIRE_CLE` |
| `openai` | ChatGPT | `ADVERSAIRE_CLE` |
| `kimi` | Kimi (Moonshot) | `ADVERSAIRE_CLE` |
| `mistral`, `deepseek`, `gemini`, `groq`, `openrouter` | le fournisseur du même nom | `ADVERSAIRE_CLE` |
| `compatible` | toute API compatible OpenAI | `ADVERSAIRE_URL`, et la clé si elle en demande une |

Sans clé ni jeton pour l'adversaire, Oracle reste utilisable en local seul.
Le modèle de l'adversaire se choisit dans les réglages, dans la liste que le
fournisseur renvoie lui-même. Pour Claude, seuls Opus, Sonnet et Haiku passent
le garde-fou. La clé ne quitte jamais le serveur d'Oracle ; Claude Code tourne
sans outil, sans serveur MCP, sans session conservée, dans un dossier vide.

## Configuration

Chaque variable secrète peut aussi être lue d'un fichier : `NOM_FILE=/chemin`.
Une valeur invalide arrête Oracle au démarrage avec la liste des erreurs.

| Variable | Rôle | Défaut |
|---|---|---|
| `OLLAMA_URL` | adresse de l'Ollama | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | modèle local par défaut | `qwen3:14b` |
| `ADVERSAIRE` | voir le tableau ci-dessus ; vide : réglages de la version 1 (`CLAUDE_MODE`) | `claude-code` |
| `ADVERSAIRE_CLE` | clé d'API du fournisseur | — |
| `ADVERSAIRE_MODELE` | modèle imposé ; vide : choisi dans les réglages | — |
| `ADVERSAIRE_URL` / `ADVERSAIRE_NOM` | adresse (`…/v1`) et nom affiché, pour `compatible` | — |
| `CLAUDE_CODE_OAUTH_TOKEN` | jeton de `claude setup-token` | — |
| `CLAUDE_BIN` | chemin de Claude Code s'il n'est pas dans le `PATH` | `claude` |
| `CLAUDE_MODE`, `CLAUDE_MODEL`, `ANTHROPIC_API_KEY` | réglages de la version 1, lus si `ADVERSAIRE` est vide | — |
| `ORACLE_DUELS_JOUR` | duels par compte et par jour | `200` |
| `ORACLE_DUELS_MINUTE` | duels par compte et par minute | `6` |
| `ORACLE_JETONS_MAX` | plafond de longueur d'une réponse | `8192` |
| `ORACLE_RECHERCHE_WEB` | recherche web autorisée | `1` |
| `ORACLE_HUB_TOKEN` | jeton du Hub : santé, palmarès, lancement d'un duel | — |
| `SYNAPSE_URL` / `SYNAPSE_JETON` | mémoire partagée : verdicts, modèles téléchargés, pannes d'Ollama — jamais les conversations | — |
| `MEMORY_URL` / `MEMORY_API_KEY` | mémoire externe consultée avant de répondre | — |
| `DATA_DIR` | dossier de `oracle.db` et `settings.json` | `/app/data` |
| `PORT` / `HOTE` | écoute | `8112` / `0.0.0.0` |
| `SOCLE_CLE` | clé maîtresse, 32 octets en base64 ; vide : créée dans `DATA_DIR/cles` | — |
| `SOCLE_CLE_ANCIENNE` | pendant une rotation seulement : la clé remplacée | — |
| `SOCLE_HTTP` | `1` : mode dégradé sans HTTPS | `0` |
| `SOCLE_PROXYS` | relais inverses de confiance (CIDR) | — |
| `SOCLE_ORIGINES` | origines acceptées en plus de celle de la page | — |
| `SOCLE_JETON_INSTALLATION` | jeton du premier compte ; vide : tiré au démarrage | — |
| `SOCLE_POLITIQUE_MOTDEPASSE` / `_TOTP` / `_CLE` | `desactive`, `facultatif`, `requis` ou `requis_admin` | `facultatif` / `facultatif` / `requis_admin` |
| `SOCLE_SESSION_HEURES` / `SOCLE_INACTIVITE_MINUTES` | durée absolue et inactivité d'une session | `12` / `60` |
| `SOCLE_ARGON2_M` / `_T` / `_P` | paramètres Argon2id (plancher 19456 / 2 / 1) | `65536` / `3` / `4` |
| `SOCLE_POIVRE` | poivre HMAC des mots de passe (32 caractères au moins) | — |
| `SOCLE_POIVRE_ANCIEN` | pendant une rotation du poivre : l'ancien (`aucun` s'il n'y en avait pas) | — |
| `SOCLE_URL_PUBLIQUE` | adresse publique (`https://…`), d'où partent les liens des courriels | — |
| `SOCLE_SMTP_HOTE` / `_PORT` / `_SECURITE` | relais des alertes par courriel : `tls` (465) ou `starttls` (587), jamais en clair | — / 465 / `tls` |
| `SOCLE_SMTP_UTILISATEUR` / `_MOTDEPASSE` / `_DE` | identifiants du relais et adresse d'expédition | — |
| `SOCLE_SMTP_AUTORITE_FILE` | certificat d'autorité d'un relais interne (PEM) | système |

## Derrière un relais inverse

Déclarer l'adresse du relais dans `SOCLE_PROXYS` ; sans cela, Oracle ignore
`X-Forwarded-For` et `X-Forwarded-Proto`, et limite les tentatives par
l'adresse du relais. Le relais doit transmettre :

```
X-Forwarded-For, X-Forwarded-Proto, Host
```
