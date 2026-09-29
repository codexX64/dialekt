// Interface d'Oracle : duels en flux, conversations, chiffres, réglages.
// La porte du socle gère la connexion ; tout ce qui suit suppose une session
// complète, et le serveur revérifie chaque droit.
import { Api, porte, pageSecurite, pageComptes, h, icone, basculeTheme, appliquerTheme, toast, confirmer, dialogue, feuille, ajouterPictos } from '/socle/compte.js';
import { rendre } from '/rendu.js';

appliquerTheme();
const SERVICE = 'Oracle';
const api = new Api({ surDeconnexion: () => location.reload() });
const etat = await porte({ api, service: SERVICE, sousTitre: 'duel d’IA' });
const moi = etat.session.compte;
const admin = moi.role === 'admin';
const peutJouer = moi.role !== 'lecture';

const PICTOS = {
  duel: '<path d="M13.5 3 6 13.5h5.5L10.5 21 18 10.5h-5.5z"/>',
  liste: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
  chiffres: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  reglages: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="7.5" cy="17" r="2.2"/>',
  envoyer: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  web: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6c2.4 2.6 3.6 5.4 3.6 8.4s-1.2 5.8-3.6 8.4c-2.4-2.6-3.6-5.4-3.6-8.4s1.2-5.8 3.6-8.4z"/>',
  trombone: '<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7-7l7.8-7.8a3.3 3.3 0 0 1 4.7 4.7L10 16.9a1.7 1.7 0 0 1-2.4-2.4l7.1-7.1"/>',
  epingle: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
  puce: '<rect x="6" y="6" width="12" height="12" rx="2.4"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  nuage: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95 6 6 0 0 0-11.5-1.3A4.6 4.6 0 0 0 7 18.5z"/>',
  couronne: '<path d="m4 8 4 4 4-7 4 7 4-4-2 11H6z"/>',
  dossier: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  actions: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
};
// Pictogrammes propres à Oracle : des constantes de ce fichier, jamais une donnée.
ajouterPictos(PICTOS);
const ic = icone;

const E = { modeles: null, conversations: [], projets: [], projet: null, courante: null, filtre: '', mode: 'duel', modeleLocal: '', web: false, pieces: [], arret: null };

async function chargerModeles() {
  try { E.modeles = await api.get('/api/models'); } catch (x) { E.modeles = null; toast(x.message, true); }
  if (E.modeles) { E.mode = E.modeles.config.mode === 'qwen' ? 'qwen' : 'duel'; E.modeleLocal ||= E.modeles.config.ollama_model; }
}
async function chargerConversations() {
  try {
    const [c, p] = await Promise.all([api.get('/api/conversations'), api.get('/api/projects')]);
    E.conversations = c.conversations; E.projets = p.projects;
  } catch (x) { toast(x.message, true); }
}

const nomLocal = m => m || E.modeles?.config.ollama_model || 'local';
const nomAdverse = () => E.modeles?.adversaire?.nom || 'Adversaire';
const quand = s => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s * 1000));
const copier = async t => { try { await navigator.clipboard.writeText(t); toast('Copié.'); } catch { toast('Copie impossible ici.', true); } };

const stage = h('div', { class: 'stage' });
const navs = {};
const PAGES = {
  duel: { titre: 'Duel', ic: 'duel', rendre: pageDuel },
  conversations: { titre: 'Conversations', ic: 'liste', rendre: pageConversations },
  stats: { titre: 'Statistiques', ic: 'chiffres', rendre: pageStats },
  ...(admin ? { reglages: { titre: 'Réglages', ic: 'reglages', rendre: pageReglages } } : {}),
  securite: { titre: 'Sécurité', ic: 'cadenas', rendre: () => pageSecurite(api, { service: SERVICE, confidentialite: '/confidentialite.txt' }) },
  ...(admin ? { comptes: { titre: 'Comptes', ic: 'utilisateurs', rendre: () => pageComptes(api, { service: SERVICE }) } } : {}),
};
const etatAdversaire = h('div', { class: 'row' });
const app = h('div', { class: 'app' },
  h('nav', { class: 'rail', 'aria-label': 'Navigation' },
    h('div', { class: 'mark' }, h('div', { class: 'g' }, ic('duel', 15)), h('b', { text: SERVICE }), h('i', { class: 'pulse' })),
    h('div', { class: 'grp' }, h('span', { text: 'Duel' }), ['duel', 'conversations', 'stats'].map(lien)),
    h('div', { class: 'grp' }, h('span', { text: 'Compte' }), ['reglages', 'securite', 'comptes'].filter(k => PAGES[k]).map(lien)),
    h('div', { class: 'railcard' }, etatAdversaire,
      h('div', { class: 'row' }, icone('utilisateurs', 14), h('span', { class: 'tronque', text: moi.identifiant })),
      h('button', { class: 'btn sm flat plein', type: 'button', onclick: async () => { await api.post('/api/compte/deconnexion'); location.reload(); } }, icone('sortie', 14), 'Se déconnecter'))),
  h('div', { class: 'voile-rail', onclick: () => app.classList.remove('menu-ouvert') }),
  h('main', { class: 'main' },
    h('header', { class: 'top' }, h('button', { class: 'ghost menu', type: 'button', 'aria-label': 'Menu', onclick: () => app.classList.toggle('menu-ouvert') }, icone('menu')),
      h('div', { class: 'topright' }, basculeTheme(), h('div', { class: 'who', title: moi.identifiant, text: moi.identifiant.slice(0, 2).toUpperCase() }))),
    stage));
