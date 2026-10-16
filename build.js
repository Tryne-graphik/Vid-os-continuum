// Assemble le userscript : src/*.js (ordre des noms) + CSS (css/base.css, css/agencements/*.css, css/themes/*.css)
// injecte a la place du marqueur /*@@VC_CSS@@*/'' (voir src/14-sections.js). Usage : node build.js
// Ne jamais modifier le .user.js a la main : il est regenere ici.
const fs = require('fs'), path = require('path');
const root = __dirname;
const out = path.join(root, 'esprit-donghua-suivi-progression-v6.user.js');
const list = (d) => fs.readdirSync(path.join(root, d)).filter((f) => !f.startsWith('_')).sort().map((f) => path.join(d, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const cssFiles = ['css/base.css'].concat(list('css/agencements'), list('css/themes'));
// commentaires et blancs retires : le CSS part dans une chaine JS.
const css = cssFiles.map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
const js = list('src').filter((f) => f.endsWith('.js')).map(read).join('');
const MARK = "/*@@VC_CSS@@*/''";
if (js.split(MARK).length !== 2) throw new Error('marqueur ' + MARK + ' absent ou en double');
fs.writeFileSync(out, js.replace(MARK, () => JSON.stringify(css)));
console.log('build : ' + list('src').length + ' morceaux JS + ' + cssFiles.length + ' CSS (' + Math.round(css.length / 1024) + ' Ko) -> ' + path.basename(out));
