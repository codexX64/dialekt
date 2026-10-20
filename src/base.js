// Base de DIALEKT : conversations, duels, projets, quotas. Même fichier que la
// version 1 (oracle.db, renommé dialekt.db) : les tables existantes sont reprises telles quelles,
// et chaque ligne gagne un propriétaire (compte), filtré dans chaque requête.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

// Identifiant public d'une conversation ou d'un projet : 96 bits aléatoires.
// L'entier de la base ne sort jamais ; il ne dit ni combien il y en a, ni où
// chercher la suivante (SEC-AUTHZ-006).
export const REF = /^[A-Za-z0-9_-]{16}$/;
const nouvelleRef = () => crypto.randomBytes(12).toString('base64url');

/**
 * Le dossier et chaque fichier de la base doivent être inscriptibles par
 * l'utilisateur du service : sinon SQLite ouvre la base, puis refuse chaque
 * écriture (« readonly database ») et le service tourne en boucle sans dire
 * pourquoi. On s'arrête au démarrage, avec la cause et le remède.
 */
export function exigerInscriptible(chemins, acces = f => fs.accessSync(f, fs.constants.W_OK)) {
  for (const f of chemins) {
    if (!fs.existsSync(f)) continue;
    try { acces(f); } catch {
      throw new Error(`${f} n'est pas inscriptible par l'utilisateur du service (uid ${process.getuid?.() ?? '?'}) : rends-lui le dossier de données (chown -R) avant de démarrer.`);
    }
  }
}