document.body.append(app);

function lien(k) {
  const p = PAGES[k];
  return (navs[k] = h('button', { class: 'nav', type: 'button', onclick: () => aller(k) }, ic(p.ic), h('span', { text: p.titre })));
}

function peindreAdversaire() {
  const a = E.modeles?.adversaire;
  etatAdversaire.replaceChildren(h('span', { class: 'tag' + (a?.manque ? ' held' : ''), title: a?.manque || '' }, h('i', { class: 'd' }), a ? `${a.nom}${a.modele ? ' · ' + a.modele : ''}` : 'adversaire'));
}

async function aller(k, { conv } = {}) {
  if (!PAGES[k]) k = 'duel';
  if (E.arret && k !== 'duel') { E.arret.abort(); E.arret = null; }
  for (const [n, b] of Object.entries(navs)) b.classList.toggle('on', n === k);
  if (conv !== undefined) E.courante = conv;
  app.classList.remove('menu-ouvert');
  history.replaceState(null, '', '#' + k + (k === 'duel' && E.courante ? '/' + E.courante : ''));
  stage.replaceChildren(await PAGES[k].rendre());
}

function listeConversations({ compacte }) {
  const recherche = h('input', { class: 'field', type: 'search', placeholder: 'Chercher dans les conversations', value: E.filtre, 'aria-label': 'Chercher' });
  const corps = h('div', { class: 'convs' });
  const peindre = tous => {
    const items = !compacte && E.projet ? tous.filter(c => c.project_id === E.projet) : tous;
    if (!items.length) return corps.replaceChildren(h('p', { class: 'vide', text: E.filtre || E.projet ? 'Rien ne correspond.' : 'Aucune conversation pour l’instant.' }));
    corps.replaceChildren(...items.map(c => h('button', { class: 'conv' + (c.id === E.courante ? ' on' : ''), type: 'button', onclick: () => aller('duel', { conv: c.id }) },
      h('span', { class: 'conv-t tronque', text: c.title || 'Sans titre' }),
      h('span', { class: 'conv-m' }, c.pinned ? ic('epingle', 12) : null, c.project_name ? h('span', { class: 'chip', text: c.project_name }) : null,
        h('span', { class: 'dim', text: [c.n ? `${c.n} échange${c.n > 1 ? 's' : ''}` : null, c.last_winner ? (c.last_winner === 'qwen' ? 'local' : nomAdverse()) : null].filter(Boolean).join(' · ') })))));
  };
  let minuterie;
  recherche.addEventListener('input', () => {
    E.filtre = recherche.value;
    clearTimeout(minuterie);
    minuterie = setTimeout(async () => {
      if (!E.filtre.trim()) return peindre(E.conversations);
      try { peindre((await api.get('/api/search?q=' + encodeURIComponent(E.filtre))).conversations); } catch (x) { toast(x.message, true); }
    }, 220);
  });
  peindre(E.conversations);
  return h('aside', { class: 'card liste' + (compacte ? ' cache-l' : '') },
    h('header', {}, h('h2', { text: compacte ? 'Conversations' : 'Historique' }), peutJouer ? h('button', { class: 'btn sm', type: 'button', onclick: () => aller('duel', { conv: null }) }, icone('plus', 14), 'Nouveau') : null),
    h('div', { class: 'pad' }, recherche), corps);
}

async function pageConversations() {
  await chargerConversations();
  if (E.projet && !E.projets.some(p => p.id === E.projet)) E.projet = null;
  return h('div', { class: 'page' },
    h('div', { class: 'headrow' }, h('div', {}, h('h1', { class: 'title', text: 'Conversations' }), h('p', { class: 'lede', text: 'Tes duels, rangés par date. Personne d’autre ne les voit.' }))),
    h('div', { class: 'split' }, listeConversations({ compacte: false }), carteProjets()));
}

