// Routes d'Oracle. Chaque route dit qui peut l'appeler : session (avec son
// rôle) ou jeton du Hub, et rien d'autre. Toute donnée d'un compte est lue et
// écrite avec le compte de la session, jamais avec un identifiant du client.
import crypto from 'node:crypto';
import { ErreurHttp, Routeur, Debit, lireCorps, valider, repondreJson } from '../socle/src/index.js';
import { CATALOGUE, NOM_MODELE } from './ollama.js';
import { REF } from './base.js';
import { garde } from './adversaires.js';
import { VERSION } from './config.js';

const S = {
  duel: {
    q: { type: 'chaine', requis: true, max: 20_000 },
    noclaude: { type: 'booleen', defaut: false },
    ollama_model: { type: 'chaine', max: 120, motif: NOM_MODELE },
    claude_model: { type: 'chaine', max: 120 },
    conv_id: { type: 'chaine', motif: REF },
    web: { type: 'booleen', defaut: false },
    attachments: { type: 'liste', max: 5, de: { type: 'objet', champs: {
      name: { type: 'chaine', requis: true, max: 200 }, type: { type: 'chaine', parmi: ['text', 'image'], defaut: 'text' },
      data: { type: 'chaine', max: 60_000, defaut: '' }, size: { type: 'entier', min: 0 } } } },
  },
};

