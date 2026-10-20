// Configuration de DIALEKT, lue et validée une fois au démarrage. Les variables
// SOCLE_* (comptes, relais, clé maîtresse) sont lues par le socle lui-même.
import { lireConfig } from '../socle/src/index.js';

export const VERSION = '2.1.0';

// Le service s'appelait Oracle : un ancien .env (ORACLE_*) vaut encore, le nouveau nom l'emporte.
function avecAnciensNoms(env) {
  const out = { ...env };
  for (const [k, v] of Object.entries(env)) {
    const neuf = k.replace(/^ORACLE_/, 'DIALEKT_');
    if (neuf !== k && out[neuf] === undefined) out[neuf] = v;
  }
  return out;
}

export function lireConfigDialekt(env = process.env) {
  env = avecAnciensNoms(env);
  return lireConfig({
    port: { env: 'PORT', type: 'entier', min: 0, max: 65535, defaut: 8112 },
    hote: { env: 'HOTE', type: 'chaine', defaut: '0.0.0.0' },
    donnees: { env: 'DATA_DIR', type: 'chaine', defaut: '/app/data' },
    ollamaUrl: { env: 'OLLAMA_URL', type: 'url', defaut: 'http://127.0.0.1:11434' },
    ollamaModele: { env: 'OLLAMA_MODEL', type: 'chaine', motif: /^[\w.:\-/]{1,120}$/, defaut: 'qwen3:14b' },
    adversaire: { env: 'ADVERSAIRE', type: 'chaine', motif: /^[a-z-]{1,40}$/ },
    adversaireCle: { env: 'ADVERSAIRE_CLE', type: 'chaine' },
    adversaireModele: { env: 'ADVERSAIRE_MODELE', type: 'chaine' },
    adversaireUrl: { env: 'ADVERSAIRE_URL', type: 'url', schemas: ['https:', 'http:'] },
    adversaireNom: { env: 'ADVERSAIRE_NOM', type: 'chaine', motif: /^.{1,40}$/ },
    // Noms hérités de la version 1, encore lus pour les anciens .env.
    claudeMode: { env: 'CLAUDE_MODE', type: 'choix', parmi: ['cli', 'api'], defaut: 'cli' },
    anthropicCle: { env: 'ANTHROPIC_API_KEY', type: 'chaine' },
    claudeModele: { env: 'CLAUDE_MODEL', type: 'chaine' },
    claudeBin: { env: 'CLAUDE_BIN', type: 'chaine', defaut: 'claude' },
    claudeJeton: { env: 'CLAUDE_CODE_OAUTH_TOKEN', type: 'chaine' },
    memoireUrl: { env: 'MEMORY_URL', type: 'url' },
    memoireCle: { env: 'MEMORY_API_KEY', type: 'chaine' },
    jetonHub: { env: 'DIALEKT_HUB_TOKEN', type: 'secret', min: 24 },
    synapseUrl: { env: 'SYNAPSE_URL', type: 'url' },
    synapseJeton: { env: 'SYNAPSE_JETON', type: 'chaine' },
    rechercheWeb: { env: 'DIALEKT_RECHERCHE_WEB', type: 'booleen', defaut: true },
    // Plafonds de dépense (SEC-LLM-002) : l'adversaire se paie à l'appel.
    duelsJour: { env: 'DIALEKT_DUELS_JOUR', type: 'entier', min: 1, max: 100000, defaut: 200 },
    duelsMinute: { env: 'DIALEKT_DUELS_MINUTE', type: 'entier', min: 1, max: 600, defaut: 6 },
    jetonsMax: { env: 'DIALEKT_JETONS_MAX', type: 'entier', min: 64, max: 32768, defaut: 8192 },
  }, env);
}
