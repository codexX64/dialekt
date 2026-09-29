// Parcours réel d'Oracle dans Chromium (clé d'accès virtuelle) et contrôle de
// mise en page à chaque largeur. Usage :
//   node outils/parcours-navigateur.mjs http://localhost:8112 JETON DOSSIER
import { chromium } from 'playwright';
import fs from 'node:fs';
import { chevauchements, LARGEURS } from '../socle/essai/mise-en-page.mjs';

const [base, jeton, sortie = '/tmp/captures-oracle'] = process.argv.slice(2);
fs.mkdirSync(sortie, { recursive: true });
const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 860 } });
const page = await contexte.newPage();
const erreurs = [];
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
page.on('pageerror', e => erreurs.push(String(e)));
const cdp = await contexte.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

const rapport = [];
async function controle(nom, { attendre = 250, avant } = {}) {
  for (const w of LARGEURS) {
    await page.setViewportSize({ width: w, height: w < 500 ? 780 : 900 });
    await page.waitForTimeout(attendre);
    if (avant) { await page.evaluate(avant); await page.waitForTimeout(100); }
    rapport.push({ ecran: nom, largeur: w, defauts: await page.evaluate(chevauchements) });
    if ([360, 768, 1280, 1920].includes(w)) await page.screenshot({ path: `${sortie}/${nom}-${w}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 860 });
}

await page.goto(base);
await page.getByLabel('Jeton d’installation').fill(jeton);
await page.getByLabel('Identifiant').fill('ana');
await page.getByLabel('Mot de passe').fill('phrase de passe pour oracle en local');
await page.getByRole('button', { name: 'Créer le compte' }).click();
await page.getByRole('button', { name: /Créer la clé maintenant/ }).click();
await page.getByText('J’ai rangé ces codes en lieu sûr.').click();
await page.getByRole('button', { name: 'Terminer' }).click();
await page.locator('.salle').waitFor();
await controle('accueil-duel');

await page.getByLabel('Question').fill('Explique la différence entre SSH et Telnet, avec un exemple de commande.');
await page.getByRole('button', { name: 'Envoyer' }).click();
await page.locator('.verdict:not([hidden])').waitFor({ timeout: 20000 });
await page.waitForTimeout(400);
await controle('duel-verdict');

await page.getByLabel('Question').fill('Et en mode local seul, résume la même chose en trois points.');
await page.getByRole('radio', { name: 'Local seul' }).click();
await page.getByRole('button', { name: 'Envoyer' }).click();
await page.waitForFunction(() => document.querySelectorAll('.echange').length === 2 && !document.querySelector('.attente'));
await page.waitForTimeout(400);
await controle('duel-deux-echanges');

await page.getByLabel('Question').fill('Donne une formule célèbre, puis une intégrale simple.');
await page.getByRole('button', { name: 'Envoyer' }).click();
await page.waitForFunction(() => document.querySelectorAll('.echange').length === 3 && !document.querySelector('.attente'));
await page.waitForFunction(() => document.querySelectorAll('.echange:last-child .math math').length === 3, null, { timeout: 10000 });
const formules = await page.evaluate(() => {
  const d = document.querySelector('.echange:last-child .md');
  return { maths: d.querySelectorAll('.math math').length, bloc: !!d.querySelector('.math-d math[display="block"]'), barre: d.querySelector('del')?.textContent, prix: d.textContent.includes('5$ et 10$'), variable: d.textContent.includes('nom_de_variable'), styles: d.querySelectorAll('[style]').length };
});
if (formules.maths !== 3 || !formules.bloc || formules.barre !== 'barré' || !formules.prix || !formules.variable) erreurs.push('formules : ' + JSON.stringify(formules));
await controle('formules', { avant: () => { const f = document.querySelector('.fil'); f.scrollTop = f.scrollHeight; } });

const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter', exact: true }).click()]);
const exporte = fs.readFileSync(await telechargement.path(), 'utf8');
if (!/^# Explique/.test(exporte) || (exporte.match(/^## /gm) || []).length !== 3 || !exporte.includes('\\frac{1}{3}') || !/\.md$/.test(telechargement.suggestedFilename())) erreurs.push('export : ' + telechargement.suggestedFilename() + ' ' + exporte.slice(0, 120));

await page.setViewportSize({ width: 360, height: 780 });
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Actions de la conversation' }).click();
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(400);
rapport.push({ ecran: 'feuille', largeur: 360, defauts: await page.evaluate(chevauchements) });
await page.screenshot({ path: `${sortie}/feuille-360.png` });
await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
await page.setViewportSize({ width: 1280, height: 860 });

await page.getByRole('button', { name: 'Statistiques', exact: true }).click();
await page.getByRole('heading', { name: 'Statistiques', exact: true }).waitFor();
await controle('stats');
await page.getByRole('button', { name: 'Réglages', exact: true }).click();
await page.getByRole('heading', { name: 'Réglages', exact: true }).waitFor();
await controle('reglages');
await page.getByRole('button', { name: 'Duel', exact: true }).click();
await page.locator('.salle').waitFor();
await page.getByRole('button', { name: 'Ranger', exact: true }).click();
await page.getByRole('dialog').locator('select').selectOption('+');
await page.getByLabel('Nom du projet').fill('Réseau et sécurité du laboratoire');
await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/conversation/') && r.request().method() === 'PATCH'),
  page.getByRole('dialog').getByRole('button', { name: 'Ranger' }).click(),
]);
await page.getByRole('button', { name: 'Conversations', exact: true }).click();
await page.getByRole('heading', { name: 'Conversations', exact: true }).waitFor();
await page.locator('.ligne-choix', { hasText: 'Réseau et sécurité' }).click();
await page.getByText('filtre actif').waitFor();
await controle('conversations');
await page.getByRole('button', { name: 'Sécurité', exact: true }).click();
await page.getByRole('heading', { name: 'Sécurité', exact: true }).waitFor();
await controle('securite');

const defauts = rapport.filter(r => r.defauts.length);
fs.writeFileSync(`${sortie}/rapport.json`, JSON.stringify({ rapport, erreurs }, null, 2));
console.log(`écrans×largeurs contrôlés : ${rapport.length}, avec défauts : ${defauts.length}, erreurs console : ${erreurs.length}`);
for (const r of defauts) for (const d of r.defauts.slice(0, 5)) console.log(`  ${r.ecran} @${r.largeur} — ${d.type} : ${d.detail}`);
for (const e of erreurs) console.log('  console :', e);
await navigateur.close();
process.exit(defauts.length || erreurs.length ? 1 : 0);