// Supprimer un projet garde ses conversations : elles reviennent hors projet.
function actionsProjet(p, nommer, sur) {
  const actions = [
    { texte: 'Renommer', agir: async () => { const n = await nommer('Renommer le projet', p.name); if (n) { await api.patch(`/api/projects/${p.id}`, { name: n }); aller('conversations'); } } },
    { texte: 'Supprimer', danger: true, agir: async () => {
      if (await confirmer(`Supprimer « ${p.name} » ?`, 'Ses conversations sont gardées et sortent du projet.', { danger: true, oui: 'Supprimer' })) { await api.del(`/api/projects/${p.id}`); aller('conversations'); }
    } },
  ];
  return h('div', { class: 'fin' },
    actions.map(a => h('button', { class: 'btn sm flat cache-s' + (a.danger ? ' danger' : ''), type: 'button', onclick: sur(a.agir) }, a.texte)),
    h('button', { class: 'btn sm flat seul-s', type: 'button', 'aria-label': `Actions du projet ${p.name}`, onclick: sur(() => feuille(p.name, actions)) }, ic('actions', 16)));
}

function carteProjets() {
  const sur = fn => async () => { try { await fn(); } catch (x) { toast(x.message, true); } };
  const nommer = async (titre, valeur = '') => {
    const champ = h('input', { class: 'field', value: valeur, maxlength: 60, 'aria-label': 'Nom du projet' });
    return dialogue({ titre, contenu: [champ], boutons: [{ texte: 'Annuler', classe: 'flat', valeur: null }, { texte: 'Enregistrer', classe: 'solid', agir: () => champ.value.trim() || false }] });
  };
  const creer = sur(async () => { const n = await nommer('Nouveau projet'); if (n) { await api.post('/api/projects', { name: n }); aller('conversations'); } });
  const ligne = p => h('div', { class: 'flowrow' + (E.projet === p.id ? ' on' : '') },
    h('div', { class: 'itile' }, ic('dossier')),
    h('button', { class: 'ligne-choix', type: 'button', 'aria-pressed': String(E.projet === p.id), onclick: () => { E.projet = E.projet === p.id ? null : p.id; aller('conversations'); } },
      h('strong', { class: 'tronque', text: p.name }), h('small', { text: `${p.n} conversation${p.n > 1 ? 's' : ''}${E.projet === p.id ? ' · filtre actif' : ''}` })),
    peutJouer ? actionsProjet(p, nommer, sur) : h('span'));
  return h('div', { class: 'card' },
    h('header', {}, h('h2', { text: 'Projets' }), peutJouer ? h('button', { class: 'btn sm', type: 'button', onclick: creer }, icone('plus', 14), 'Nouveau') : null),
    E.projets.length ? h('div', {}, E.projets.map(ligne)) : h('div', { class: 'pad' }, h('p', { class: 'vide', text: 'Aucun projet. Un projet regroupe des conversations ; « Ranger » en crée un depuis un duel.' })));
}

async function pageDuel() {
  if (!E.modeles) await chargerModeles();
  peindreAdversaire();
  await chargerConversations();
  const fil = h('div', { class: 'fil', 'aria-live': 'polite' });
  const titre = h('h1', { class: 'title tronque', text: 'Nouveau duel' });
  const actions = h('div', { class: 'actions' });
  const entete = h('div', { class: 'headrow' }, h('div', {}, titre, h('p', { class: 'lede', text: `${nomLocal(E.modeleLocal)} contre ${nomAdverse()}, départagés par un juge qui mesure — jamais par un troisième modèle.` })), actions);
  const colonne = h('section', { class: 'salle-fil' }, entete, fil, peutJouer ? compositeur(fil, { titre, actions }) : h('p', { class: 'note info', text: 'Compte en lecture seule : les duels sont réservés aux membres.' }));
  if (E.courante) {
    try {
      const d = await api.get(`/api/conversation/${E.courante}`);
      titre.textContent = d.conversation.title || 'Sans titre';
      actions.append(...menuConversation(d.conversation));
      for (const x of d.duels) fil.append(echangeEnregistre(x));
      if (d.conversation.mode === 'qwen') E.mode = 'qwen';
    } catch (x) { E.courante = null; toast(x.message, true); }
  } else fil.append(accueil());
  requestAnimationFrame(() => { fil.scrollTop = fil.scrollHeight; });
  return h('div', { class: 'page salle' }, listeConversations({ compacte: true }), colonne);
}

function accueil() {
  const idees = ['Explique la différence entre SSH et Telnet', 'Écris une fonction Python robuste qui lit un CSV', 'Comment sécuriser un serveur exposé sur Internet ?', 'Rends ce bouton accessible et responsive en CSS'];
  return h('div', { class: 'accueil' },
    h('div', { class: 'tile' }, ic('duel', 18)),
    h('h2', { text: 'Pose une question, deux modèles répondent.' }),
    h('p', { class: 'dim', text: 'Le juge compare la substance, la richesse, la structure, la concision et la latence. Les questions trop courtes et les réponses presque identiques ne sont pas départagées.' }),
    peutJouer ? h('div', { class: 'idees' }, idees.map(t => h('button', { class: 'chip', type: 'button', text: t, onclick: () => { const z = document.querySelector('.compositeur textarea'); if (z) { z.value = t; z.focus(); z.dispatchEvent(new Event('input')); } } }))) : null);
}

