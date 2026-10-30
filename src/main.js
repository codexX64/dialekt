// Démarrage de DIALEKT : configuration validée, base, socle commun, serveur.
import http from 'node:http';
import path from 'node:path';
import { lireConfigDialekt, VERSION, SPEC_DIALEKT, REGLAGES_DIALEKT } from './config.js';
import { ouvrirBase, Conversations } from './base.js';
import { migrerV1 } from './migration.js';
import { Ollama } from './ollama.js';
import { Adversaires } from './adversaires.js';
import { Reglages, persona } from './reglages.js';
import { Synapse } from './synapse.js';
import { Duels } from './duel.js';
import { creerApi } from './api.js';
import { Debit, ErreurHttp, appliquerReglages, demarrerSocle, lireNouveautes, superviser, entetesSecurite, envelopper, nonceCsp, politiqueContenu, repondreErreur, repondreJson, servirFichier } from '../socle/src/index.js';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CONSOLE = { info: (...a) => console.log(...a), warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) };
// Signalement privé d'une faille, sur le dépôt : lu par le mainteneur.
const CONTACT_SECURITE = 'https://github.com/codexX64/dialekt/security/advisories/new';

export async function demarrer(envBrut = process.env, { log = CONSOLE } = {}) {
  // Les réglages posés par l'assistant complètent l'environnement (qui garde la main).
  const env = appliquerReglages({ dossier: envBrut.DATA_DIR || SPEC_DIALEKT.donnees.defaut, env: envBrut });
  const cfg = lireConfigDialekt(env);
  const db = ouvrirBase(cfg.donnees);
  const socle = await demarrerSocle({
    service: { id: 'dialekt', nom: 'DIALEKT', contactSecurite: CONTACT_SECURITE }, db, dossier: cfg.donnees, env, log,
    assistant: { reglages: REGLAGES_DIALEKT, spec: SPEC_DIALEKT, version: VERSION, controler: lireConfigDialekt },
    version: VERSION, nouveautes: lireNouveautes(new URL('../nouveautes.json', import.meta.url)),
  });
  migrerV1({ db, comptes: socle.comptes, coffre: socle.coffre, dossier: cfg.donnees, log });

  const synapse = new Synapse({ url: cfg.synapseUrl, jeton: cfg.synapseJeton, log });
  const ollama = new Ollama({ url: cfg.ollamaUrl, synapse });
  const adversaires = new Adversaires({ cfg, persona: () => persona() });
  const reglages = new Reglages({ dossier: cfg.donnees, cfg });
  const conversations = new Conversations(db);
  socle.comptes.apresSuppression.push(compte => conversations.effacerCompte(compte));
  socle.portail.exporteur = async compte => conversations.exporter(compte);
  const duels = new Duels({ cfg, ollama, adversaires, reglages, conversations, synapse });
  const api = creerApi({ socle, cfg, conversations, duels, ollama, adversaires, reglages, synapse });

  // Toute requête compte, pages et fichiers compris : une page complète en
  // demande une vingtaine, une rafale automatique des milliers.
  const debit = new Debit({ max: 600 });
  const serveur = http.createServer(envelopper(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://dialekt');
      const ctx = socle.portail.contexte(req, res);
      if (!debit.prendre(ctx.ip)) {
        socle.journal.rare(`debit:${ctx.ip}`, { action: 'limite.atteinte', objet: 'requetes', ip: ctx.ip, resultat: 'refus' });
        throw new ErreurHttp(429, 'Trop de requêtes.');
      }
      ctx.url = url;
      const nonce = nonceCsp();
      entetesSecurite(res, { secure: ctx.securise, csp: politiqueContenu({ nonce, secure: ctx.securise }) });
      if (await socle.portail.traiter(req, res, url, ctx)) return;
      if (await api(ctx)) return;
      if (!['GET', 'HEAD'].includes(req.method)) return repondreJson(res, 405, { error: 'Méthode non admise.' });
      if (url.pathname.startsWith('/socle/') && servirFichier(req, res, path.join(RACINE, 'socle', 'web'), url.pathname.slice(6), { nonce, cache: 'public, max-age=3600' })) return;
      const fichier = url.pathname === '/' ? '/index.html' : url.pathname;
      if (servirFichier(req, res, path.join(RACINE, 'web'), fichier, { nonce, gamme: socle.cfg.gamme })) return;
      repondreJson(res, 404, { error: 'Introuvable.' });
    } catch (e) { repondreErreur(res, e, { journal: log }); }
  }));
  // Bornes du serveur lui-même : une connexion lente ne tient pas un fil ouvert
  // indéfiniment. Les duels en flux durent, eux, jusqu'à cinq minutes.
  serveur.headersTimeout = 20_000;
  serveur.requestTimeout = 330_000;
  serveur.keepAliveTimeout = 5_000;
  await new Promise(r => serveur.listen(cfg.port, cfg.hote, r));
  log.info(`DIALEKT ${VERSION} à l'écoute sur ${cfg.hote}:${cfg.port}`);
  return { serveur, socle, cfg, db, arreter: () => new Promise(r => { socle.arreter(); serveur.close(() => { db.close(); r(); }); }) };
}

// Le processus du conteneur supervise le service et le relance quand
// l'assistant a posé de nouveaux réglages.
if (import.meta.url === `file://${process.argv[1]}` && !superviser()) {
  demarrer().then(({ arreter }) => {
    for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => arreter().then(() => process.exit(0)));
  }).catch(e => { console.error(e.message); process.exit(1); });
}
