// Ce qu'Oracle raconte à SYNAPSE : chaque duel départagé (scores, jamais les
// réponses), un modèle téléchargé, une panne d'Ollama (une fois par panne), un
// réglage changé (jamais une clé). Sans SYNAPSE_URL ni jeton, rien ne part.
// Les envois passent par une file bornée vidée en arrière-plan : SYNAPSE lent
// ou absent ne ralentit jamais une réponse.
const FILE_MAX = 300, LOT = 50;

// Les scores s'écrivent comme en Python (7.0, pas 7) : les titres restent
// identiques à ceux de la version 1 dans l'historique de SYNAPSE.
const nombre = x => (typeof x === 'number' && Number.isInteger(x) ? x.toFixed(1) : String(x));

export class Synapse {
  constructor({ url, jeton, log = console }) {
    this.url = url; this.jeton = jeton; this.log = log;
    this.file = []; this.pannes = new Map(); this.attente = 5000; this.minuterie = null;
    this.etat = { envoyes: 0, echecs: 0, perdus: 0, dernierEnvoi: null, erreur: null };
  }
  get pret() { return !!(this.url && this.jeton); }

  raconter(kind, titre, { corps = '', tags = [], meta = null } = {}) {
    if (!this.pret) return;
    const e = { kind, title: String(titre).slice(0, 300), tags: [...new Set(['oracle', ...tags])].sort(), occurred_at: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z') };
    if (corps) e.body = String(corps).slice(0, 2000);
    if (meta) e.meta = meta;
    this.file.push(e);
    while (this.file.length > FILE_MAX) { this.file.shift(); this.etat.perdus++; }
    if (!this.minuterie) this.minuterie = setTimeout(() => this.vider(), 2000).unref();
  }

  async vider() {
    const lot = this.file.slice(0, LOT);
    try {
      const r = await fetch(`${this.url}/v1/ingest/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${this.jeton}` }, body: JSON.stringify({ events: lot }), signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`SYNAPSE ${r.status}`);
      this.file.splice(0, lot.length);
      Object.assign(this.etat, { envoyes: this.etat.envoyes + lot.length, dernierEnvoi: new Date().toISOString(), erreur: null });
      this.attente = 5000;
      this.minuterie = this.file.length ? setTimeout(() => this.vider(), 2000).unref() : null;
    } catch (e) {
      this.etat.echecs++; this.etat.erreur = String(e.message).slice(0, 160);
      this.minuterie = setTimeout(() => this.vider(), this.attente).unref();
      this.attente = Math.min(300_000, this.attente * 2);
    }
  }

  duel(question, verdict, local, adverse, nomAdverse) {
    if (!['qwen', 'claude'].includes(verdict.winner)) return;
    const q = verdict.qwen?.total, c = verdict.claude?.total;
    const nom = verdict.winner === 'qwen' ? local : adverse;
    this.raconter('duel.verdict', `Duel : ${nom} l'emporte (${nombre(q)} contre ${nombre(c)})`, {
      corps: `Question : « ${String(question).slice(0, 160)} »\nLocal ${local} : ${nombre(q)} · ${nomAdverse} ${adverse} : ${nombre(c)} · écart ${nombre(verdict.gap)}.`,
      tags: ['duel', String(nomAdverse).toLowerCase()],
      meta: { gagnant: verdict.winner === 'qwen' ? 'local' : 'adversaire', local, adversaire: nomAdverse, modele_adverse: adverse, score_local: q, score_adverse: c, gap: verdict.gap },
    });
  }
  modele(nom) { this.raconter('model.pull', `Modèle téléchargé : ${nom}`, { tags: ['modele'], meta: { modele: nom } }); }
  panne(message) {
    const cle = 'ollama:' + String(message).slice(0, 80);
    if (Date.now() - (this.pannes.get(cle) || 0) < 600_000) return;
    this.pannes.set(cle, Date.now());
    this.raconter('incident.ollama', `Oracle : Ollama ne répond pas — ${String(message).slice(0, 160)}`, { tags: ['panne', 'ollama'], meta: { message: String(message).slice(0, 300) } });
  }
  reglage(titre, meta) { this.raconter('oracle.config', String(titre).slice(0, 200), { tags: ['reglage'], meta: meta || {} }); }
}
