// Reprise des comptes de la version 1 (table users d'auth.py) dans le socle.
//
// Les empreintes Argon2id se relisent telles quelles. Les secrets TOTP, qui
// étaient en clair, sont scellés puis la table d'origine disparaît ; les
// anciens codes de secours (32 bits) ne sont pas repris : trop faibles, ils
// sont remplacés à la prochaine connexion. Les conversations et projets
// reçoivent leur propriétaire ; ceux qui n'en avaient pas vont au premier
// administrateur au lieu de rester visibles de tous.
import fs from 'node:fs';
import path from 'node:path';
import { normaliseIdentifiant } from '../socle/src/comptes.js';

export function migrerV1({ db, comptes, coffre, dossier, log = console }) {
  const existe = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  if (!existe('users')) return 0;
  const anciens = db.prepare('SELECT * FROM users ORDER BY id').all();
  const correspondance = new Map();
  comptes.transaction(() => {
    for (const u of anciens) {
      let ident = normaliseIdentifiant(u.username).replace(/[^\p{L}\p{N}._@+-]/gu, '-').slice(0, 60);
      if (ident.length < 3) ident = `compte-${u.id}`;
      if (comptes.parIdentifiant(ident)) ident = `${ident}-${u.id}`;
      const c = comptes.creerCompte({ identifiant: ident, affichage: u.username, role: u.is_admin ? 'admin' : 'membre' });
      const totp = u.totp_enabled && u.totp_secret ? coffre.scelle('totp', String(u.totp_secret).replace(/\s/g, '').toUpperCase(), c.id) : null;
      db.prepare('UPDATE socle_comptes SET mdp = ?, totp = ?, cree = ?, derniere = ? WHERE id = ?')
        .run(u.pw_hash || null, totp, Math.round((u.created || Date.now() / 1000) * 1000), u.last_login ? Math.round(u.last_login * 1000) : null, c.id);
      correspondance.set(u.id, c.id);
    }
    const premierAdmin = anciens.find(u => u.is_admin) || anciens[0];
    for (const [ancien, nouveau] of correspondance) {
      db.prepare('UPDATE conversations SET compte = ? WHERE user_id = ? AND compte IS NULL').run(nouveau, ancien);
      db.prepare('UPDATE projects SET compte = ? WHERE user_id = ? AND compte IS NULL').run(nouveau, ancien);
    }
    if (premierAdmin) {
      db.prepare('UPDATE conversations SET compte = ? WHERE compte IS NULL').run(correspondance.get(premierAdmin.id));
      db.prepare('UPDATE projects SET compte = ? WHERE compte IS NULL').run(correspondance.get(premierAdmin.id));
    }
    db.exec('DROP TABLE IF EXISTS backup_codes; DROP TABLE users;');
  });
  // L'ancienne clé de signature des sessions ne sert plus à rien.
  fs.rmSync(path.join(dossier, '.session_secret'), { force: true });
  comptes.trace({ action: 'migration.v1', details: { comptes: anciens.length } });
  log.info?.(`[migration] ${anciens.length} compte(s) de la version 1 repris dans le socle.`);
  return anciens.length;
}
