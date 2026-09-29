// Recherche web sans clé d'API (DuckDuckGo, version HTML puis « lite »), et le
// contexte d'un service de mémoire externe. Les hôtes sont fixés dans le code
// ou par l'administrateur : aucune adresse ne vient d'une requête.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };

const propre = s => String(s || '').replace(/<[^>]+>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENTITES[e.toLowerCase()] ?? m;
  }).trim();

function lienReel(u) {
  const m = /uddg=([^&]+)/.exec(u);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return ''; } }
  return u.startsWith('//') ? 'https:' + u : u;
}

// Seules des adresses http(s) bien formées sortent d'ici : le navigateur en
// fera des liens, et un « javascript: » n'a rien à y faire.
function lienSur(u) {
  try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : null; } catch { return null; }
}

async function poster(url, q) {
  const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ q }), redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  return (await r.text()).slice(0, 2_000_000);
}

async function ddg(q, n) {
  const h = await poster('https://html.duckduckgo.com/html/', q);
  const resultats = [];
  for (const m of h.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=class="result__a"|<\/html>)/g)) {
    if (resultats.length >= n) break;
    const extrait = /result__snippet[^>]*>([\s\S]*?)<\/a>/.exec(m[3]);
    resultats.push({ url: lienReel(propre(m[1])), title: propre(m[2]), snippet: extrait ? propre(extrait[1]).slice(0, 300) : '' });
  }
  return resultats;
}

async function lite(q, n) {
  const h = await poster('https://lite.duckduckgo.com/lite/', q);
  const liens = [...h.matchAll(/<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const extraits = [...h.matchAll(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g)];
  return liens.slice(0, n).map((m, i) => ({ url: lienReel(propre(m[1])), title: propre(m[2]), snippet: extraits[i] ? propre(extraits[i][1]).slice(0, 300) : '' }));
}

export async function rechercher(q, n = 5) {
  for (const f of [ddg, lite]) {
    try {
      const trouves = (await f(q, n)).map(r => ({ ...r, url: lienSur(r.url), title: r.title.slice(0, 200) })).filter(r => r.url);
      if (trouves.length) return trouves;
    } catch { /* on tente la version suivante */ }
  }
  return [];
}

export function formaterResultats(trouves) {
  if (!trouves.length) return '';
  return ['Résultats de recherche web (utilise-les et cite les sources) :', ...trouves.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource : ${r.url}`)].join('\n\n');
}

export async function contexteMemoire({ url, cle }, q) {
  if (!url) return '';
  try {
    const r = await fetch(`${url}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cle ? { 'X-API-Key': cle } : {}) }, body: JSON.stringify({ q }), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return '';
    const j = await r.json();
    return String(j.answer || j.context || '').slice(0, 20_000);
  } catch { return ''; }
}
