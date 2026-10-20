// Un duel : la même question au modèle local et à l'adversaire, en parallèle,
// puis le verdict du juge. Produit la suite d'événements que l'interface lit
// en flux (format de la version 1 : ctx, status, web, delta, meta, verdict, done).
import { File } from './flux.js';
import { juger } from './juge.js';
import { systemePour } from './reglages.js';
import { rechercher, formaterResultats, contexteMemoire } from './recherche.js';

const MAX_PIECE = 40_000;

export function piecesJointes(pieces = []) {
  const parts = [];
  for (const a of pieces) {
    if (a.type === 'image') parts.push(`[Image jointe : ${a.name}]`);
    else parts.push(`--- Fichier joint : ${a.name} ---\n${a.data.length > MAX_PIECE ? a.data.slice(0, MAX_PIECE) + '\n…(tronqué)' : a.data}\n--- fin ---`);
  }
  return parts.join('\n\n');
}

export class Duels {
  constructor({ cfg, ollama, adversaires, reglages, conversations, synapse }) {
    Object.assign(this, { cfg, ollama, adversaires, reglages, conversations, synapse });
  }

  // Le modèle retenu pour l'adversaire en service : celui choisi dans DIALEKT,
  // sauf si le Hub a changé ADVERSAIRE_MODELE depuis ce choix.
  async modeleAdverse(demande) {
    const r = this.reglages.lire();
    const f = this.adversaires.f;
    const retenu = r.modeles_adversaire?.[f.id];
    const choisi = retenu && (retenu.env || '') === (f.modeleEnv || '') ? retenu.modele : null;
    const ancien = f.genre === 'cli' || f.genre === 'anthropic' ? r.claude_model : null;
    return this.adversaires.choisir(demande, choisi, ancien);
  }

  async *derouler({ compte, q, seul, modeleLocal, modeleAdverse, convId, web, pieces, signal }) {
    const r = this.reglages.lire();
    let ctx = await contexteMemoire({ url: this.cfg.memoireUrl, cle: this.cfg.memoireCle }, q);
    if (ctx) yield { t: 'ctx', text: ctx.slice(0, 80) + '…' };
    const joints = piecesJointes(pieces);
    if (joints) ctx = (ctx ? ctx + '\n\n' : '') + joints;
    if (web && this.cfg.rechercheWeb) {
      yield { t: 'status', text: 'Recherche web en cours…' };
      const trouves = await rechercher(q);
      if (trouves.length) { ctx = (ctx ? ctx + '\n\n' : '') + formaterResultats(trouves); yield { t: 'web', results: trouves }; }
      else yield { t: 'status', text: 'Aucun résultat web trouvé' };
    }
    const historique = seul && convId ? this.conversations.historique(compte, convId) || [] : [];
    const om = modeleLocal || r.ollama_model;
    const systeme = systemePour(ctx);
    const file = new File();
    const producteurs = [this.ollama.diffuser({ modele: om, systeme, question: q, historique, reglages: r, file, signal })];
    let attendus = 1;
    const f = this.adversaires.f;
    if (!seul) {
      attendus = 2;
      const manque = this.adversaires.pret();
      const cm = manque ? null : await this.modeleAdverse(modeleAdverse);
      if (manque || !cm) file.pousser(['meta', { side: 'claude', model: cm || f.nom, ms: 0, error: manque || `Choisis le modèle de ${f.nom} dans les réglages de DIALEKT.` }]);
      else producteurs.push(this.adversaires.diffuser({ modele: cm, systeme, question: q, contexte: ctx, jetons: r.num_predict, file, signal }));
    }
    let local = null, adverse = null;
    for (let n = 0; n < attendus;) {
      const [type, d] = await file.prendre();
      if (type === 'delta') yield { t: 'delta', side: d.side, text: d.text };
      else { n++; if (d.side === 'qwen') local = d; else adverse = d; yield { t: 'meta', ...d }; }
    }
    await Promise.allSettled(producteurs);
    local ||= { model: om, text: '', ms: 0 };
    adverse ||= { model: '', text: '' };
    const verdict = juger(local, adverse, { seul, question: q });
    if (!seul) this.synapse.duel(q, verdict, local.model || '', adverse.model || '', f.nom);
    const cid = convId || this.conversations.creer(compte, q, seul ? 'qwen' : 'duel');
    this.conversations.enregistrerDuel(cid, q, seul ? 'qwen' : 'duel', local, seul ? { model: null, text: '' } : adverse, verdict);
    yield { t: 'verdict', verdict, conv_id: this.conversations.refDe(cid) };
    yield { t: 'done' };
  }

  // D'un bloc, pour l'action du Hub : rien n'est enregistré dans un compte.
  async unBloc({ q, seul, modeleAdverse }) {
    const r = this.reglages.lire();
    const ctx = await contexteMemoire({ url: this.cfg.memoireUrl, cle: this.cfg.memoireCle }, q);
    const systeme = systemePour(ctx);
    const signal = AbortSignal.timeout(300_000);
    const [local, adverse] = await Promise.all([
      this.ollama.demander({ modele: r.ollama_model, systeme, question: q, reglages: r }),
      seul ? Promise.resolve({ model: '', text: '' }) : (async () => {
        const manque = this.adversaires.pret();
        const cm = manque ? null : await this.modeleAdverse(modeleAdverse);
        if (manque || !cm) return { model: cm || this.adversaires.f.nom, ms: 0, error: manque || 'modèle de l’adversaire non choisi' };
        const file = new File();
        await this.adversaires.diffuser({ modele: cm, systeme, question: q, contexte: ctx, jetons: r.num_predict, file, signal });
        for (;;) { const [type, d] = await file.prendre(); if (type === 'meta') return d; }
      })(),
    ]);
    // Le juge a besoin de la question : sans elle, tout duel sortirait
    // « trivial », sans gagnant.
    const verdict = juger(local, adverse, { seul, question: q });
    if (!seul) this.synapse.duel(q, verdict, local.model || '', adverse.model || '', this.adversaires.f.nom);
    return { context: ctx ? ctx.slice(0, 80) + '…' : '', qwen: local, claude: adverse, verdict };
  }
}