export function creerApi({ socle, cfg, conversations, duels, ollama, adversaires, reglages, synapse }) {
  const r = new Routeur();
  const portail = socle.portail;
  const debitDuels = new Debit({ max: cfg.duelsMinute });

  // Le jeton du Hub n'ouvre que trois portes : lancer un duel, lire les
  // chiffres, lire l'état. Jamais les comptes, les réglages ni les données.
  const estHub = ctx => {
    if (!cfg.jetonHub) return false;
    const h = String(ctx.req.headers.authorization || '');
    if (!h.startsWith('Bearer ')) return false;
    const a = crypto.createHash('sha256').update(h.slice(7)).digest(), b = crypto.createHash('sha256').update(cfg.jetonHub).digest();
    return crypto.timingSafeEqual(a, b);
  };
  const session = (ctx, role = 'lecture') => portail.exiger(ctx, { role });
  // Une référence inconnue et celle d'un autre compte répondent pareil.
  const conv = (compte, ref) => conversations.idDe(compte, ref) ?? (() => { throw new ErreurHttp(404, 'Conversation introuvable.'); })();
  const projet = (compte, ref) => conversations.idProjet(compte, ref) ?? (() => { throw new ErreurHttp(404, 'Projet introuvable.'); })();

  // Le premier refus pour plafond de la journée prévient les administrateurs :
  // une dépense qui bute sur son plafond mérite un regard humain.
  const plafondsSignales = new Set();
  const duelsParJour = `${cfg.duelsJour} duel${cfg.duelsJour > 1 ? 's' : ''}`;
  function payerDuel(qui) {
    if (!debitDuels.prendre(qui)) throw new ErreurHttp(429, 'Trop de duels d’un coup : attends une minute.');
    if (conversations.prendreQuota(qui, cfg.duelsJour)) return;
    const jour = new Date().toISOString().slice(0, 10);
    if (!plafondsSignales.has(`${qui}:${jour}`)) {
      plafondsSignales.add(`${qui}:${jour}`);
      const nom = qui === 'hub' ? 'le Hub' : `le compte ${socle.comptes.compte(qui)?.identifiant || qui}`;
      socle.journal.ecrire({ acteur: qui === 'hub' ? null : qui, action: 'duel.plafond', resultat: 'refus', details: { plafond: cfg.duelsJour } });
      socle.comptes.alerterAdmins('service.depense', { texte: `plafond de ${duelsParJour} atteint aujourd’hui par ${nom}` });
    }
    throw new ErreurHttp(429, `Plafond journalier atteint (${duelsParJour}).`);
  }

  // Sonde publique : vivant ou non, rien de plus (ni version, ni adresse).
  r.get('/healthz', () => ({ ok: true }), { public: true });

  r.get('/api/health', async ctx => {
    const hub = estHub(ctx);
    const s = hub ? null : session(ctx);
    let modeles = [], ok = true;
    try { modeles = await ollama.modeles(); } catch { ok = false; }
    // L'adresse interne d'Ollama ne va qu'aux administrateurs.
    const admin = s?.compteLigne.role === 'admin';
    return {
      version: VERSION, ollama: ok, models: modeles, ollama_model: reglages.lire().ollama_model, adversaire: adversaires.public(),
      claude_cli: adversaires.f.genre === 'cli' ? !!adversaires.binaire() : null, memory: !!cfg.memoireUrl, ...(admin ? { ollama_url: cfg.ollamaUrl } : {}),
    };
  }, { hub: true });

  r.get('/api/stats', ctx => (estHub(ctx) ? conversations.stats() : conversations.stats(session(ctx).compte)), { hub: true });

  // Action « Lancer un duel » du Hub (et des scripts d'un membre).
  r.post('/api/duel', async ctx => {
    const hub = estHub(ctx);
    const s = hub ? null : session(ctx, 'membre');
    const b = valider(await lireCorps(ctx.req, { limite: 64 * 1024 }), S.duel);
    if (!b.q.trim()) throw new ErreurHttp(400, 'Question vide');
    payerDuel(hub ? 'hub' : s.compte);
    return duels.unBloc({ q: b.q, seul: b.noclaude, modeleAdverse: b.claude_model });
  }, { hub: true });

  r.post('/api/duel/stream', async ctx => {
    const s = session(ctx, 'membre');
    const b = valider(await lireCorps(ctx.req, { limite: 512 * 1024 }), S.duel);
    if (!b.q.trim()) throw new ErreurHttp(400, 'Question vide');
    const convId = b.conv_id ? conv(s.compte, b.conv_id) : null;
    if (b.ollama_model && !(await ollama.modeles().catch(() => [])).includes(b.ollama_model)) throw new ErreurHttp(400, 'Modèle local inconnu.');
    if (b.claude_model) { try { garde(adversaires.f, b.claude_model); } catch (e) { throw new ErreurHttp(400, e.message); } }
    payerDuel(s.compte);
    const arret = new AbortController();
    ctx.res.on('close', () => { if (!ctx.res.writableFinished) arret.abort(); });
    ctx.res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    try {
      for await (const e of duels.derouler({ compte: s.compte, q: b.q, seul: b.noclaude, modeleLocal: b.ollama_model, modeleAdverse: b.claude_model, convId, web: b.web, pieces: b.attachments || [], signal: arret.signal })) {
        if (arret.signal.aborted) break;
        ctx.res.write(`data: ${JSON.stringify(e)}\n\n`);
      }
    } catch (e) {
      socle.journal.ecrire({ acteur: s.compte, action: 'duel.erreur', ip: ctx.ip, resultat: 'erreur', details: { message: String(e.message).slice(0, 120) } });
      ctx.res.write(`data: ${JSON.stringify({ t: 'status', text: 'Le duel s’est interrompu.' })}\n\n`);
    }
    ctx.res.end();
  });

  r.get('/api/models', async ctx => {
    const s = session(ctx);
    const admin = s.compteLigne.role === 'admin';
    let installes = [], erreur = null;
    try { installes = await ollama.modeles(); } catch (e) { erreur = admin ? `Ollama injoignable sur ${cfg.ollamaUrl} (${e.name})` : 'Ollama injoignable'; }
    const liste = await adversaires.modeles();
    const modele = adversaires.pret() ? null : await duels.modeleAdverse();
    const reg = reglages.lire();
    const { modeles_adversaire, ...config } = reg;
    return {
      installed: installes, catalog: CATALOGUE, ollama_error: erreur, ...(admin ? { ollama_url: cfg.ollamaUrl } : {}),
      claude: !modele || liste.includes(modele) ? liste : [modele, ...liste],
      adversaire: adversaires.public(modele, liste), config: { ...config, claude_model: modele || '' },
    };
  });

  r.post('/api/config', async ctx => {
    const s = session(ctx, 'admin');
    const b = valider(await lireCorps(ctx.req), {
      ollama_model: { type: 'chaine', max: 120, motif: NOM_MODELE }, claude_model: { type: 'chaine', max: 120 },
      mode: { type: 'chaine', parmi: ['duel', 'qwen'] }, thinking: { type: 'booleen' },
      num_ctx: { type: 'entier', min: 512, max: 131072 }, num_predict: { type: 'entier', min: 64, max: cfg.jetonsMax },
    });
    const avant = reglages.lire();
    const f = adversaires.f;
    let choix = null;
    if (b.claude_model) {
      try { choix = garde(f, b.claude_model); } catch (e) { throw new ErreurHttp(400, e.message); }
      b.modeles_adversaire = { ...(avant.modeles_adversaire || {}), [f.id]: { modele: choix, env: f.modeleEnv || '' } };
      if (f.genre === 'cli' || f.genre === 'anthropic') b.claude_model = choix; else delete b.claude_model;
    }
    const apres = reglages.ecrire(b);
    const changes = Object.fromEntries(['ollama_model', 'claude_model', 'mode'].filter(k => apres[k] !== avant[k]).map(k => [k, apres[k]]));
    if (choix && JSON.stringify(avant.modeles_adversaire || {}) !== JSON.stringify(apres.modeles_adversaire || {})) changes.adversaire = `${f.nom} ${choix}`;
    if (Object.keys(changes).length) {
      synapse.reglage('Oracle : réglage changé — ' + Object.entries(changes).map(([k, v]) => `${k} → ${v}`).join(', '), changes);
      socle.journal.ecrire({ acteur: s.compte, action: 'reglages.modifies', ip: ctx.ip, details: changes });
    }
    const { modeles_adversaire, ...pub } = apres;
    return pub;
  });

  r.post('/api/pull', async ctx => {
    const s = session(ctx, 'admin');
    const b = valider(await lireCorps(ctx.req), { model: { type: 'chaine', requis: true, max: 120 } });
    if (!NOM_MODELE.test(b.model)) throw new ErreurHttp(400, 'Nom de modèle invalide');
    socle.journal.ecrire({ acteur: s.compte, action: 'modele.telechargement', ip: ctx.ip, details: { modele: b.model } });
    const arret = new AbortController();
    ctx.res.on('close', () => { if (!ctx.res.writableFinished) arret.abort(); });
    ctx.res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    try {
      for await (const e of ollama.telecharger(b.model, arret.signal)) ctx.res.write(`data: ${JSON.stringify(e)}\n\n`);
      synapse.modele(b.model);
      ctx.res.write(`data: ${JSON.stringify({ status: 'success', pct: 100, done: true })}\n\n`);
    } catch (e) {
      ctx.res.write(`data: ${JSON.stringify({ status: `erreur : ${String(e.message).slice(0, 160)}`, done: true, error: true })}\n\n`);
    }
    ctx.res.end();
  });

  // Conversations et projets : toujours ceux du compte de la session.
  r.get('/api/conversations', ctx => ({ conversations: conversations.lister(session(ctx).compte, Number(ctx.url.searchParams.get('limit')) || 200) }));
  r.get('/api/search', ctx => {
    const s = session(ctx);
    const q = String(ctx.url.searchParams.get('q') || '').slice(0, 200);
    return { conversations: q.trim() ? conversations.chercher(s.compte, q) : conversations.lister(s.compte, 40) };
  });
  r.get('/api/conversation/:id', ctx => {
    const s = session(ctx);
    return conversations.lire(s.compte, conv(s.compte, ctx.params.id));
  });
  r.patch('/api/conversation/:id', async ctx => {
    const s = session(ctx, 'membre');
    const b = valider(await lireCorps(ctx.req), { title: { type: 'chaine', max: 200 }, project_id: { type: 'chaine', motif: REF }, pinned: { type: 'booleen' }, clear_project: { type: 'booleen', defaut: false } });
    if (!conversations.modifier(s.compte, conv(s.compte, ctx.params.id), b)) throw new ErreurHttp(404, 'Projet introuvable.');
    return { ok: true };
  });
  r.del('/api/conversation/:id', ctx => {
    const s = session(ctx, 'membre');
    conversations.supprimer(s.compte, conv(s.compte, ctx.params.id));
    return { ok: true };
  });
  r.get('/api/projects', ctx => ({ projects: conversations.projets(session(ctx).compte) }));
  r.post('/api/projects', async ctx => {
    const s = session(ctx, 'membre');
    const b = valider(await lireCorps(ctx.req), { name: { type: 'chaine', requis: true, max: 60 }, color: { type: 'chaine', motif: /^#[0-9a-fA-F]{6}$/, defaut: '#7fa4d0' } });
    return { id: conversations.creerProjet(s.compte, b.name, b.color) };
  });
  r.patch('/api/projects/:id', async ctx => {
    const s = session(ctx, 'membre');
    const b = valider(await lireCorps(ctx.req), { name: { type: 'chaine', requis: true, max: 60 }, color: { type: 'chaine', motif: /^#[0-9a-fA-F]{6}$/ } });
    conversations.renommerProjet(s.compte, projet(s.compte, ctx.params.id), b.name);
    return { ok: true };
  });
  r.del('/api/projects/:id', ctx => {
    const s = session(ctx, 'membre');
    conversations.supprimerProjet(s.compte, projet(s.compte, ctx.params.id));
    return { ok: true };
  });

  // Aiguillage : renvoie vrai si la requête était pour l'API.
  return async function traiter(ctx) {
    const p = ctx.url.pathname;
    if (!p.startsWith('/api/') && p !== '/healthz') return false;
    const t = r.trouver(ctx.req.method, p);
    if (!t) throw new ErreurHttp(404, 'Route inconnue.');
    if (t.methodes) { ctx.res.setHeader('Allow', t.methodes.join(', ')); throw new ErreurHttp(405, 'Méthode non admise.'); }
    ctx.params = t.params;
    const reponse = await t.route.gestionnaire(ctx);
    if (reponse !== undefined) repondreJson(ctx.res, 200, reponse);
    return true;
  };
}
