// Rendu Markdown des réponses des modèles, en nœuds DOM et jamais en HTML :
// une réponse est une donnée venue d'ailleurs (et d'une question qui a pu lire
// une page hostile). Pas d'image distante — une image Markdown est un canal
// d'exfiltration —, des liens http(s) seulement, ouverts sans référent.
import { h } from '/socle/compte.js';

const lienSur = u => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : null; } catch { return null; } };

// Une formule s'affiche d'abord en source, puis KaTeX (servi par Oracle, chargé
// à la première formule) la remplace par du MathML : ni style en ligne, ni
// police, ni commande de confiance (\href, \includegraphics…).
const TEX_MAX = 4000;
const formule = (tex, bloc) => h(bloc ? 'div' : 'span', { class: 'math' + (bloc ? ' math-d' : ''), dataset: { tex } }, h('code', { text: tex }));
// « $…$ » n'est une formule que s'il contient une commande ou un exposant :
// « 5$ et 10$ » reste un prix.
const texEnLigne = t => /\\[a-zA-Z]+|[\^_][{\w]/.test(t);

let katex;
const chargerKatex = () => katex ??= import('/vendor/katex-0.18.7.min.js').then(() => globalThis.katex, () => null);

function composer(noeuds) {
  if (!noeuds.length) return;
  chargerKatex().then(k => {
    if (!k) return;
    for (const n of noeuds) {
      if (n.dataset.tex.length > TEX_MAX) continue;
      try { k.render(n.dataset.tex, n, { displayMode: n.classList.contains('math-d'), output: 'mathml', throwOnError: false, trust: false, strict: 'ignore', maxSize: 40, maxExpand: 500 }); } catch { /* la source reste affichée */ }
    }
  });
}

function enLigne(texte) {
  const out = [];
  const re = /(`[^`\n]+`)|(\\\((?:(?!\\\)).)+\\\))|(\$\$[^$\n]+?\$\$|\$(?=\S)[^$\n]*?\S\$(?!\d)|\$[^\s$]\$)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w))|(!?\[[^\]\n]*\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let i = 0, m;
  while ((m = re.exec(texte))) {
    const [tout] = m;
    const double = m[3]?.startsWith('$$');
    if (m[3] && !double && !texEnLigne(tout)) { re.lastIndex = m.index + 1; continue; }
    if (m.index > i) out.push(texte.slice(i, m.index));
    if (m[1]) out.push(h('code', { text: tout.slice(1, -1) }));
    else if (m[2]) out.push(formule(tout.slice(2, -2).trim(), false));
    else if (m[3]) out.push(formule(double ? tout.slice(2, -2).trim() : tout.slice(1, -1).trim(), false));
    else if (m[4]) out.push(h('strong', {}, enLigne(tout.slice(2, -2))));
    else if (m[5]) out.push(h('del', {}, enLigne(tout.slice(2, -2))));
    else if (m[6]) out.push(h('em', {}, enLigne(tout.slice(1, -1))));
    else if (m[7]) {
      const [, img, lib, url] = /^(!?)\[([^\]]*)\]\(([^)\s]+)\)$/.exec(tout);
      const sur = lienSur(url);
      out.push(sur ? h('a', { href: sur, target: '_blank', rel: 'noopener noreferrer nofollow', text: (img ? 'image : ' : '') + (lib || sur) }) : (lib || url));
    } else if (m[8]) {
      const sur = lienSur(tout);
      out.push(sur ? h('a', { href: sur, target: '_blank', rel: 'noopener noreferrer nofollow', text: tout }) : tout);
    }
    i = m.index + tout.length;
  }
  if (i < texte.length) out.push(texte.slice(i));
  return out;
}

function blocCode(langue, code, copier) {
  const bouton = h('button', { class: 'lnk', type: 'button', text: 'Copier', onclick: () => copier?.(code) });
  return h('figure', { class: 'code' }, h('figcaption', {}, h('span', { text: langue || 'code' }), bouton), h('pre', {}, h('code', { text: code })));
}

// Bloc « $$ … $$ » ou « \[ … \] », sur une ligne ou plusieurs. Sans fermeture,
// ce n'est pas une formule : la ligne reste du texte.
function blocMath(lignes, i) {
  const o = /^\s*(\$\$|\\\[)(.*)$/.exec(lignes[i]);
  if (!o) return null;
  const fin = o[1] === '$$' ? '$$' : '\\]';
  const tex = [];
  let reste = o[2];
  for (let j = i; j < lignes.length; j++, reste = lignes[j]) {
    const k = reste?.indexOf(fin) ?? -1;
    if (k >= 0) {
      tex.push(reste.slice(0, k));
      if (reste.slice(k + fin.length).trim()) return null;
      return { tex: tex.join('\n').trim(), suite: j + 1 };
    }
    tex.push(reste);
  }
  return null;
}

export function rendre(md, { copier } = {}) {
  const frag = rendreBlocs(md, { copier });
  composer([...frag.querySelectorAll('.math')]);
  return frag;
}

function rendreBlocs(md, { copier }) {
  const frag = document.createDocumentFragment();
  const lignes = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const para = [];
  const vider = () => { if (para.length) { frag.append(h('p', {}, enLigne(para.join('\n')))); para.length = 0; } };
  while (i < lignes.length) {
    const l = lignes[i];
    const cloture = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(l);
    if (cloture) {
      vider();
      const code = [];
      i++;
      while (i < lignes.length && !new RegExp('^\\s*' + cloture[1] + '\\s*$').test(lignes[i])) code.push(lignes[i++]);
      i++;
      frag.append(blocCode(cloture[2], code.join('\n'), copier));
      continue;
    }
    const math = blocMath(lignes, i);
    if (math?.tex) { vider(); frag.append(formule(math.tex, true)); i = math.suite; continue; }
    const titre = /^(#{1,4})\s+(.+)$/.exec(l);
    if (titre) { vider(); frag.append(h('h' + Math.min(6, titre[1].length + 2), {}, enLigne(titre[2]))); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { vider(); frag.append(h('hr')); i++; continue; }
    if (/^\s*>/.test(l)) {
      vider();
      const cit = [];
      while (i < lignes.length && /^\s*>/.test(lignes[i])) cit.push(lignes[i++].replace(/^\s*>\s?/, ''));
      frag.append(h('blockquote', {}, rendreBlocs(cit.join('\n'), { copier })));
      continue;
    }
    const puce = /^(\s*)([-*+]|\d{1,3}[.)])\s+/.exec(l);
    if (puce) {
      vider();
      const ordonnee = /\d/.test(puce[2]);
      const liste = h(ordonnee ? 'ol' : 'ul');
      while (i < lignes.length) {
        const p = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(lignes[i]);
        if (!p) { if (/^\s{2,}\S/.test(lignes[i]) && liste.lastChild) { liste.lastChild.append(' ', ...enLigne(lignes[i].trim())); i++; continue; } break; }
        liste.append(h('li', {}, enLigne(p[3])));
        i++;
      }
      frag.append(liste);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lignes[i + 1] || '')) {
      vider();
      const cellules = x => x.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const tete = cellules(l);
      i += 2;
      const corps = [];
      while (i < lignes.length && /^\s*\|.*\|\s*$/.test(lignes[i])) corps.push(cellules(lignes[i++]));
      frag.append(h('div', { class: 'tw' }, h('table', { class: 'md' }, h('thead', {}, h('tr', {}, tete.map(c => h('th', {}, enLigne(c))))), h('tbody', {}, corps.map(r => h('tr', {}, r.map(c => h('td', {}, enLigne(c)))))))));
      continue;
    }
    if (!l.trim()) { vider(); i++; continue; }
    para.push(l);
    i++;
  }
  vider();
  return frag;
}