function menuConversation(c) {
  const actions = [
    { texte: c.pinned ? 'Désépingler' : 'Épingler', agir: async () => { await api.patch(`/api/conversation/${c.id}`, { pinned: !c.pinned }); aller('duel', { conv: c.id }); } },
    { texte: 'Renommer', agir: () => renommer(c) },
    { texte: 'Ranger', agir: () => ranger(c) },
    { texte: 'Exporter en Markdown', court: 'Exporter', agir: () => exporter(c) },
    { texte: 'Supprimer', danger: true, agir: async () => {
      if (await confirmer('Supprimer la conversation ?', 'Ses duels disparaissent avec elle.', { danger: true, oui: 'Supprimer' })) { await api.del(`/api/conversation/${c.id}`); E.courante = null; aller('duel'); }
    } },
  ];
  const sur = fn => async () => { try { await fn(); } catch (x) { toast(x.message, true); } };
  return [
    ...actions.map(a => h('button', { class: 'btn sm flat cache-m' + (a.danger ? ' danger' : ''), type: 'button', onclick: sur(a.agir) }, a.court || a.texte)),
    h('button', { class: 'btn sm flat seul-m', type: 'button', 'aria-label': 'Actions de la conversation', onclick: sur(() => feuille(c.title || 'Conversation', actions)) }, ic('actions', 16), 'Actions'),
  ];
}

async function renommer(c) {
  const champ = h('input', { class: 'field', value: c.title || '', maxlength: 80, 'aria-label': 'Titre' });
  const t = await dialogue({ titre: 'Renommer', contenu: [champ], boutons: [{ texte: 'Annuler', classe: 'flat', valeur: null }, { texte: 'Enregistrer', classe: 'solid', agir: () => champ.value.trim() || false }] });
  if (t) { await api.patch(`/api/conversation/${c.id}`, { title: t }); aller('duel', { conv: c.id }); }
}

