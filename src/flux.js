// Lecture ligne à ligne d'une réponse HTTP en flux (NDJSON d'Ollama, SSE des
// fournisseurs), et une file simple entre producteurs et réponse au client.

export async function* lignes(corps, { maxLigne = 1 << 20 } = {}) {
  const dec = new TextDecoder();
  let tampon = '';
  for await (const morceau of corps) {
    tampon += dec.decode(morceau, { stream: true });
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      yield tampon.slice(0, i).replace(/\r$/, '');
      tampon = tampon.slice(i + 1);
    }
    // Une « ligne » sans fin qui grossit indéfiniment n'est plus un flux, c'est
    // une attaque ou un bogue : on s'arrête.
    if (tampon.length > maxLigne) throw new Error('ligne démesurée dans le flux');
  }
  tampon += dec.decode();
  if (tampon) yield tampon;
}

export class File {
  constructor() { this.elements = []; this.attente = null; }
  pousser(x) {
    if (this.attente) { const r = this.attente; this.attente = null; r(x); } else this.elements.push(x);
  }
  prendre() {
    if (this.elements.length) return Promise.resolve(this.elements.shift());
    return new Promise(r => { this.attente = r; });
  }
}

export const ms = t0 => Math.round(performance.now() - t0);
