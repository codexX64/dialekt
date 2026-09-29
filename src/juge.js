// Le juge déterministe : départage deux réponses sur des critères mesurables,
// jamais par un modèle. Portage exact de la version Python (1.2) : les verdicts
// déjà enregistrés et ceux d'aujourd'hui se comparent sur la même échelle.
//
// Trois écarts de langage sont compensés à la main :
//   - round() de Python arrondit la valeur binaire exacte au pair le plus
//     proche (round(9.625, 2) vaut 9.62) ; toFixed arrondit vers le haut ;
//   - sum() de Python 3.12 additionne les entiers exactement, puis compense
//     les flottants (Neumaier) ; et un entier reste un entier (10 et non 10.0) ;
//   - \w, \b, \s et \d sont Unicode en Python, ASCII en JavaScript.

// Classes de caractères au sens de Python.
const W = '[\\p{L}\\p{N}_]';
const PAS_W = '[^\\p{L}\\p{N}_]';
const S = '[\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const FIN_MOT = `(?!${W})`;
const py = (source, drapeaux = '') => new RegExp(source.replaceAll('\\b', FIN_MOT).replaceAll('\\s', S).replaceAll('\\d', '\\p{Nd}'), drapeaux + 'u');

const FEATURES = {
  "gestion d'erreur": py('try\\b|except\\b|catch\\b|\\.catch\\(|Result<|err\\s*!=\\s*nil|throw\\b|raise\\b', 'i'),
  'cross-browser -webkit-': py('-webkit-|-moz-|-ms-', 'i'),
  'accessibilité (aria)': py('aria-[a-z]+|role\\s*=|alt\\s*=', 'i'),
  'commentaires': py('//|/\\*|<!--|\\n\\s*#\\s', 'i'),
  'transitions / anim': py('transition\\s*:|@keyframes|animation\\s*:', 'i'),
  'responsive': py('@media|clamp\\(|min\\(|max\\(|\\d+vw|\\d+vh', 'i'),
  'variables / tokens': py('var\\(--|:root|--[a-z-]+\\s*:', 'i'),
  'cas limites': py('if\\s*\\(|guard\\b|is None|== null|=== undefined|isEmpty|len\\(', 'i'),
  'typage': py(':\\s*(string|number|int|str|bool|float)\\b|<[A-Z]\\w+>|interface\\b|type\\b', 'i'),
};
// \b en tête de motif : début de mot, pas fin de mot.
FEATURES['typage'] = new RegExp(FEATURES['typage'].source.replace('<[A-Z]\\w+>', `<[A-Z]${W}+>`), 'iu');
const CODE_HINT = py('```|<[a-z]+[ />]|def\\s|func\\s|class\\s|SELECT\\s|const\\s|=>', 'i');
const GREETINGS = new RegExp(`^${S}*(salut|bonjour|coucou|hello|hey|hi|yo|ça va|ca va|test|merci|ok|d'accord)${FIN_MOT}`, 'iu');
const LISTE = new RegExp(`(?<![^\\n])${S}*[-*\\p{Nd}]`, 'u');
const MOT = new RegExp(`${W}+`, 'gu');
const BLOC = /```[a-zA-Z0-9]*\n([\s\S]*?)```/g;

const ESPACES = new Set([...'\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0                　']);
function strip(s) {
  const c = [...s];
  let a = 0, b = c.length;
  while (a < b && ESPACES.has(c[a])) a++;
  while (b > a && ESPACES.has(c[b - 1])) b--;
  return c.slice(a, b).join('');
}
const longueur = s => [...s].length;
const compte = (s, sous) => s.split(sous).length - 1;

// Nombres à la Python : { v, entier }.
const ent = v => ({ v, entier: true });
const flo = v => ({ v, entier: false });

// Arrondi au pair de la valeur binaire exacte, par ses chiffres décimaux.
export function arrondi(x, n = 0) {
  if (x.entier) return x;
  const v = x.v;
  if (!Number.isFinite(v)) return x;
  const exact = Math.abs(v).toFixed(100);
  const [ip, fp = ''] = exact.split('.');
  const garde = fp.slice(0, n), suite = fp.slice(n);
  let chiffres = BigInt(ip + garde);
  const premier = suite[0] || '0';
  const reste = suite.slice(1).replace(/0+$/, '');
  if (premier > '5' || (premier === '5' && reste) || (premier === '5' && !reste && chiffres % 2n === 1n)) chiffres += 1n;
  const s = chiffres.toString().padStart(n + 1, '0');
  const r = Number(n ? `${s.slice(0, s.length - n)}.${s.slice(s.length - n)}` : s);
  return flo(v < 0 ? -r : r);
}

// sum() de CPython 3.12 : préfixe entier exact, puis addition simple au passage
// au flottant, puis Neumaier sur les flottants suivants.
export function somme(valeurs) {
  let i = 0, entier = 0;
  while (i < valeurs.length && valeurs[i].entier) entier += valeurs[i++].v;
  if (i === valeurs.length) return ent(entier);
  let f = entier + valeurs[i++].v, c = 0;
  for (; i < valeurs.length; i++) {
    const x = valeurs[i];
    if (x.entier) { f += x.v; continue; }
    const t = f + x.v;
    c += Math.abs(f) >= Math.abs(x.v) ? (f - t) + x.v : (x.v - t) + f;
    f = t;
  }
  if (c && Number.isFinite(c)) f += c;
  return flo(f);
}
const mini = (a, b) => (b.v < a.v ? b : a);
const div = (a, b) => flo(a.v / b.v);