export function ouvrirBase(dossier) {
  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
  const fichier = path.join(dossier, 'dialekt.db');
  const fichiers = [fichier, fichier + '-wal', fichier + '-shm'];
  const ancien = path.join(dossier, 'oracle.db');
  exigerInscriptible([dossier, ...fichiers, ancien, ancien + '-wal', ancien + '-shm']);
  // Le service s'appelait Oracle : sa base prend le nouveau nom, journaux compris, une fois.
  if (!fs.existsSync(fichier) && fs.existsSync(ancien)) {
    for (const suffixe of ['-wal', '-shm', '']) if (fs.existsSync(ancien + suffixe)) fs.renameSync(ancien + suffixe, fichier + suffixe);
  }
  // Base et journaux lisibles du seul service, quel que soit le masque du processus.
  fs.closeSync(fs.openSync(fichier, 'a', 0o600));
  for (const f of fichiers) if (fs.existsSync(f)) fs.chmodSync(f, 0o600);
  const db = new DatabaseSync(fichier);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, title TEXT, mode TEXT);
    CREATE TABLE IF NOT EXISTS duels(
      id INTEGER PRIMARY KEY AUTOINCREMENT, conv_id INTEGER, ts REAL, question TEXT, mode TEXT,
      qwen_model TEXT, claude_model TEXT, qwen_text TEXT, claude_text TEXT, qwen_ms INTEGER, claude_ms INTEGER,
      winner TEXT, gap REAL, kind TEXT, qwen_score REAL, claude_score REAL, verdict TEXT);
    CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, color TEXT, ts REAL, user_id INTEGER);
    CREATE TABLE IF NOT EXISTS quotas(compte TEXT NOT NULL, jour TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY(compte, jour));`);
  // Colonnes ajoutées au fil des versions, sur une base qui les ignore encore.
  const colonne = db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?');
  for (const [table, nom, ajout] of [
    ['conversations', 'project_id', 'ALTER TABLE conversations ADD COLUMN project_id INTEGER'],
    ['conversations', 'user_id', 'ALTER TABLE conversations ADD COLUMN user_id INTEGER'],
    ['conversations', 'pinned', 'ALTER TABLE conversations ADD COLUMN pinned INTEGER DEFAULT 0'],
    ['conversations', 'compte', 'ALTER TABLE conversations ADD COLUMN compte TEXT'],
    ['duels', 'conv_id', 'ALTER TABLE duels ADD COLUMN conv_id INTEGER'],
    ['projects', 'compte', 'ALTER TABLE projects ADD COLUMN compte TEXT'],
    ['conversations', 'ref', 'ALTER TABLE conversations ADD COLUMN ref TEXT'],
    ['projects', 'ref', 'ALTER TABLE projects ADD COLUMN ref TEXT'],
  ]) if (!colonne.get(table, nom)) db.exec(ajout);
  const sansRef = [
    [db.prepare('SELECT id FROM conversations WHERE ref IS NULL'), db.prepare('UPDATE conversations SET ref = ? WHERE id = ?')],
    [db.prepare('SELECT id FROM projects WHERE ref IS NULL'), db.prepare('UPDATE projects SET ref = ? WHERE id = ?')],
  ];
  for (const [lire, poser] of sansRef) for (const { id } of lire.all()) poser.run(nouvelleRef(), id);
  db.exec(`CREATE INDEX IF NOT EXISTS conv_compte ON conversations(compte, pinned, ts);
    CREATE INDEX IF NOT EXISTS duels_conv ON duels(conv_id);
    CREATE INDEX IF NOT EXISTS projets_compte ON projects(compte);
    CREATE UNIQUE INDEX IF NOT EXISTS conv_ref ON conversations(ref);
    CREATE UNIQUE INDEX IF NOT EXISTS projets_ref ON projects(ref);`);
  return db;
}

const secondes = () => Date.now() / 1000;
const echappeLike = s => s.replace(/[\\%_]/g, c => '\\' + c);

export class Conversations {
  constructor(db) { this.db = db; }

  // Entier interne d'une conversation ou d'un projet du compte ; null pour
  // une référence inconnue ou appartenant à un autre compte.
  idDe(compte, ref) { return REF.test(String(ref)) ? this.db.prepare('SELECT id FROM conversations WHERE ref = ? AND compte = ?').get(ref, compte)?.id ?? null : null; }
  idProjet(compte, ref) { return REF.test(String(ref)) ? this.db.prepare('SELECT id FROM projects WHERE ref = ? AND compte = ?').get(ref, compte)?.id ?? null : null; }
  refDe(id) { return this.db.prepare('SELECT ref FROM conversations WHERE id = ?').get(id)?.ref ?? null; }

  lister(compte, limite = 200) {
    const n = Math.min(Math.max(1, limite | 0), 500);
    return this.db.prepare(`
      SELECT co.ref AS id, co.ts, co.title, p.ref AS project_id, co.pinned, co.mode,
             p.name AS project_name, p.color AS project_color,
             (SELECT COUNT(*) FROM duels d WHERE d.conv_id = co.id) AS n,
             (SELECT winner FROM duels d WHERE d.conv_id = co.id ORDER BY d.id DESC LIMIT 1) AS last_winner
      FROM conversations co LEFT JOIN projects p ON p.id = co.project_id AND p.compte = co.compte
      WHERE co.compte = ? ORDER BY co.pinned DESC, co.ts DESC LIMIT ?`).all(compte, n);
  }

  chercher(compte, q) {
    const motif = `%${echappeLike(q)}%`;
    return this.db.prepare(`
      SELECT DISTINCT co.ref AS id, co.ts, co.title, p.ref AS project_id, p.name AS project_name,
             (SELECT winner FROM duels d2 WHERE d2.conv_id = co.id ORDER BY d2.id DESC LIMIT 1) AS last_winner
      FROM conversations co LEFT JOIN duels d ON d.conv_id = co.id LEFT JOIN projects p ON p.id = co.project_id AND p.compte = co.compte
      WHERE co.compte = ? AND (co.title LIKE ? ESCAPE '\\' OR d.question LIKE ? ESCAPE '\\')
      ORDER BY co.ts DESC LIMIT 40`).all(compte, motif, motif);
  }

  // null si la conversation n'existe pas ou n'appartient pas au compte : les
  // deux cas répondent pareil, un identifiant ne confirme rien.
  lire(compte, id) {
    const c = this.db.prepare(`SELECT co.ref AS id, co.ts, co.title, co.mode, p.ref AS project_id, co.pinned
      FROM conversations co LEFT JOIN projects p ON p.id = co.project_id AND p.compte = co.compte WHERE co.id = ? AND co.compte = ?`).get(id, compte);
    if (!c) return null;
    const duels = this.db.prepare(`SELECT ts, question, mode, qwen_model, claude_model, qwen_text, claude_text, qwen_ms, claude_ms, verdict
      FROM duels WHERE conv_id = ? ORDER BY id`).all(id)
      .map(d => ({ ...d, verdict: d.verdict ? JSON.parse(d.verdict) : null }));
    return { conversation: c, duels };
  }

  appartient(compte, id) { return !!this.db.prepare('SELECT 1 FROM conversations WHERE id = ? AND compte = ?').get(id, compte); }

  creer(compte, question, mode, projet = null) {
    const titre = String(question).trim().slice(0, 80) || 'Nouveau duel';
    return Number(this.db.prepare('INSERT INTO conversations(ts, title, mode, compte, project_id, ref) VALUES(?,?,?,?,?,?)')
      .run(secondes(), titre, mode, compte, projet, nouvelleRef()).lastInsertRowid);
  }

  enregistrerDuel(convId, question, mode, local, adverse, verdict) {
    const t = secondes();
    this.db.prepare(`INSERT INTO duels(conv_id, ts, question, mode, qwen_model, claude_model, qwen_text, claude_text,
      qwen_ms, claude_ms, winner, gap, kind, qwen_score, claude_score, verdict) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(convId, t, question, mode, local.model || null, adverse.model || null, local.text || local.error || '', adverse.text || adverse.error || '',
        local.ms ?? null, adverse.ms ?? null, verdict.winner, verdict.gap, verdict.kind, verdict.qwen?.total ?? null, verdict.claude?.total ?? null, JSON.stringify(verdict));
    this.db.prepare('UPDATE conversations SET ts = ? WHERE id = ?').run(t, convId);
  }

  historique(compte, id) {
    if (!this.appartient(compte, id)) return null;
    const h = [];
    for (const d of this.db.prepare('SELECT question, qwen_text FROM duels WHERE conv_id = ? ORDER BY id').all(id)) {
      h.push({ role: 'user', content: d.question });
      if (d.qwen_text) h.push({ role: 'assistant', content: d.qwen_text });
    }
    return h;
  }

  modifier(compte, id, { title, project_id, pinned, clear_project }) {
    if (!this.appartient(compte, id)) return false;
    if (title !== undefined) this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(String(title).trim().slice(0, 80) || 'Sans titre', id);
    if (clear_project) this.db.prepare('UPDATE conversations SET project_id = NULL WHERE id = ?').run(id);
    else if (project_id !== undefined) {
      const projet = this.idProjet(compte, project_id);
      if (!projet) return false;
      this.db.prepare('UPDATE conversations SET project_id = ? WHERE id = ?').run(projet, id);
    }
    if (pinned !== undefined) this.db.prepare('UPDATE conversations SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
    return true;
  }

  supprimer(compte, id) {
    if (!this.appartient(compte, id)) return false;
    this.db.prepare('DELETE FROM duels WHERE conv_id = ?').run(id);
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    return true;
  }

  projets(compte) {
    return this.db.prepare(`SELECT p.ref AS id, p.name, p.color, (SELECT COUNT(*) FROM conversations co WHERE co.project_id = p.id AND co.compte = p.compte) AS n
      FROM projects p WHERE p.compte = ? ORDER BY p.name`).all(compte);
  }
  creerProjet(compte, nom, couleur) {
    const ref = nouvelleRef();
    this.db.prepare('INSERT INTO projects(name, color, ts, compte, ref) VALUES(?,?,?,?,?)').run(String(nom).trim().slice(0, 60) || 'Projet', couleur, secondes(), compte, ref);
    return ref;
  }
  renommerProjet(compte, id, nom) {
    return this.db.prepare('UPDATE projects SET name = ? WHERE id = ? AND compte = ?').run(String(nom).trim().slice(0, 60) || 'Projet', id, compte).changes > 0;
  }
  supprimerProjet(compte, id) {
    if (!this.db.prepare('SELECT 1 FROM projects WHERE id = ? AND compte = ?').get(id, compte)) return false;
    this.db.prepare('UPDATE conversations SET project_id = NULL WHERE project_id = ? AND compte = ?').run(id, compte);
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return true;
  }

  // Statistiques d'un compte, ou de toute l'instance (compte null : le Hub).
  // Seuls les duels comptent : une réponse du modèle local seul n'est pas une
  // victoire.
  stats(compte = null) {
    const filtre = "AND mode = 'duel'" + (compte ? ' AND conv_id IN (SELECT id FROM conversations WHERE compte = ?)' : '');
    const args = compte ? [compte] : [];
    const lignes = this.db.prepare(`SELECT winner, qwen_score, claude_score, gap FROM duels WHERE winner IS NOT NULL ${filtre} ORDER BY id`).all(...args);
    const total = this.db.prepare(`SELECT COUNT(*) n FROM duels WHERE 1 = 1 ${filtre}`).get(...args).n;
    const juges = lignes.filter(l => l.winner === 'qwen' || l.winner === 'claude');
    const n = juges.length;
    const gagnes = juges.filter(l => l.winner === 'qwen').length;
    const moy = cle => (n ? arrondiPy(juges.reduce((s, l) => s + (l[cle] || 0), 0) / n, 2) : 0);
    const ecarts = juges.slice(-20).map(l => l.gap);
    return { total, judged: n, qwen_winrate: n ? arrondiPy(100 * gagnes / n, 0) : 0, avg_qwen: moy('qwen_score'), avg_claude: moy('claude_score'), gaps: ecarts, last_gap: ecarts.at(-1) ?? null };
  }

  // Quota journalier par compte (et pour le Hub) : incrémenté avant l'appel.
  prendreQuota(compte, max) {
    const jour = new Date().toISOString().slice(0, 10);
    const n = this.db.prepare('SELECT n FROM quotas WHERE compte = ? AND jour = ?').get(compte, jour)?.n || 0;
    if (n >= max) return false;
    this.db.prepare('INSERT INTO quotas(compte, jour, n) VALUES(?,?,1) ON CONFLICT(compte, jour) DO UPDATE SET n = n + 1').run(compte, jour);
    this.db.prepare('DELETE FROM quotas WHERE jour < ?').run(new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10));
    return true;
  }

  // Un compte supprimé emporte ses conversations, ses projets et ses quotas
  // (appelé par le socle, dans la même transaction que la suppression).
  effacerCompte(compte) {
    this.db.prepare('DELETE FROM duels WHERE conv_id IN (SELECT id FROM conversations WHERE compte = ?)').run(compte);
    this.db.prepare('DELETE FROM conversations WHERE compte = ?').run(compte);
    this.db.prepare('DELETE FROM projects WHERE compte = ?').run(compte);
    this.db.prepare('DELETE FROM quotas WHERE compte = ?').run(compte);
  }

  // Ce que DIALEKT garde d'un compte, pour l'export de ses données.
  exporter(compte) {
    return {
      projets: this.projets(compte).map(({ id, name }) => ({ id, name })),
      conversations: this.db.prepare('SELECT id FROM conversations WHERE compte = ? ORDER BY ts').all(compte).map(({ id }) => this.lire(compte, id)),
    };
  }
}

// round() de Python pour les moyennes affichées (même convention que le juge).
function arrondiPy(x, n) {
  const exact = Math.abs(x).toFixed(100);
  const [ip, fp = ''] = exact.split('.');
  let c = BigInt(ip + fp.slice(0, n));
  const suite = fp.slice(n), p = suite[0] || '0', reste = suite.slice(1).replace(/0+$/, '');
  if (p > '5' || (p === '5' && (reste || c % 2n === 1n))) c += 1n;
  const s = c.toString().padStart(n + 1, '0');
  const r = Number(n ? `${s.slice(0, -n)}.${s.slice(-n)}` : s);
  return x < 0 ? -r : r;
}
