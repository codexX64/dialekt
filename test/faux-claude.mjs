#!/usr/bin/env node
// Faux binaire « claude » : consigne ce qu'il reçoit, puis répond en stream-json.
import fs from 'node:fs';
let entree = '';
for await (const m of process.stdin) entree += m;
fs.writeFileSync(process.env.HOME + '/../claude-appel.json', JSON.stringify({ argv: process.argv.slice(2), entree, env: Object.keys(process.env).sort(), cwd: process.cwd(), fichiers: fs.readdirSync(process.cwd()) }));
const ecrire = o => process.stdout.write(JSON.stringify(o) + '\n');
ecrire({ type: 'system', subtype: 'init', tools: [] });
for (const t of ['Réponse de Claude : ', 'SSH chiffre, Telnet non.\n```sh\nssh a@b.example\n```']) ecrire({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } });
ecrire({ type: 'result', is_error: false, result: 'ok' });
