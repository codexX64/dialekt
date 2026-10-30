// Vitrine de DIALEKT pour le parcours du navigateur : faux Ollama, faux
// fournisseur et faux SYNAPSE locaux, une base neuve.
//   node outils/vitrine.mjs PORT [gamme]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { demarrer } from '../src/main.js';
import { fauxOllama, fauxFournisseur, fauxSynapse } from '../test/faux.js';

const [port = '8112', gamme = process.env.SOCLE_THEME || ''] = process.argv.slice(2);
const ollama = await fauxOllama(), kimi = await fauxFournisseur('openai'), syn = await fauxSynapse();
const jeton = 'jeton-installation-de-la-vitrine-dialekt';
await demarrer({
  PORT: port, HOTE: '127.0.0.1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'dialekt-vitrine-')),
  OLLAMA_URL: ollama.url, ADVERSAIRE: 'compatible', ADVERSAIRE_URL: kimi.url, ADVERSAIRE_CLE: 'cle-essai', ADVERSAIRE_NOM: 'Kimi', ADVERSAIRE_MODELE: 'kimi-k2-0905-preview',
  SYNAPSE_URL: syn.url, SYNAPSE_JETON: 'cer_dialekt_vitrine', SOCLE_JETON_INSTALLATION: jeton, SOCLE_HTTP: '0',
  ...(gamme ? { SOCLE_THEME: gamme } : {}),
}, { log: { info() {}, warn() {}, error() {} } });
console.log(`DIALEKT de démonstration sur http://localhost:${port} — JETON=${jeton}`);
