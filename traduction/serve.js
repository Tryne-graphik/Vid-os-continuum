// Service local de sous-titres FR : node serve.js  (port 8787, 127.0.0.1 seulement)
// GET /sub?v=<id YouTube>[&t=<seconde de l'épisode>] -> 200 .vtt complet | 206 .vtt partiel (blocs déjà prêts ; t = seconde à traduire en premier) | 202 démarré/en attente | 500 échec
// Le userscript appelle /sub?v=N au lancement de l'épisode N, et /sub?v=N+1 pour pré-traduire la suite.
// Clé : variable d'environnement DEEPSEEK_API_KEY (jamais écrite sur disque).
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const MAX_JOBS = 2, jobs = new Map(); // id -> { p, err }
const f = id => path.join(__dirname, id + '.fr.vtt');
// v7.24 : plafond mensuel (variable VC_PLAFOND_USD, 5 $ par defaut ; 0 = pas de plafond) : plus de NOUVELLE traduction au-dela ; les deja traduites restent servies
const CAP = process.env.VC_PLAFOND_USD === undefined ? 5 : Number(process.env.VC_PLAFOND_USD) || 0;
function usageMois() { // tarif deepseek-flash heures pleines, cache rate (borne haute) : 0,30 $ / M en entree, 1,20 $ / M en sortie
  let tokIn = 0, tokOut = 0; const mois = new Date().toISOString().slice(0, 7);
  try { for (const l of fs.readFileSync(path.join(__dirname, 'usage.log'), 'utf8').split(String.fromCharCode(10))) { if (!l) continue; const x = JSON.parse(l); if (x.m === mois) { tokIn += x.i; tokOut += x.o; } } } catch (e) {}
  return { tokIn, tokOut, usd: tokIn * 0.30 / 1e6 + tokOut * 1.20 / 1e6 };
}
process.on('uncaughtException', (e) => { console.error(new Date().toISOString(), e && e.stack || e); process.exit(1); }); // sortie redirigee vers serve.err.log par lanceur.ps1
function start(id, t) {
  if (jobs.has(id)) return;
  const p = spawn(process.execPath, [path.join(__dirname, 'traduire.js'), 'https://www.youtube.com/watch?v=' + id, '--moteur', 'deepseek', '--src', 'zh', '--start', String(t)], { env: process.env });
  const j = { p, err: '', t0: Date.now() }; jobs.set(id, j);
  p.stderr.on('data', d => j.err += d); p.stdout.on('data', d => j.err += d);
  p.on('close', c => { if (c === 0) jobs.delete(id); else { j.err = j.err.slice(-300); j.failed = true; setTimeout(() => jobs.delete(id), 600e3); } }); // échec mémorisé 10 min : pas de boucle payante
}
http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'), id = u.searchParams.get('v') || '';
  const h = { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' };
  // Durci (7.13.1) : pas de CORS ; Host exact + en-tête X-VC-Client (posé par GM_xmlhttpRequest, impossible pour une page web sans preflight) ; /stop en POST
  if (q.headers.host !== '127.0.0.1:8787') { r.writeHead(403, h); return r.end('host'); }
  if (q.headers['x-vc-client'] !== '1') { r.writeHead(403, h); return r.end('client'); }
  if (u.pathname === '/stop' && q.method !== 'POST') { r.writeHead(405, h); return r.end('POST requis'); }
  if (u.pathname === '/status') { // état pour le panneau du userscript : traductions en cours (bloc N/total, secondes écoulées)
    const list = [...jobs].map(([k, x]) => { const m = [...x.err.matchAll(/bloc (\d+)\/(\d+)/g)].pop(); return { id: k, done: m ? +m[1] : 0, total: m ? +m[2] : 0, sec: Math.round((Date.now() - x.t0) / 1000), failed: !!x.failed, err: x.failed ? x.err : '' }; });
    const usage = usageMois();
    h['Content-Type'] = 'application/json'; r.writeHead(200, h); return r.end(JSON.stringify({ apiVersion: 1, on: true, key: !!process.env.DEEPSEEK_API_KEY, jobs: list, usage: usage, cap: CAP }));
  }
  if (u.pathname === '/stop') { r.writeHead(200, h); r.end('stop'); for (const x of jobs.values()) x.p.kill(); return setTimeout(() => process.exit(0), 200); }
  if (u.pathname !== '/sub' || !/^[\w-]{11}$/.test(id)) { r.writeHead(400, h); return r.end('v invalide'); }
  if (fs.existsSync(f(id))) { r.writeHead(200, h); return r.end(fs.readFileSync(f(id))); }
  const j = jobs.get(id);
  if (j?.failed) { r.writeHead(500, h); return r.end(j.err); }
  if (!j) { if (!process.env.DEEPSEEK_API_KEY) { r.writeHead(500, h); return r.end('DEEPSEEK_API_KEY absente'); } if (CAP > 0 && usageMois().usd >= CAP) { r.writeHead(402, h); return r.end('plafond mensuel atteint'); } if (jobs.size >= MAX_JOBS) { r.writeHead(429, h); return r.end('trop de traductions en cours'); } start(id, Math.max(0, +u.searchParams.get('t') || 0)); }
  if (fs.existsSync(f(id) + '.part')) { r.writeHead(206, h); return r.end(fs.readFileSync(f(id) + '.part')); }
  r.writeHead(202, h); r.end('');
}).listen(8787, '127.0.0.1', () => console.log(new Date().toISOString(), 'Sous-titres FR : http://127.0.0.1:8787/sub?v=<id>' + (CAP > 0 ? ' (plafond ' + CAP + ' $/mois)' : '')));
