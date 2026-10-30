// Configuration de DIALEKT, lue et validée une fois au démarrage. Les variables
// SOCLE_* (comptes, relais, clé maîtresse) sont lues par le socle lui-même.
import { lireConfig } from '../socle/src/index.js';

export const VERSION = '2.3.0';

// Le service s'appelait Oracle : un ancien .env (ORACLE_*) vaut encore, le nouveau nom l'emporte.
function avecAnciensNoms(env) {
  const out = { ...env };
  for (const [k, v] of Object.entries(env)) {
    const neuf = k.replace(/^ORACLE_/, 'DIALEKT_');
    if (neuf !== k && out[neuf] === undefined) out[neuf] = v;
  }
  return out;
}

export const SPEC_DIALEKT = {
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
};

// Ce que l'assistant de configuration demande (première installation, puis
// seulement les réglages nouveaux d'une mise à jour). depuis : la version qui
// a ajouté le réglage.
export const REGLAGES_DIALEKT = [
  { env: 'OLLAMA_URL', groupe: 'IA locale', libelle: 'Adresse d’Ollama', exemple: 'http://ollama:11434', depuis: '2.3.0', aide: 'Le modèle local qui débat.' },
  { env: 'OLLAMA_MODEL', groupe: 'IA locale', libelle: 'Modèle local', exemple: 'qwen3:14b', depuis: '2.3.0' },
  { env: 'ADVERSAIRE', groupe: 'Adversaire', libelle: 'Fournisseur de l’adversaire', exemple: 'claude-api', depuis: '2.3.0', aide: 'Le modèle qui lui répond : claude-code, claude-api, openai, kimi, mistral, deepseek, gemini, groq, openrouter ou compatible.' },
  { env: 'ADVERSAIRE_MODELE', groupe: 'Adversaire', libelle: 'Modèle de l’adversaire', depuis: '2.3.0' },
  { env: 'ADVERSAIRE_CLE', groupe: 'Adversaire', libelle: 'Clé d’API de l’adversaire', secret: true, depuis: '2.3.0' },
  { env: 'ADVERSAIRE_URL', groupe: 'Adversaire', libelle: 'Adresse de l’API (compatible OpenAI)', depuis: '2.3.0', avance: true },
  { env: 'ADVERSAIRE_NOM', groupe: 'Adversaire', libelle: 'Nom affiché de l’adversaire', depuis: '2.3.0', avance: true },
  { env: 'DIALEKT_RECHERCHE_WEB', groupe: 'Débats', libelle: 'Recherche sur le web pendant un duel', depuis: '2.3.0' },
  { env: 'DIALEKT_DUELS_JOUR', groupe: 'Débats', libelle: 'Duels par jour au plus', depuis: '2.3.0', avance: true },
  { env: 'DIALEKT_DUELS_MINUTE', groupe: 'Débats', libelle: 'Duels par minute au plus', depuis: '2.3.0', avance: true },
  { env: 'DIALEKT_JETONS_MAX', groupe: 'Débats', libelle: 'Jetons par réponse au plus', depuis: '2.3.0', avance: true },
];

export function lireConfigDialekt(env = process.env) {
  env = avecAnciensNoms(env);
  return lireConfig(SPEC_DIALEKT, env);
}
