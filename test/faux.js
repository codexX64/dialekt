// Faux Ollama, faux fournisseurs (dialecte OpenAI et Anthropic), faux SYNAPSE :
// de vrais serveurs HTTP locaux, avec les formats de flux réels.
import http from 'node:http';

const LOCALE = ['Telnet transmet tout en clair, identifiants compris. ', 'SSH chiffre la session et authentifie le serveur par sa clé.\n', '- Telnet : port 23, obsolète\n- SSH : port 22, standard\n', 'Conclusion : désactive Telnet partout où il traîne encore sur le réseau.'];
const MATHS = ['La relation d’Euler : $e^{i\\pi} + 1 = 0$, et \\(a^2 + b^2 = c^2\\) pour Pythagore.\n', '$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n', 'Un prix de 5$ et 10$ reste du texte, ~~barré~~ compris, comme nom_de_variable.'];
const REPONSE = ['Le port 22 est ', 'SSH : chiffré, ', 'pour l’administration distante.\n```bash\nssh utilisateur@hote.example\n```\nÀ préférer à Telnet (port 23), qui circule en clair.'];

function serveur(gestion) {
  const s = http.createServer(async (req, res) => {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    const corps = morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString() || '{}') : {};
    gestion(req, res, corps);
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${s.address().port}`, fermer: () => new Promise(f => s.close(f)), s })));
}

export async function fauxOllama() {
  const recu = [];
  const f = await serveur((req, res, corps) => {
    recu.push({ chemin: req.url, corps });
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:14b' }, { name: 'nomic-embed-text' }] })); return; }
    if (req.url === '/api/chat' && corps.stream === false) { res.end(JSON.stringify({ message: { content: LOCALE.join('') }, eval_count: 42 })); return; }
    if (req.url === '/api/chat') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      const parties = /formule/i.test(corps.messages?.at(-1)?.content || '') ? MATHS : LOCALE;
      for (const p of parties) res.write(JSON.stringify({ message: { content: p }, done: false }) + '\n');
      res.end(JSON.stringify({ done: true, eval_count: 12 }) + '\n');
      return;
    }
    if (req.url === '/api/pull') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      if (corps.model === 'inexistant:1') { res.end(JSON.stringify({ error: 'pull model manifest: file does not exist' }) + '\n'); return; }
      res.write(JSON.stringify({ status: 'pulling manifest' }) + '\n');
      res.write(JSON.stringify({ status: 'downloading', total: 200, completed: 100 }) + '\n');
      res.end(JSON.stringify({ status: 'success' }) + '\n');
      return;
    }
    res.statusCode = 404; res.end('{}');
  });
  return { ...f, recu };
}

export async function fauxFournisseur(genre = 'openai', cle = 'cle-essai') {
  const recu = [];
  const f = await serveur((req, res, corps) => {
    recu.push({ chemin: req.url, modele: corps.model, max: corps.max_tokens, entetes: req.headers });
    const ok = genre === 'openai' ? req.headers.authorization === `Bearer ${cle}` : req.headers['x-api-key'] === cle;
    if (!ok) { res.writeHead(401); res.end('{"error":"bad key"}'); return; }
    if (req.method === 'GET') { res.end(JSON.stringify({ data: [{ id: 'kimi-k2-0905-preview' }, { id: 'moonshot-v1-8k' }, { id: 'text-embedding-3' }, { id: 'super-fable-x' }] })); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (genre === 'openai') {
      for (const p of REPONSE) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    } else {
      res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      for (const p of REPONSE) res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: p } })}\n\n`);
      res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    }
  });
  return { ...f, recu };
}

export async function fauxSynapse() {
  const evenements = [];
  const f = await serveur((req, res, corps) => {
    if (req.headers.authorization !== 'Bearer cer_oracle_essai') { res.writeHead(401); res.end('{}'); return; }
    evenements.push(...(corps.events || []));
    res.end('{"ok":true}');
  });
  return { ...f, evenements };
}

export function lireSse(texte) {
  return texte.split('\n\n').filter(b => b.startsWith('data: ')).map(b => JSON.parse(b.slice(6)));
}
