import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { juger, arrondi, somme } from '../src/juge.js';

// Vecteurs produits par judge.py sous CPython 3.12 : le portage doit rendre
// exactement les mêmes verdicts, au centième près.
const { textes, cas } = JSON.parse(fs.readFileSync(new URL('./fixtures/juge.json', import.meta.url), 'utf8'));

test('les verdicts de la version Python sont reproduits à l’identique', () => {
  let differents = 0;
  for (const [i, c] of cas.entries()) {
    const local = { ...c.qwen, text: textes[c.qwen.text] }, adverse = { ...c.claude, text: textes[c.claude.text] };
    const v = juger(local, adverse, { seul: c.noclaude, question: c.question });
    try { assert.deepEqual(v, c.verdict); } catch (e) { differents++; if (differents < 4) console.error(`cas ${i}`, JSON.stringify(v).slice(0, 400), '\nattendu', JSON.stringify(c.verdict).slice(0, 400)); }
  }
  assert.equal(differents, 0, `${differents} verdicts diffèrent sur ${cas.length}`);
});

test('arrondi au pair de la valeur binaire exacte, comme round() de Python', () => {
  const f = v => ({ v, entier: false });
  assert.equal(arrondi(f(9.625), 2).v, 9.62);
  assert.equal(arrondi(f(2.5), 0).v, 2);
  assert.equal(arrondi(f(3.5), 0).v, 4);
  assert.equal(arrondi(f(0.125), 2).v, 0.12);
  assert.equal(arrondi(f(0.375), 2).v, 0.38);
  assert.equal(arrondi(f(2.675), 2).v, 2.67, '2.675 vaut en réalité 2.67499…');
  assert.equal(arrondi(f(-2.5), 0).v, -2);
  assert.deepEqual(arrondi({ v: 8, entier: true }, 1), { v: 8, entier: true }, 'un entier reste un entier');
});

test('somme : préfixe entier exact, puis compensation des flottants', () => {
  assert.deepEqual(somme([{ v: 2, entier: true }, { v: 4, entier: true }]), { v: 6, entier: true });
  assert.equal(somme([{ v: 1e16, entier: false }, { v: 1, entier: false }, { v: -1e16, entier: false }]).v, 1);
});