// Le fichier est assemblé dans le navigateur : rien ne repasse par le serveur.
async function exporter(c) {
  const d = await api.get(`/api/conversation/${c.id}`);
  const parties = [`# ${d.conversation.title || 'Conversation'}`];
  for (const x of d.duels) {
    parties.push(`## ${x.question}`);
    if (x.qwen_text) parties.push(`**${nomLocal(x.qwen_model)}**`, x.qwen_text);
    if (x.claude_text) parties.push(`**${nomAdverse()}${x.claude_model && x.claude_model !== nomAdverse() ? ` · ${x.claude_model}` : ''}**`, x.claude_text);
    const v = x.verdict;
    if (x.mode !== 'qwen' && v?.claude && !v.skipped) parties.push(`> Verdict : ${v.winner === 'qwen' ? 'le modèle local' : nomAdverse()} l’emporte, ${v.qwen.total} contre ${v.claude.total} (écart ${v.gap}).`);
  }
  const url = URL.createObjectURL(new Blob([parties.join('\n\n') + '\n'], { type: 'text/markdown;charset=utf-8' }));
  const lien = h('a', { href: url, download: `${(d.conversation.title || 'conversation').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'conversation'}.md`, hidden: true });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function ranger(c) {
  const choix = h('select', { class: 'field' }, h('option', { value: '', text: 'Aucun projet' }), E.projets.map(p => h('option', { value: String(p.id), text: p.name, selected: p.id === c.project_id })), h('option', { value: '+', text: 'Nouveau projet…' }));
  const nom = h('input', { class: 'field', placeholder: 'Nom du projet', maxlength: 60, hidden: true, 'aria-label': 'Nom du projet' });
  choix.addEventListener('change', () => { nom.hidden = choix.value !== '+'; });
  const r = await dialogue({ titre: 'Ranger dans un projet', contenu: [choix, nom], boutons: [{ texte: 'Annuler', classe: 'flat', valeur: null }, { texte: 'Ranger', classe: 'solid', valeur: true }] });
  if (!r) return;
  if (choix.value === '+') {
    if (!nom.value.trim()) return;
    const p = await api.post('/api/projects', { name: nom.value.trim() });
    await api.patch(`/api/conversation/${c.id}`, { project_id: p.id });
  } else if (choix.value) await api.patch(`/api/conversation/${c.id}`, { project_id: choix.value });
  else await api.patch(`/api/conversation/${c.id}`, { clear_project: true });
  aller('duel', { conv: c.id });
}

function carteIA(cote, nom) {
  const corps = h('div', { class: 'md' }, h('p', { class: 'dim attente', text: 'Réflexion…' }));
  const pied = h('footer', { class: 'mono' });
  const carte = h('article', { class: 'carte-ia ' + cote },
    h('header', {}, h('span', { class: 'itile ' + (cote === 'local' ? 'key' : '') }, ic(cote === 'local' ? 'puce' : 'nuage', 15)), h('b', { class: 'tronque', text: nom }), h('span', { class: 'gagne', hidden: true }, ic('couronne', 13), 'gagnant')),
    corps, pied);
  let texte = '', planifie = false;
  return {
    carte,
    ajouter(t) {
      texte += t;
      if (planifie) return;
      planifie = true;
      requestAnimationFrame(() => { planifie = false; corps.replaceChildren(rendre(texte, { copier })); });
    },
    fin(meta) {
      if (meta.error) corps.replaceChildren(h('p', { class: 'note bad', text: meta.error }));
      else corps.replaceChildren(rendre(meta.text || texte, { copier }));
      if (meta.model) carte.querySelector('header b').textContent = cote === 'local' || meta.model === nomAdverse() ? meta.model : `${nomAdverse()} · ${meta.model}`;
      pied.textContent = [meta.ms ? `${(meta.ms / 1000).toFixed(1)} s` : null, meta.tokens ? `${meta.tokens} jetons` : null].filter(Boolean).join(' · ');
    },
    gagne() { carte.classList.add('vainqueur'); carte.querySelector('.gagne').hidden = false; },
  };
}

function echange(question, seul) {
  const local = carteIA('local', nomLocal(E.modeleLocal));
  const adverse = seul ? null : carteIA('adverse', nomAdverse());
  const verdict = h('div', { class: 'verdict', hidden: true });
  const infos = h('div', { class: 'infos' });
  const bloc = h('div', { class: 'echange' },
    h('div', { class: 'bulle' }, h('p', { text: question })), infos,
    h('div', { class: 'duel' + (seul ? ' seul' : '') }, local.carte, adverse?.carte), verdict);
  return { bloc, local, adverse, verdict, infos };
}

function peindreVerdict(x, v, seul) {
  if (seul) return;
  x.verdict.hidden = false;
  if (!v || v.skipped) {
    x.verdict.replaceChildren(h('p', { class: 'dim', text: v?.skipped === 'identique' ? 'Réponses presque identiques : pas de verdict.' : 'Question trop courte ou réponses trop brèves : pas de verdict.' }));
    return;
  }
  const gagnant = v.winner === 'qwen' ? x.local : x.adverse;
  gagnant?.gagne();
  const criteres = Object.keys(v.qwen.crit);
  x.verdict.replaceChildren(
    h('header', {}, h('b', { text: `${v.winner === 'qwen' ? 'Le modèle local' : nomAdverse()} l’emporte` }), h('span', { class: 'mono dim', text: `${v.qwen.total} contre ${v.claude.total} · écart ${v.gap}` })),
    h('div', { class: 'crit' }, criteres.map(k => h('div', { class: 'ligne-crit' },
      h('span', { class: 'dim', text: k }),
      h('span', { class: 'barre local' }, h('i', { dataset: { v: v.qwen.crit[k] } })), h('b', { class: 'mono', text: String(v.qwen.crit[k]) }),
      h('span', { class: 'barre adverse' }, h('i', { dataset: { v: v.claude.crit[k] } })), h('b', { class: 'mono', text: String(v.claude.crit[k]) })))),
    ...(v.delta?.length ? [h('p', { class: 'delta' }, h('span', { class: 'dim', text: 'Ce que le gagnant a en plus : ' }), v.delta.map(d => h('span', { class: 'chip a', text: d })))] : []));
  for (const i of x.verdict.querySelectorAll('.barre i')) i.style.width = `${Math.max(0, Math.min(10, Number(i.dataset.v))) * 10}%`;
}

function echangeEnregistre(d) {
  const seul = d.mode === 'qwen';
  const x = echange(d.question, seul);
  x.local.fin({ model: d.qwen_model, text: d.qwen_text, ms: d.qwen_ms });
  x.adverse?.fin({ model: d.claude_model, text: d.claude_text, ms: d.claude_ms });
  x.infos.append(h('span', { class: 'when', text: quand(d.ts) }));
  peindreVerdict(x, d.verdict, seul);
  return x.bloc;
}

function compositeur(fil, entete) {
  const zone = h('textarea', { rows: 1, placeholder: 'Pose ta question…', 'aria-label': 'Question', maxlength: 20000 });
  const envoyer = h('button', { class: 'btn solid envoyer', type: 'submit', 'aria-label': 'Envoyer' }, ic('envoyer', 15));
  const modes = h('div', { class: 'views', role: 'radiogroup', 'aria-label': 'Mode' });
  const peindreModes = () => modes.replaceChildren(...[['duel', 'Duel'], ['qwen', 'Local seul']].map(([v, t]) =>
    h('button', { class: 'view' + (E.mode === v ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(E.mode === v), text: t, onclick: () => { E.mode = v; peindreModes(); } })));
  peindreModes();
  const choixLocal = h('select', { class: 'field petit cache-s', 'aria-label': 'Modèle local' },
    (E.modeles?.installed || []).filter(n => !/embed/i.test(n)).map(n => h('option', { value: n, text: n, selected: n === E.modeleLocal })));
  choixLocal.addEventListener('change', () => { E.modeleLocal = choixLocal.value; });
  const web = h('button', { class: 'ghost' + (E.web ? ' actif' : ''), type: 'button', title: 'Recherche web', 'aria-pressed': String(E.web), onclick: () => { E.web = !E.web; web.classList.toggle('actif', E.web); web.setAttribute('aria-pressed', String(E.web)); } }, ic('web'));
  const fichier = h('input', { type: 'file', multiple: true, hidden: true, accept: '.txt,.md,.csv,.json,.log,.py,.js,.ts,.sh,.yml,.yaml,.html,.css,.sql,.conf,.ini,text/*' });
  const pieces = h('div', { class: 'pieces' });
  const peindrePieces = () => pieces.replaceChildren(...E.pieces.map((p, i) => h('span', { class: 'chip' }, p.name, h('button', { type: 'button', 'aria-label': `Retirer ${p.name}`, onclick: () => { E.pieces.splice(i, 1); peindrePieces(); } }, icone('croix', 12)))));
  fichier.addEventListener('change', async () => {
    for (const f of fichier.files) {
      if (E.pieces.length >= 5) { toast('Cinq fichiers au plus.', true); break; }
      if (f.size > 60_000) { toast(`${f.name} dépasse 60 Ko.`, true); continue; }
      E.pieces.push({ name: f.name.slice(0, 200), type: 'text', data: await f.text(), size: f.size });
    }
    fichier.value = '';
    peindrePieces();
  });
  const joindre = h('button', { class: 'ghost', type: 'button', title: 'Joindre un fichier texte', onclick: () => fichier.click() }, ic('trombone'));
  zone.addEventListener('input', () => { zone.style.height = 'auto'; zone.style.height = Math.min(zone.scrollHeight, 220) + 'px'; });
  zone.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); } });

  const form = h('form', { class: 'compositeur', onsubmit: async ev => {
    ev.preventDefault();
    if (E.arret) { E.arret.abort(); return; }
    const q = zone.value.trim();
    if (!q) return;
    zone.value = ''; zone.dispatchEvent(new Event('input'));
    fil.querySelector('.accueil')?.remove();
    await lancer(q, fil, entete, envoyer);
  } }, pieces, h('div', { class: 'saisie' }, zone, envoyer), h('div', { class: 'outils' }, modes, choixLocal, web, joindre, fichier));
  return form;
}

