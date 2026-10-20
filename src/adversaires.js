// L'adversaire du duel : Claude par Claude Code (l'abonnement, sans clé) ou par
// l'API Anthropic, et tous ceux qui parlent le dialecte OpenAI.
//
// Aucun nom de modèle n'est inventé : la liste proposée est celle que le
// fournisseur renvoie lui-même (/models), relue toutes les dix minutes. La clé
// ne sort jamais du serveur, et le sous-processus Claude Code ne reçoit ni
// outil, ni environnement du service, ni dossier de données.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lignes, ms } from './flux.js';
import { cloisonner } from './reglages.js';

export const FOURNISSEURS = {
  'claude-code': { nom: 'Claude', genre: 'cli' },
  'claude-api': { nom: 'Claude', genre: 'anthropic', url: 'https://api.anthropic.com/v1' },
  openai: { nom: 'ChatGPT', genre: 'openai', url: 'https://api.openai.com/v1' },
  kimi: { nom: 'Kimi', genre: 'openai', url: 'https://api.moonshot.ai/v1', defaut: 'kimi-k2-0905-preview' },
  mistral: { nom: 'Mistral', genre: 'openai', url: 'https://api.mistral.ai/v1' },
  deepseek: { nom: 'DeepSeek', genre: 'openai', url: 'https://api.deepseek.com/v1' },
  gemini: { nom: 'Gemini', genre: 'openai', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  groq: { nom: 'Groq', genre: 'openai', url: 'https://api.groq.com/openai/v1' },
  openrouter: { nom: 'OpenRouter', genre: 'openai', url: 'https://openrouter.ai/api/v1' },
  compatible: { nom: 'API compatible', genre: 'openai', url: '' },
};
export const CLAUDE_MODELES = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
export const CLAUDE_DEFAUT = 'claude-opus-4-8';
const NOM_MODELE = /^[A-Za-z0-9._:/@-]{1,120}$/;
const PAS_CHAT = /embed|whisper|tts|dall-e|image|moderation|audio|transcri|rerank|guard|ocr/i;
const LIMITE_CLI_MS = 240_000;

export const estClaude = f => f.genre === 'cli' || f.genre === 'anthropic';

export function decrire(cfg) {
  let id = (cfg.adversaire || '').trim().toLowerCase();
  if (!id) id = cfg.claudeMode === 'api' ? 'claude-api' : 'claude-code';
  const f = { ...(FOURNISSEURS[id] || { nom: id, genre: 'inconnu' }), id };
  if (id === 'compatible') {
    f.url = (cfg.adversaireUrl || '').replace(/\/+$/, '');
    f.nom = (cfg.adversaireNom || '').trim() || f.nom;
  }
  f.cle = cfg.adversaireCle || (id === 'claude-api' ? cfg.anthropicCle || '' : '');
  f.modeleEnv = (cfg.adversaireModele || '').trim() || (estClaude(f) ? (cfg.claudeModele || '').trim() : '');
  return f;
}

// Jamais fable ni mythos, quel que soit le fournisseur ; liste blanche pour Claude.
export function garde(f, modele) {
  const m = String(modele || '').trim(), bas = m.toLowerCase();
  if (bas.includes('fable') || bas.includes('mythos')) throw new Error(`Modèle interdit par le garde-fou : ${m}`);
  if (estClaude(f)) {
    const ok = ['claude-opus', 'claude-sonnet', 'claude-haiku'].some(p => bas.startsWith(p)) || ['opus', 'sonnet', 'haiku'].includes(bas);
    if (!ok || !NOM_MODELE.test(m)) throw new Error(`Modèle Claude hors liste blanche : ${m}`);
  } else if (!NOM_MODELE.test(m)) throw new Error(`Nom de modèle invalide : ${m}`);
  return m;
}

export class Adversaires {
  constructor({ cfg, persona }) {
    this.cfg = cfg; this.persona = persona;
    this.f = decrire(cfg);
    this.cache = new Map();
  }

  // Ce qui manque pour jouer, ou null.
  pret() {
    const f = this.f;
    if (f.genre === 'inconnu') return `Adversaire inconnu : ${f.id}`;
    if (f.genre === 'cli') {
      if (!this.binaire()) return 'Claude Code n’est pas installé dans ce conteneur.';
      if (!this.cfg.claudeJeton && !fs.existsSync(path.join(os.homedir(), '.claude', '.credentials.json'))) {
        return 'Jeton Claude Code manquant : lance « claude setup-token » sur une machine connectée à ton abonnement, puis colle-le dans le Hub';
      }
      return null;
    }
    if (f.id === 'compatible' && !f.url) return 'Adresse de l’API compatible manquante (ADVERSAIRE_URL)';
    if (f.id !== 'compatible' && !f.cle) return `Clé d’API de ${f.nom} manquante`;
    return null;
  }

  binaire() {
    const b = this.cfg.claudeBin || 'claude';
    const candidats = path.isAbsolute(b) ? [b] : [...(process.env.PATH || '').split(':').map(d => path.join(d, b)), '/usr/local/bin/claude', '/usr/bin/claude'];
    return candidats.find(p => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; } }) || null;
  }

  async modeles() {
    const f = this.f;
    if (estClaude(f)) return [...CLAUDE_MODELES];
    if (this.pret()) return [];
    const k = `${f.id}|${f.url}`;
    const c = this.cache.get(k);
    if (c && Date.now() - c.t < 600_000) return c.liste;
    let liste = [];
    try {
      const r = await fetch(`${f.url}/models`, { headers: f.cle ? { authorization: `Bearer ${f.cle}` } : {}, signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const d = await r.json();
        const ids = [];
        for (const m of (Array.isArray(d) ? d : d?.data) || []) {
          let i = String(typeof m === 'object' && m ? m.id ?? '' : m);
          if (i.startsWith('models/')) i = i.slice(7);
          if (i && NOM_MODELE.test(i) && !PAS_CHAT.test(i) && !/fable|mythos/i.test(i)) ids.push(i);
        }
        liste = [...new Set(ids)].sort();
      }
    } catch { liste = []; }
    this.cache.set(k, { t: Date.now(), liste });
    return liste;
  }

  // Premier candidat valide ; sinon le modèle de l'environnement ; sinon le
  // défaut du fournisseur s'il le propose vraiment.
  async choisir(...candidats) {
    const f = this.f;
    for (const m0 of [...candidats, f.modeleEnv]) {
      if (!m0) continue;
      let m;
      try { m = garde(f, m0); } catch { continue; }
      if (!estClaude(f) && m.toLowerCase().startsWith('claude-') && f.id !== 'openrouter') continue;
      return m;
    }
    if (estClaude(f)) return CLAUDE_DEFAUT;
    if (f.defaut && (await this.modeles()).includes(f.defaut)) return f.defaut;
    return null;
  }

  public(modele = null, liste = []) {
    const f = this.f;
    return { id: f.id, nom: f.nom, genre: f.genre, claude: estClaude(f), modele, modeles: liste, manque: this.pret() };
  }

  async diffuser({ modele, systeme, question, contexte, jetons, file, signal }) {
    const f = this.f;
    if (f.genre === 'cli') return this.claudeCode({ modele, question, contexte, file, signal });
    if (f.genre === 'anthropic') return this.anthropic({ modele, systeme, question, jetons, file, signal });
    return this.openai({ modele, systeme, question, jetons, file, signal });
  }

  fin(file, modele, t0, { texte, erreur }) {
    file.pousser(['meta', { side: 'claude', model: modele, ms: ms(t0), ...(erreur ? { error: String(erreur).slice(0, 240) } : { text: texte || '' }) }]);
  }

  async openai({ modele, systeme, question, jetons, file, signal }) {
    const f = this.f, t0 = performance.now(), texte = [];
    try {
      const r = await fetch(`${f.url}/chat/completions`, {
        method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(240_000)]),
        headers: { 'Content-Type': 'application/json', ...(f.cle ? { authorization: `Bearer ${f.cle}` } : {}) },
        body: JSON.stringify({ model: modele, stream: true, max_tokens: jetons, messages: [{ role: 'system', content: systeme }, { role: 'user', content: question }] }),
      });
      if (!r.ok) return this.fin(file, modele, t0, { erreur: `${f.nom} ${r.status} : ${(await r.text()).slice(0, 180)}` });
      for await (const l of lignes(r.body)) {
        if (!l.startsWith('data:')) continue;
        const d = l.slice(5).trim();
        if (d === '[DONE]') break;
        let j; try { j = JSON.parse(d); } catch { continue; }
        if (j.error) return this.fin(file, modele, t0, { erreur: `${f.nom} : ${typeof j.error === 'string' ? j.error : j.error.message || 'erreur'}` });
        for (const ch of j.choices || []) {
          const m = ch?.delta?.content || '';
          if (m) { texte.push(m); file.pousser(['delta', { side: 'claude', text: m }]); }
        }
      }
      this.fin(file, modele, t0, { texte: texte.join('') });
    } catch (e) {
      this.fin(file, modele, t0, { erreur: `${f.nom} injoignable (${e.name})` });
    }
  }

  async anthropic({ modele, systeme, question, jetons, file, signal }) {
    const f = this.f, t0 = performance.now(), texte = [];
    try {
      const r = await fetch(`${f.url}/messages`, {
        method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(240_000)]),
        headers: { 'Content-Type': 'application/json', 'x-api-key': f.cle, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modele, stream: true, max_tokens: jetons, system: systeme, messages: [{ role: 'user', content: question }] }),
      });
      if (!r.ok) return this.fin(file, modele, t0, { erreur: `API Anthropic ${r.status} : ${(await r.text()).slice(0, 180)}` });
      for await (const l of lignes(r.body)) {
        if (!l.startsWith('data:')) continue;
        let j; try { j = JSON.parse(l.slice(5).trim()); } catch { continue; }
        if (j.type === 'error') return this.fin(file, modele, t0, { erreur: `API Anthropic : ${j.error?.message || 'erreur'}` });
        if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
          texte.push(j.delta.text); file.pousser(['delta', { side: 'claude', text: j.delta.text }]);
        }
      }
      this.fin(file, modele, t0, { texte: texte.join('') });
    } catch (e) {
      this.fin(file, modele, t0, { erreur: `API Anthropic injoignable (${e.name})` });
    }
  }

  // Claude Code en mode impression. La question passe par l'entrée standard,
  // jamais en argument (une question qui commence par « - » serait lue comme
  // une option). Aucun outil (--tools ""), aucune configuration MCP ni réglage
  // local, un dossier de travail vide, un environnement réduit au strict
  // nécessaire : une réponse hostile dans le contexte ne trouve rien à lire ni
  // à exécuter.
  async claudeCode({ modele, question, contexte, file, signal }) {
    const t0 = performance.now(), texte = [];
    const bin = this.binaire();
    if (!bin) return this.fin(file, modele, t0, { erreur: 'Claude Code n’est pas installé dans ce conteneur.' });
    const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'dialekt-claude-'));
    const env = {
      PATH: '/usr/local/bin:/usr/bin:/bin', HOME: travail, LANG: 'C.UTF-8', TZ: process.env.TZ || 'UTC',
      DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      ...(this.cfg.claudeJeton ? { CLAUDE_CODE_OAUTH_TOKEN: this.cfg.claudeJeton } : {}),
    };
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', modele,
      '--append-system-prompt', this.persona(), '--tools', '', '--strict-mcp-config', '--no-session-persistence',
      '--permission-prompts', 'none', '--safe-mode'];
    const p = spawn(bin, args, { cwd: travail, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let erreurs = '', fini = false;
    const tuer = () => { if (!fini) { try { p.kill('SIGKILL'); } catch { /* déjà fini */ } } };
    const minuterie = setTimeout(tuer, LIMITE_CLI_MS);
    signal.addEventListener('abort', tuer, { once: true });
    p.stderr.on('data', d => { if (erreurs.length < 4000) erreurs += d.toString('utf8'); });
    p.stdin.on('error', () => {});
    p.stdin.end(contexte ? `${cloisonner(contexte)}\n\n${question}` : question);
    const sortie = new Promise(r => p.on('close', code => { fini = true; r(code); }));
    try {
      for await (const l of lignes(p.stdout)) {
        if (!l.trim()) continue;
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.type === 'text_delta') {
          const m = j.event.delta.text || '';
          if (m) { texte.push(m); file.pousser(['delta', { side: 'claude', text: m }]); }
        } else if (j.type === 'result') {
          if (j.is_error || j.api_error_status) { tuer(); return this.fin(file, modele, t0, { erreur: String(j.result || `erreur API ${j.api_error_status}`).slice(0, 200) }); }
          if (!texte.length && j.result) { texte.push(String(j.result)); file.pousser(['delta', { side: 'claude', text: String(j.result) }]); }
        }
      }
      const code = await sortie;
      if (signal.aborted) return this.fin(file, modele, t0, { erreur: 'interrompu' });
      if (code !== 0 && !texte.length) return this.fin(file, modele, t0, { erreur: `claude a quitté (code ${code}) : ${erreurs.trim().slice(0, 180) || 'aucun détail'}` });
      this.fin(file, modele, t0, { texte: texte.join('') });
    } catch (e) {
      tuer();
      this.fin(file, modele, t0, { erreur: e.message });
    } finally {
      clearTimeout(minuterie);
      fs.rm(travail, { recursive: true, force: true }, () => {});
    }
  }
}
