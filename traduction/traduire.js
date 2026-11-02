// Prototype : sous-titres YouTube (yt-dlp) -> traduction FR par Ollama -> .vtt
// Usage : node traduire.js <url> [--moteur ollama|deepseek] [--model m] [--glossaire g.txt] [--src en] [--max 0]
// --moteur deepseek : clé dans la variable d'environnement DEEPSEEK_API_KEY (modèle par défaut deepseek-flash, blocs de 60)
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const a = process.argv.slice(2);
const url = a.find(x => !x.startsWith('--'));
const opt = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : a[i + 1]; };
const DS = opt('moteur', 'ollama') === 'deepseek';
const MODEL = opt('model', DS ? 'deepseek-flash' : 'gemma4:26b'), MAX = +opt('max', 0), BATCH = DS ? 60 : 40, START = +opt('start', 0) * 1000, CONC = +opt('conc', DS ? 4 : 1); // --start s : traduit d'abord le bloc qui contient cette seconde ; --conc : blocs en parallèle
if (DS && !process.env.DEEPSEEK_API_KEY) { console.error('DEEPSEEK_API_KEY absente de l environnement'); process.exit(1); }
if (!url) { console.error('usage: node traduire.js <url> [--moteur ollama|deepseek] [--model m] [--glossaire f] [--src lang] [--max N]'); process.exit(1); }
const gf = opt('glossaire', fs.existsSync(path.join(__dirname, 'glossaire.txt')) ? path.join(__dirname, 'glossaire.txt') : ''); // glossaire.txt à côté du script par défaut
const glossaire = gf ? fs.readFileSync(gf, 'utf8').trim() : '';
const yt = (...args) => execFileSync('yt-dlp', ['--ignore-no-formats-error', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

// 1. choix de la piste source : manuelle d'abord, sinon automatique ; zh/en/ja/ko, pas fr
const info = JSON.parse(yt('-J', '--skip-download', url));
const pick = (obj) => { const k = Object.keys(obj || {}); const want = opt('src'); return want ? k.find(x => x === want || x.startsWith(want + '-')) : ['en', 'zh-Hans', 'zh', 'zh-Hant', 'ja', 'ko'].map(l => k.find(x => x === l || x.startsWith(l))).find(Boolean); };
let lang = pick(info.subtitles), auto = false;
if (!lang) { lang = pick(info.automatic_captions); auto = true; }
if (!lang) { console.error('Aucune piste source. Manuelles :', Object.keys(info.subtitles || {}), '| auto (extrait) :', Object.keys(info.automatic_captions || {}).slice(0, 10)); process.exit(2); }
console.log(`Piste source : ${lang} (${auto ? 'automatique' : 'manuelle'}) - ${info.title}`);

// 2. téléchargement json3 (plus propre que vtt : pas de lignes qui défilent)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vct-'));
yt('--skip-download', auto ? '--write-auto-subs' : '--write-subs', '--sub-langs', lang, '--sub-format', 'json3', '-o', path.join(tmp, 'v'), url);
const f = fs.readdirSync(tmp).find(x => x.endsWith('.json3'));
const ev = JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8')).events || [];
let cues = ev.filter(e => e.segs).map(e => ({ s: e.tStartMs, e: e.tStartMs + (e.dDurationMs || 2000), t: e.segs.map(g => g.utf8).join('').replace(/\s+/g, ' ').trim() })).filter(c => c.t);
cues.forEach((c, i) => { if (cues[i + 1] && c.e > cues[i + 1].s) c.e = cues[i + 1].s; }); // pas de chevauchement
if (MAX) cues = cues.slice(0, MAX);
console.log(`${cues.length} répliques, modèle ${MODEL}`);

// 3. traduction par blocs numérotés
async function ollama(prompt) { // stream : les en-têtes arrivent tout de suite, même si le modèle met des minutes à charger
  const r = await fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: MODEL, prompt, stream: true, think: false, options: { temperature: 0.2, num_ctx: 8192 } }) });
  if (!r.ok) throw new Error('Ollama ' + r.status);
  let txt = '', buf = '';
  for await (const ch of r.body) { buf += Buffer.from(ch).toString('utf8'); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) txt += JSON.parse(l).response || ''; } }
  return txt;
}
async function deepseek(prompt) { // max_tokens large : le modèle "réfléchit" avant de répondre (8192 = réponse vide)
  const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 32000, temperature: 0.2 }) });
  if (!r.ok) throw new Error('DeepSeek ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json(); // journal des tokens (usage.log) lu par serve.js pour le coût du mois
  try { fs.appendFileSync(path.join(__dirname, 'usage.log'), JSON.stringify({ m: new Date().toISOString().slice(0, 7), i: j.usage?.prompt_tokens || 0, o: j.usage?.completion_tokens || 0 }) + String.fromCharCode(10)); } catch (e) {}
  return j.choices[0].message.content || '';
}
const sys = `Tu traduis des sous-titres de donghua/anime (${lang}) en français naturel, comme un fansub soigné : tutoiement, phrases courtes, registre oral, pas de mot à mot.
Règles : garde exactement la numérotation "N| texte", une ligne par réplique, aucune ligne ajoutée ou supprimée, pas de commentaire. Les sous-titres automatiques contiennent des erreurs de reconnaissance : corrige ce qui est évident d'après le contexte. Les noms propres gardent leur forme cohérente d'une réplique à l'autre.${glossaire ? '\nGlossaire (source = traduction imposée) :\n' + glossaire : ''}`;
async function bloc(b, off) {
  const ctx = cues.slice(Math.max(0, off - 3), off).map(c => c.t).join(' / ');
  const prompt = `${sys}\n${ctx ? `Contexte précédent (ne pas traduire) : ${ctx}\n` : ''}\nRéplique à traduire :\n${b.map((c, i) => `${i + 1}| ${c.t}`).join('\n')}`;
  for (let essai = 0; essai < 3; essai++) {
    const out = {};
    for (const l of (await (DS ? deepseek : ollama)(prompt)).split('\n')) { const m = l.match(/^\s*(\d+)\s*\|\s*(.+)$/); if (m) out[+m[1]] = m[2].trim(); }
    if (b.every((_, i) => out[i + 1])) return b.map((_, i) => out[i + 1]);
    console.log(`  bloc ${off}: lignes manquantes, nouvel essai`);
  }
  return b.map(c => c.t); // repli : texte source
}
const fr = new Array(cues.length);
const ts = ms => new Date(ms).toISOString().slice(11, 23);
const vtt = () => 'WEBVTT\n\n' + cues.map((c, i) => fr[i] && `${ts(c.s)} --> ${ts(c.e)}\n${fr[i]}\n`).filter(Boolean).join('\n');
const out = path.join(__dirname, `${info.id}.fr.vtt`);
(async () => {
const starts = []; for (let i = 0; i < cues.length; i += BATCH) starts.push(i);
const k = Math.max(0, starts.findIndex(i => cues[Math.min(i + BATCH, cues.length) - 1].e > START)); // 1er bloc à traduire = celui de --start, puis la suite, puis le début
const order = [...starts.slice(k), ...starts.slice(0, k)];
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < order.length) {
  const i = order[next++]; (await bloc(cues.slice(i, i + BATCH), i)).forEach((t, j) => fr[i + j] = t);
  console.log(`  bloc ${++done}/${order.length}`); fs.writeFileSync(out + '.part', vtt()); // .part lu par serve.js : blocs déjà prêts (pas forcément contigus)
} }));

// 4. ecriture du .vtt final
fs.writeFileSync(out, vtt()); fs.rmSync(out + '.part', { force: true });
fs.writeFileSync(path.join(__dirname, `${info.id}.src.txt`), cues.map((c, i) => `${c.t}\n  -> ${fr[i]}`).join('\n'));
console.log('Écrit :', out);
})().catch(e => { console.error(e.message); process.exit(1); });