async function lancer(q, fil, { titre, actions }, bouton) {
  const seul = E.mode === 'qwen';
  const x = echange(q, seul);
  fil.append(x.bloc);
  fil.scrollTo({ top: x.bloc.offsetTop - fil.offsetTop - 8, behavior: 'smooth' });
  E.arret = new AbortController();
  bouton.replaceChildren(ic('stop', 15)); bouton.setAttribute('aria-label', 'Arrêter');
  const corps = { q, noclaude: seul, web: E.web, ...(E.courante ? { conv_id: E.courante } : {}), ...(E.modeleLocal ? { ollama_model: E.modeleLocal } : {}), ...(E.pieces.length ? { attachments: E.pieces } : {}) };
  E.pieces = [];
  document.querySelector('.pieces')?.replaceChildren();
  try {
    const r = await fetch('/api/duel/stream', { method: 'POST', credentials: 'same-origin', signal: E.arret.signal, headers: { 'Content-Type': 'application/json', 'X-CSRF': api.csrf }, body: JSON.stringify(corps) });
    if (!r.ok) { let m = `Erreur ${r.status}`; try { m = (await r.json()).error || m; } catch { /* corps vide */ } throw new Error(m); }
    const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let tampon = '';
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += value;
      let i;
      while ((i = tampon.indexOf('\n\n')) >= 0) {
        const bloc = tampon.slice(0, i); tampon = tampon.slice(i + 2);
        if (!bloc.startsWith('data: ')) continue;
        const e = JSON.parse(bloc.slice(6));
        if (e.t === 'delta') (e.side === 'qwen' ? x.local : x.adverse)?.ajouter(e.text);
        else if (e.t === 'meta') (e.side === 'qwen' ? x.local : x.adverse)?.fin(e);
        else if (e.t === 'status') x.infos.replaceChildren(h('span', { class: 'when', text: e.text }));
        else if (e.t === 'ctx') x.infos.append(h('span', { class: 'chip', text: 'contexte mémoire' }));
        else if (e.t === 'web') x.infos.replaceChildren(...e.results.map((w, n) => h('a', { class: 'chip', href: w.url, target: '_blank', rel: 'noopener noreferrer nofollow', title: w.snippet, text: `[${n + 1}] ${w.title}` })));
        else if (e.t === 'verdict') {
          peindreVerdict(x, e.verdict, seul);
          if (!E.courante) { E.courante = e.conv_id; titre.textContent = q.slice(0, 80); actions.replaceChildren(...menuConversation({ id: e.conv_id, title: q.slice(0, 80), pinned: 0 })); history.replaceState(null, '', '#duel/' + e.conv_id); }
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message, true);
    x.infos.append(h('span', { class: 'chip w', text: err.name === 'AbortError' ? 'interrompu' : 'échec' }));
  } finally {
    E.arret = null;
    bouton.replaceChildren(ic('envoyer', 15)); bouton.setAttribute('aria-label', 'Envoyer');
    chargerConversations().then(() => { const l = document.querySelector('.salle .liste'); if (l) l.replaceWith(listeConversations({ compacte: true })); });
  }
}

async function pageStats() {
  const s = await api.get('/api/stats');
  if (!E.modeles) await chargerModeles();
  const fig = (ico, l, v, d) => h('div', { class: 'fig' }, h('div', { class: 'tile' }, ic(ico)), h('span', { text: l }), h('strong', { text: v }), h('div', { class: 'delta', text: d }));
  const max = Math.max(...s.gaps.map(Number)) || 1;
  const barres = h('div', { class: 'ecarts', role: 'img', 'aria-label': `Écarts des derniers duels : ${s.gaps.join(', ')}` }, s.gaps.map(g => h('i', { title: String(g), dataset: { h: String(g / max) } })));
  for (const i of barres.children) i.style.height = `${Math.max(4, Number(i.dataset.h) * 100)}%`;
  return h('div', { class: 'page' },
    h('div', { class: 'headrow' }, h('div', {}, h('h1', { class: 'title', text: 'Statistiques' }), h('p', { class: 'lede', text: 'Tes duels départagés. Les réponses du modèle local seul ne comptent pas comme des victoires.' }))),
    h('div', { class: 'figs' },
      fig('duel', 'Duels', String(s.total), `${s.judged} départagé${s.judged > 1 ? 's' : ''}`),
      fig('couronne', 'Victoires du local', `${s.qwen_winrate} %`, s.judged ? `sur ${s.judged}` : 'aucun verdict'),
      fig('puce', 'Moyenne locale', String(s.avg_qwen), 'sur 10'),
      fig('nuage', `Moyenne ${nomAdverse()}`, String(s.avg_claude), 'sur 10')),
    h('div', { class: 'card' }, h('header', {}, h('h2', { text: 'Écarts des derniers duels' }), h('span', { class: 'note', text: s.last_gap !== null ? `dernier : ${s.last_gap}` : '—' })),
      h('div', { class: 'pad' }, s.gaps.length ? barres : h('p', { class: 'vide', text: 'Pas encore de duel départagé.' }))));
}

async function pageReglages() {
  await chargerModeles();
  const m = E.modeles;
  if (!m) return h('div', { class: 'page' }, h('p', { class: 'erreur', text: 'Réglages indisponibles.' }));
  const c = m.config;
  const choix = (etiquette, options, valeur) => {
    const s = h('select', { class: 'field' }, options.map(o => h('option', { value: o, text: o, selected: o === valeur })));
    return { s, noeud: h('label', { class: 'champ' }, h('span', { class: 'lbl', text: etiquette }), s) };
  };
  const nombre = (etiquette, valeur, min, max, aide) => {
    const i = h('input', { class: 'field mono', type: 'number', min, max, value: String(valeur) });
    return { i, noeud: h('label', { class: 'champ' }, h('span', { class: 'lbl', text: etiquette }), i, aide ? h('p', { class: 'hint', text: aide }) : null) };
  };
  const local = choix('Modèle local par défaut', m.installed.filter(n => !/embed/i.test(n)), c.ollama_model);
  const mode = h('select', { class: 'field' }, h('option', { value: 'duel', text: 'Duel', selected: c.mode !== 'qwen' }), h('option', { value: 'qwen', text: 'Local seul', selected: c.mode === 'qwen' }));
  const ctx = nombre('Contexte (jetons)', c.num_ctx, 512, 131072, 'Mémoire de travail du modèle local.');
  const lon = nombre('Réponse maximale (jetons)', c.num_predict, 64, 32768, 'Vaut aussi pour l’adversaire : plafond de dépense par duel.');
  const reflexion = h('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(!!c.thinking), 'aria-label': 'Réflexion', onclick: () => reflexion.setAttribute('aria-checked', String(reflexion.getAttribute('aria-checked') !== 'true')) }, h('i'));
  const adverse = m.claude.length ? choix(`Modèle de ${m.adversaire.nom}`, m.claude, c.claude_model) : null;
  const enregistrer = async () => {
    const corps = { mode: mode.value, thinking: reflexion.getAttribute('aria-checked') === 'true', num_ctx: Number(ctx.i.value), num_predict: Number(lon.i.value) };
    if (local.s.value) corps.ollama_model = local.s.value;
    if (adverse?.s.value) corps.claude_model = adverse.s.value;
    try { await api.post('/api/config', corps); toast('Réglages enregistrés.'); E.modeles = null; E.modeleLocal = ''; await chargerModeles(); peindreAdversaire(); } catch (x) { toast(x.message, true); }
  };
  const telechargements = h('div', {}, m.catalog.map(t => {
    const deja = m.installed.includes(t.name);
    const progres = h('div', { class: 'bar' }, h('i'));
    const b = h('button', { class: 'btn sm', type: 'button', disabled: deja, text: deja ? 'Installé' : 'Télécharger' });
    b.addEventListener('click', () => telecharger(t.name, b, progres));
    return h('div', { class: 'flowrow' }, h('div', { class: 'itile' }, ic('puce')), h('div', {}, h('strong', { class: 'mono', text: t.name }), h('small', { text: `${t.desc} · ${t.size}` }), progres), h('div', { class: 'fin' }, b));
  }));
  return h('div', { class: 'page' },
    h('div', { class: 'headrow' }, h('div', {}, h('h1', { class: 'title', text: 'Réglages' }), h('p', { class: 'lede', text: 'Valables pour tous les comptes de ce service. Chaque changement est inscrit au journal.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn solid', type: 'button', onclick: enregistrer }, icone('verifie'), 'Enregistrer'))),
    m.ollama_error ? h('div', { class: 'note bad' }, icone('alerte'), h('div', { text: m.ollama_error })) : null,
    h('div', { class: 'split' },
      h('div', { class: 'card' }, h('header', {}, h('h2', { text: 'Modèle local' }), h('span', { class: 'note', text: m.ollama_url || '' })),
        h('div', { class: 'pad' }, local.noeud, h('label', { class: 'champ' }, h('span', { class: 'lbl', text: 'Mode par défaut' }), mode), h('div', { class: 'row2 grpf' }, ctx.noeud, lon.noeud),
          h('div', { class: 'flowrow nu' }, reflexion, h('div', {}, h('strong', { text: 'Réflexion avant de répondre' }), h('small', { text: 'Plus juste sur les questions difficiles, bien plus lent sur le reste.' })), h('span')))),
      h('div', { class: 'card' }, h('header', {}, h('h2', { text: 'Adversaire' }), h('span', { class: 'note', text: m.adversaire.id })),
        h('div', { class: 'pad' },
          m.adversaire.manque ? h('div', { class: 'note warn' }, icone('alerte'), h('div', { text: m.adversaire.manque })) : h('div', { class: 'note ok' }, icone('verifie'), h('div', { text: `${m.adversaire.nom} est prêt.` })),
          adverse ? h('div', { class: 'grpf' }, adverse.noeud) : h('p', { class: 'hint', text: 'Le fournisseur n’a pas renvoyé de liste de modèles : le modèle vient de la configuration du Hub.' }),
          h('p', { class: 'aide', text: 'Le choix du fournisseur et sa clé se règlent dans le Hub. La clé ne quitte jamais le serveur d’Oracle.' })))),
    h('div', { class: 'card' }, h('header', {}, h('h2', { text: 'Télécharger un modèle' }), h('p', { text: 'Directement sur l’Ollama du Hub. Compte plusieurs gigaoctets et quelques minutes.' })), telechargements));
}

async function telecharger(nom, bouton, progres) {
  bouton.disabled = true; bouton.textContent = 'En cours…';
  const barre = progres.firstChild;
  try {
    const r = await fetch('/api/pull', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF': api.csrf }, body: JSON.stringify({ model: nom }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
    const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let tampon = '', dernier = null;
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += value;
      let i;
      while ((i = tampon.indexOf('\n\n')) >= 0) {
        const e = JSON.parse(tampon.slice(6, i)); tampon = tampon.slice(i + 2);
        dernier = e;
        if (e.pct !== null && e.pct !== undefined) barre.style.width = `${e.pct}%`;
        bouton.textContent = e.pct ? `${Math.round(e.pct)} %` : 'En cours…';
      }
    }
    if (dernier?.error) throw new Error(dernier.status);
    bouton.textContent = 'Installé'; toast(`${nom} est installé.`);
    E.modeles = null;
  } catch (x) { bouton.disabled = false; bouton.textContent = 'Réessayer'; toast(x.message, true); }
}

await chargerModeles();
peindreAdversaire();
const [page, conv] = location.hash.slice(1).split('/');
aller(page || 'duel', { conv: /^[\w-]{16}$/.test(conv || '') ? conv : null });
