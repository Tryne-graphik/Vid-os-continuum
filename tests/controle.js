#!/usr/bin/env node
// Controle AVANT push (le push sur master met le script a jour chez tout le monde) : node tests/controle.js
// 1 build  2 syntaxe du .user.js et de serve.js  3 versions coherentes (@version = nouveautes = HISTORIQUE)
// 4 chaque GM_setValue('cle') est dans la sauvegarde OU dans la liste ci-dessous  5 tests unitaires.
// Code de sortie 1 au premier probleme. Usage conseille : node tests/controle.js && git push
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('ECHEC  ' + m); } else console.log('ok     ' + m); };
const run = (args) => { try { execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe' }); return ''; } catch (e) { return String(e.stderr || e.message).split('\n').slice(0, 6).join('\n'); } };

// 1-2
let r = run(['build.js']); ok(!r, 'build.js' + (r ? '\n' + r : ''));
const built = 'esprit-donghua-suivi-progression-v6.user.js';
r = run(['--check', built]); ok(!r, 'syntaxe de ' + built + (r ? '\n' + r : ''));
r = run(['--check', 'traduction/serve.js']); ok(!r, 'syntaxe de traduction/serve.js' + (r ? '\n' + r : ''));

// 3
const ver = (read('src/00-entete.js').match(/@version\s+(\d+\.\d+\.\d+)/) || [])[1];
const news = (read('src/22-nouveautes.js').match(/\[\s*'(\d+\.\d+\.\d+)'/) || [])[1];
const heads = [...read('HISTORIQUE.md').matchAll(/^## .*?(\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
ok(!!ver, '@version lue : ' + ver);
ok(news === ver, 'premiere entree des nouveautes (' + news + ') = @version (' + ver + ')');
ok(heads.length && heads[heads.length - 1] === ver, 'derniere section de HISTORIQUE.md (' + heads[heads.length - 1] + ') = @version (' + ver + ')');
ok(read(built).indexOf('@version      ' + ver) !== -1, 'le .user.js genere porte la version ' + ver);

// 4 : cles GM
const src = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js') && f[0] !== '_').map((f) => read('src/' + f)).join('\n');
const used = new Set([...src.matchAll(/GM_setValue\(\s*'([\w:-]+)'/g)].map((m) => m[1]));
const bk = read('src/12-sauvegarde.js');
const listOf = (name) => [...((bk.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];')) || [])[1] || '').matchAll(/'([\w:-]+)'/g)].map((m) => m[1]);
const saved = new Set(listOf('BACKUP_SETTINGS').concat(listOf('BACKUP_PREFS')));
// Donnees volontairement HORS sauvegarde : caches, etats techniques, marqueurs de version (a completer avec une raison)
// watchHistory : sauvegardee a part (ed-history-backup) ; ytSearchCache, ficheCache, odyseePlaylists : caches reconstruits ; pendingIntroOutroTransfer : etat transitoire ;
// lastAutoExport, odyseeDedupDone, lastSeenVersion, newsHiddenFor, panelMenu, panelCollapsed : marqueurs techniques / d'interface.
const NOT_SAVED = new Set(['watchHistory', 'ytSearchCache', 'ficheCache', 'odyseePlaylists', 'pendingIntroOutroTransfer', 'lastAutoExport', 'odyseeDedupDone', 'lastSeenVersion', 'newsHiddenFor', 'panelMenu', 'panelCollapsed']);
const missing = [...used].filter((k) => !saved.has(k) && !NOT_SAVED.has(k)).sort();
ok(missing.length === 0, 'chaque donnee GM est dans la sauvegarde ou dans NOT_SAVED' + (missing.length ? ' : manquent ' + missing.join(', ') : ''));

// 5
r = run(['tests/unit.js']); ok(!r, 'tests unitaires (tests/unit.js)' + (r ? '\n' + r : ''));

console.log(bad ? '\n' + bad + ' probleme(s) : NE PAS pousser' : '\ncontrole passe : on peut pousser (apres accord)');
process.exit(bad ? 1 : 0);
