// Le modèle local, par Ollama.
import { lignes, ms } from './flux.js';

export const CATALOGUE = [
  { name: 'qwen3:14b', desc: 'généraliste ~9 Go — reco 16 Go', size: '9.3 GB' },
  { name: 'qwen3:8b', desc: 'généraliste léger ~6 Go', size: '5.2 GB' },
  { name: 'qwen2.5-coder:7b', desc: 'code-first, rapide', size: '4.7 GB' },
  { name: 'gpt-oss:20b', desc: 'raisonnement +, serré en 16 Go', size: '13 GB' },
  { name: 'llama3.1:8b', desc: 'généraliste Meta', size: '4.9 GB' },
  { name: 'deepseek-r1:8b', desc: 'raisonnement', size: '5.2 GB' },
  { name: 'nomic-embed-text', desc: 'embeddings', size: '274 MB' },
];
export const NOM_MODELE = /^[a-zA-Z0-9._:-]{1,120}$/;

export class Ollama {
  constructor({ url, synapse }) { this.url = url; this.synapse = synapse; }

  async modeles() {
    const r = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    const j = await r.json();
    return (j.models || []).map(m => String(m.name)).filter(n => NOM_MODELE.test(n));
  }

  // Réponse d'un bloc : l'action « Lancer un duel » du Hub.
  async demander({ modele, systeme, question, reglages }) {
    const t0 = performance.now();
    try {
      const r = await fetch(`${this.url}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({ model: modele, stream: false, messages: [{ role: 'system', content: systeme }, { role: 'user', content: question }], options: options(reglages), ...(reglages.thinking ? {} : { think: false }) }),
      });
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
      const j = await r.json();
      return { model: modele, text: j.message?.content || '', tokens: j.eval_count ?? null, ms: ms(t0) };
    } catch (e) {
      this.synapse?.panne(e.message);
      return { model: modele, error: `Ollama injoignable (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message})`, ms: ms(t0) };
    }
  }

  // Producteur : pousse les morceaux dans la file du duel, côté local.
  async diffuser({ modele, systeme, question, historique = [], reglages, file, signal }) {
    const t0 = performance.now();
    const texte = [];
    const corps = { model: modele, stream: true, keep_alive: reglages.keep_alive ?? -1, messages: [{ role: 'system', content: systeme }, ...historique, { role: 'user', content: question }], options: options(reglages) };
    if (!reglages.thinking) corps.think = false;
    const appel = c => fetch(`${this.url}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c), signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]) });
    try {
      let r = await appel(corps);
      if (!r.ok) {
        const brut = (await r.text()).slice(0, 120);
        // Certains modèles refusent l'option « think » : un second essai sans elle.
        if (/think/i.test(brut) && 'think' in corps) { delete corps.think; r = await appel(corps); }
        if (!r.ok) { file.pousser(['meta', { side: 'qwen', model: modele, error: `Ollama ${r.status} : ${brut}`, ms: 0 }]); return; }
      }
      for await (const l of lignes(r.body)) {
        if (!l.trim()) continue;
        const j = JSON.parse(l);
        const morceau = j.message?.content || '';
        if (morceau) { texte.push(morceau); file.pousser(['delta', { side: 'qwen', text: morceau }]); }
        if (j.done) break;
      }
      file.pousser(['meta', { side: 'qwen', model: modele, text: texte.join(''), ms: ms(t0) }]);
    } catch (e) {
      if (!signal.aborted) this.synapse?.panne(e.message);
      file.pousser(['meta', { side: 'qwen', model: modele, error: `Ollama injoignable (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message})`, ms: ms(t0) }]);
    }
  }

  // Téléchargement d'un modèle : progression relayée telle quelle, et l'échec
  // annoncé comme un échec.
  async *telecharger(modele, signal) {
    const r = await fetch(`${this.url}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modele, stream: true }), signal });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    for await (const l of lignes(r.body)) {
      if (!l.trim()) continue;
      let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.error) throw new Error(String(j.error).slice(0, 200));
      yield { status: String(j.status || ''), pct: j.total ? Math.round(1000 * (j.completed || 0) / j.total) / 10 : null };
    }
  }
}

function options(r) {
  return { num_ctx: r.num_ctx ?? 8192, num_predict: r.num_predict ?? 2048 };
}