function extraitCode(texte) {
  const blocs = [...texte.matchAll(BLOC)].map(m => m[1]);
  return blocs.length ? blocs.join('\n') : texte;
}
export const genre = texte => (CODE_HINT.test(texte || '') ? 'code' : 'prose');
function traits(texte) {
  const code = extraitCode(texte);
  return new Set(Object.entries(FEATURES).filter(([, rx]) => rx.test(code)).map(([nom]) => nom));
}
const equilibre = t => [['{', '}'], ['(', ')'], ['[', ']']].every(([o, f]) => compte(t, o) === compte(t, f));
// Tri de Python sur des chaînes : par point de code, pas par unité UTF-16.
const triPy = liste => [...liste].sort((a, b) => { const x = [...a], y = [...b]; for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; } return x.length - y.length; });

function note(texte) {
  texte = texte || '';
  const n = longueur(strip(texte));
  const code = extraitCode(texte);
  const f = traits(texte);
  return { n, code, f };
}

function scoreUn(texte, kind) {
  texte = texte || '';
  const { n, code, f } = note(texte);
  const substance = ent(2 + (n > 120) * 2 + (n > 350) * 2 + (n > 700) * 2 + (n > 1400) * 1);
  const richesse = mini(ent(10), flo(2 + f.size * 1.3));
  const concision = ent(n >= 120 && n <= 2600 ? 10 : (n < 120 ? 6 : 5));
  let structure;
  if (kind === 'code') {
    structure = ent(3 + texte.includes('```') * 3 + equilibre(code) * 3 + (code.includes('//') || code.includes('#') || code.includes('/*')) * 1);
  } else {
    structure = ent(3 + (compte(texte, '\n') > 2) * 2 + LISTE.test(texte) * 3 + (n > 300) * 2);
  }
  const crit = {
    Substance: arrondi(mini(ent(10), substance), 1), Richesse: arrondi(mini(ent(10), richesse), 1),
    Structure: arrondi(mini(ent(10), structure), 1), Concision: arrondi(mini(ent(10), concision), 1),
  };
  return { crit, total: arrondi(div(somme(Object.values(crit)), ent(4)), 2), features: triPy(f), chars: n };
}

function similaire(a, b) {
  const wa = new Set((a || '').toLowerCase().match(MOT) || []);
  const wb = new Set((b || '').toLowerCase().match(MOT) || []);
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const m of wa) if (wb.has(m)) inter++;
  return inter / (wa.size + wb.size - inter);
}

function trivial(question, qTexte, cTexte) {
  const q = strip(question || '');
  if (longueur(q) < 12 || GREETINGS.test(q)) return true;
  const plusLong = Math.max(longueur(qTexte || ''), longueur(cTexte || ''));
  return plusLong < 140 && genre(qTexte || cTexte) === 'prose';
}

const nombres = s => s && { ...s, crit: Object.fromEntries(Object.entries(s.crit).map(([k, x]) => [k, x.v])), total: s.total.v };

export function juger(local, adverse, { seul = false, question = '' } = {}) {
  const qTexte = local.error ? '' : (local.text || '');
  const cTexte = adverse.error ? '' : (adverse.text || '');
  const kind = genre(qTexte || cTexte);
  const estTrivial = trivial(question, qTexte, cTexte);
  const doublon = !seul && similaire(qTexte, cTexte) >= 0.82;
  if (estTrivial || doublon) return { kind, qwen: null, claude: null, winner: null, gap: 0, delta: [], skipped: estTrivial ? 'trivial' : 'identique' };
  const q = scoreUn(qTexte, kind);
  const c = seul ? null : scoreUn(cTexte, kind);
  if (!seul) {
    const qm = ent(local.ms || 1), cm = ent(adverse.ms || 1);
    q.crit.Latence = qm.v <= cm.v ? flo(10) : arrondi(div(ent(10 * cm.v), qm), 1);
    c.crit.Latence = cm.v <= qm.v ? flo(10) : arrondi(div(ent(10 * qm.v), cm), 1);
    for (const s of [q, c]) s.total = arrondi(div(somme(Object.values(s.crit)), ent(Object.keys(s.crit).length)), 2);
  }
  if (seul) return { kind, qwen: nombres(q), claude: null, winner: 'qwen', delta: [], gap: 0 };
  const gagnant = c.total.v >= q.total.v ? 'claude' : 'qwen';
  const ecart = arrondi(flo(Math.abs(c.total.v - q.total.v)), 2).v;
  const g = new Set(gagnant === 'claude' ? c.features : q.features);
  const p = new Set(gagnant === 'claude' ? q.features : c.features);
  return { kind, qwen: nombres(q), claude: nombres(c), winner: gagnant, gap: ecart, delta: triPy([...g].filter(x => !p.has(x))) };
}
