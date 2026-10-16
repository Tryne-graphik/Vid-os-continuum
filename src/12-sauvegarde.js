        // ---- Export / import (identique dans l'esprit a v4, "site" en plus) ----

        function buildHtml() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => progress[k]).filter((e) => !excluded[storageKey(e)] && !excluded[e.seriesUrl]);
            entries.sort((a, b) => (a.siteLabel || '').localeCompare(b.siteLabel || '') || a.seriesName.localeCompare(b.seriesName));
            let items;
            if (entries.length === 0) {
                items = '<p>Aucun anime suivi pour le moment.</p>';
            } else {
                items = '<ul>';
                let currentSite = null;
                entries.forEach((e) => {
                    if (e.siteLabel !== currentSite) { items += '</ul><h2>' + escapeHtml(e.siteLabel || 'Site inconnu') + '</h2><ul>'; currentSite = e.siteLabel; }
                    items += '<li><strong>' + escapeHtml(e.seriesName) + '</strong> - ' + escapeHtml(e.episodeLabel) +
                        ' - <a href="' + escapeHtml(e.episodeUrl) + '">Reprendre ici</a>' +
                        ' <span style="color:#888;font-size:12px;">(' + formatDate(e.watchedAt) + ')</span></li>';
                });
                items += '</ul>';
            }
            const dataBlock = '<script type="application/json" id="ed-progress-backup">' +
                // v7.0 : toutes les entrees, exclues comprises (excludedSeries est
                // sauvegarde : sans l'entree, l'episode memorise etait perdu).
                JSON.stringify(Object.keys(progress).map((k) => progress[k])).replace(/</g, '\\u003c') + '</' + 'script>' +
                '<script type="application/json" id="ed-history-backup">' +
                JSON.stringify(Object.keys(loadHistory()).map((k) => loadHistory()[k])).replace(/</g, '\\u003c') + '</' + 'script>' +
                '<script type="application/json" id="ed-settings-backup">' +
                JSON.stringify(collectBackupSettings()).replace(/</g, '\\u003c') + '</' + 'script>';
            return '<!doctype html><html><head><meta charset="utf-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>Ma progression - Vidéo Continuum</title>' +
                '<style>body{font-family:Arial,sans-serif;background:#0d0d12;color:#eee;padding:20px;} a{color:#03d0fc;} li{margin-bottom:12px;font-size:15px;} h2{color:#03d0fc;font-size:16px;border-bottom:1px solid #333;padding-bottom:4px;}</style>' +
                '</head><body><h1>Ma progression - Vidéo Continuum</h1>' + items + dataBlock + '</body></html>';
        }

        function downloadHtml(filename) {
            const blob = new Blob([buildHtml()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        }

        const realWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        function isFileSystemAccessSupported() { return typeof realWindow.showSaveFilePicker === 'function'; }

        function idbOpen() {
            return new Promise((resolve, reject) => {
                const req = realWindow.indexedDB.open('animeTrackerV6', 1);
                req.onupgradeneeded = () => { req.result.createObjectStore('handles'); };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        function idbGetHandle(key) {
            return idbOpen().then((db) => new Promise((resolve, reject) => {
                const tx = db.transaction('handles', 'readonly');
                const req = tx.objectStore('handles').get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            }));
        }
        function idbSetHandle(key, handle) {
            return idbOpen().then((db) => new Promise((resolve, reject) => {
                const tx = db.transaction('handles', 'readwrite');
                tx.objectStore('handles').put(handle, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }));
        }

        let backupFileHandle = null;
        function updateBackupStatusUi() {
            const text = backupFileHandle ? ('Sauvegarde liee : ' + backupFileHandle.name) : 'Sauvegarde : telechargement classique';
            const el = document.getElementById('ep-backup-status');
            if (el) el.textContent = text;
            if (overlayEls && overlayEls.backupStatusEl) overlayEls.backupStatusEl.textContent = text;
        }
        function loadBackupFileHandle() {
            if (!isFileSystemAccessSupported()) return Promise.resolve();
            return idbGetHandle('backupFile').then((handle) => {
                backupFileHandle = handle || null;
                updateBackupStatusUi();
            }).catch((e) => console.log('[AnimeTracker v6] impossible de relire le fichier de sauvegarde lie', e));
        }
        function chooseBackupFile() {
            if (!isFileSystemAccessSupported()) {
                alert('Ton navigateur ne supporte pas la sauvegarde directe dans un dossier (File System Access API, dispo sur Chrome/Edge).');
                return;
            }
            realWindow.showSaveFilePicker({
                suggestedName: 'ma-progression-anime-tracker.html',
                types: [{ description: 'Page HTML', accept: { 'text/html': ['.html'] } }]
            }).then((handle) => {
                backupFileHandle = handle;
                return idbSetHandle('backupFile', handle);
            }).then(() => { updateBackupStatusUi(); return writeBackupFile(); }).catch((e) => {
                if (e && e.name === 'AbortError') return;
                alert('Impossible de configurer le fichier de sauvegarde : ' + e.message);
            });
        }
        function ensureBackupPermission(handle) {
            return handle.queryPermission({ mode: 'readwrite' }).then((state) => {
                if (state === 'granted') return true;
                return handle.requestPermission({ mode: 'readwrite' }).then((res) => res === 'granted');
            });
        }
        function reauthorizeBackupFile() {
            if (!backupFileHandle) { alert('Aucun fichier de sauvegarde lie - utilise "Choisir fichier sauvegarde" d\'abord.'); return; }
            ensureBackupPermission(backupFileHandle).then((ok) => {
                alert(ok ? ('Acces reautorise pour "' + backupFileHandle.name + '".') : 'Permission refusee.');
                updateBackupStatusUi();
            });
        }
        function writeBackupFile() {
            if (!backupFileHandle) return Promise.resolve(false);
            return ensureBackupPermission(backupFileHandle).then((ok) => {
                if (!ok) throw new Error('permission refusee');
                return backupFileHandle.createWritable();
            }).then((writable) => writable.write(buildHtml()).then(() => writable.close())).then(() => true).catch((e) => {
                console.log('[AnimeTracker v6] echec ecriture fichier lie, repli sur telechargement', e);
                return false;
            });
        }
        function saveProgressBackup() {
            return writeBackupFile().then((wrote) => { if (!wrote) downloadHtml('ma-progression-anime-tracker.html'); });
        }
        function exportProgress() { saveProgressBackup(); }
        function maybeAutoExport() {
            if (Object.keys(loadProgress()).length === 0) return;
            const today = new Date().toISOString().slice(0, 10);
            if (GM_getValue('lastAutoExport', null) === today) return;
            saveProgressBackup();
            GM_setValue('lastAutoExport', today);
        }

        function parseFrenchDateToIso(text) {
            const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})[^\d]+(\d{2}):(\d{2}):(\d{2})/);
            if (!m) return null;
            const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
            return isNaN(d.getTime()) ? null : d.toISOString();
        }
        function parseProgressBackup(html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const dataEl = doc.getElementById('ed-progress-backup');
            if (dataEl) {
                try {
                    const entries = JSON.parse(dataEl.textContent);
                    if (Array.isArray(entries)) return entries;
                } catch (e) { console.log('[AnimeTracker v6] bloc JSON illisible, repli sur le parsing HTML', e); }
            }
            // Repli pour un export v4 (esprit-donghua uniquement, pas de champ "site").
            const items = Array.from(doc.querySelectorAll('li'));
            return items.map((li) => {
                const strong = li.querySelector('strong');
                const link = li.querySelector('a[href]');
                const dateSpan = li.querySelector('span');
                if (!strong || !link) return null;
                const seriesName = strong.textContent.trim();
                const fullText = li.textContent;
                const afterSeries = fullText.slice(fullText.indexOf(seriesName) + seriesName.length).replace(/^\s*-\s*/, '');
                const episodeLabel = afterSeries.split(' - Reprendre ici')[0].trim();
                return {
                    site: 'esprit-donghua', siteLabel: 'Esprit Donghua', siteTag: 'ED',
                    seriesName: seriesName, episodeLabel: episodeLabel, episodeUrl: link.getAttribute('href'),
                    seriesUrl: 'legacy:' + seriesName, episodeNumber: null,
                    watchedAt: dateSpan ? parseFrenchDateToIso(dateSpan.textContent) : null
                };
            }).filter(Boolean);
        }
        // Sauvegarde complete (v6.50) : etats de suivi, intro/outro, YouTube,
        // sites ajoutes, reprises, liens AniList + preferences. Pas les caches.
        const BACKUP_SETTINGS = ['excludedSeries', 'dislikedSeries', 'seenSeries', 'seasonDone', 'newSeasons', 'seasonDismissed', 'introOutro', 'customSites',
            'youtubeChannelAssociations', 'youtubeMode', 'youtubeOverrides', 'resumePositions', 'aniLinks'];
        const BACKUP_PREFS = ['autoNextEnabled', 'popupAutoOpen', 'openMode', 'panelSiteFilter2', 'aniskipShown', 'theme', 'panelLayout', 'panelAutoHide', 'panelHidden',
            'accentColor', 'accentTarget', 'fontFamily', 'titleCinzel', 'dimTracked'];
        function collectBackupSettings() {
            const out = {};
            BACKUP_SETTINGS.concat(BACKUP_PREFS).forEach((k) => { const v = GM_getValue(k, undefined); if (v !== undefined) out[k] = v; });
            return out;
        }
        // Fichier de sauvegarde = donnee non fiable : types simples seulement,
        // tailles bornees, pas d'adresse autre que https (iframe, liens).
        function cleanBackupValue(v, depth) {
            if (typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) return v;
            // v7.0 : seuls les schemas dangereux sont rejetes ("Re:Zero" ou
            // "Overlord: S4" etaient effaces, marques Pas aime/Deja vu perdues).
            if (typeof v === 'string') return v.length > 2000 || /^\s*(javascript|data|vbscript|file|blob)\s*:/i.test(v) ? undefined : v;
            if (!v || typeof v !== 'object' || depth > 3) return undefined;
            const out = Array.isArray(v) ? [] : {};
            Object.keys(v).slice(0, 5000).forEach((k) => {
                if (k.length > 1000 || k === '__proto__' || k === 'constructor' || k === 'prototype') return;
                const c = cleanBackupValue(v[k], depth + 1);
                if (c !== undefined) { if (Array.isArray(out)) out.push(c); else out[k] = c; }
            });
            return out;
        }
        function mergeImportedSettings(html) {
            const el = new DOMParser().parseFromString(html, 'text/html').getElementById('ed-settings-backup');
            let data = null;
            try { data = el ? JSON.parse(el.textContent) : null; } catch (e) { data = null; }
            if (!data || typeof data !== 'object' || Array.isArray(data)) return 0;
            let restored = 0;
            BACKUP_SETTINGS.forEach((k) => {
                let v = cleanBackupValue(data[k], 0);
                if (!v || typeof v !== 'object' || Array.isArray(v)) return;
                if (k === 'customSites') v = Object.fromEntries(Object.entries(v).filter(([h]) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(h)));
                if (k === 'youtubeOverrides') v = Object.fromEntries(Object.entries(v).filter(([, u]) => /^https:\/\/(www\.)?youtube(-nocookie)?\.com\//i.test(u)));
                // Fusion : les reglages deja presents ici gagnent.
                GM_setValue(k, Object.assign({}, v, GM_getValue(k, {})));
                restored++;
            });
            BACKUP_PREFS.forEach((k) => {
                const v = data[k];
                if (GM_getValue(k, undefined) === undefined && validImportedPref(k, v)) { GM_setValue(k, v); restored++; }
            });
            // Sites ajoutes restaures : connus tout de suite (sinon leurs animes seraient ignores ci-apres).
            Object.keys(loadCustomSites()).forEach((h) => { if (!SITES.some((x) => x.id === 'custom:' + h)) SITES.push(makeGenericSite(h)); });
            return restored;
        }
        // Type attendu par preference (recette 6.58 : "oui" texte activait le panneau discret).
        function validImportedPref(k, v) {
            if (['autoNextEnabled', 'popupAutoOpen', 'aniskipShown', 'panelAutoHide', 'panelHidden', 'titleCinzel', 'dimTracked'].includes(k)) return typeof v === 'boolean';
            if (k === 'theme') return typeof v === 'string' && Object.prototype.hasOwnProperty.call(themes(), v);
            if (k === 'panelLayout') return typeof v === 'string' && Object.prototype.hasOwnProperty.call(layouts(), v);
            if (k === 'accentColor') return typeof v === 'string' && /^(#[0-9a-f]{6})?$/i.test(v);
            if (k === 'accentTarget') return Object.prototype.hasOwnProperty.call(accentTargets(), v);
            if (k === 'fontFamily') return typeof v === 'string' && Object.prototype.hasOwnProperty.call(vcFonts(), v);
            if (k === 'openMode') return OPEN_MODES.some((m) => m[0] === v);
            return typeof v === 'string' && v.length <= 50;
        }
        function mergeImportedHistory(html) {
            const el = new DOMParser().parseFromString(html, 'text/html').getElementById('ed-history-backup');
            let list = [];
            try { list = el ? JSON.parse(el.textContent) : []; } catch (e) { list = []; }
            if (!Array.isArray(list) || !list.length) return;
            const h = loadHistory();
            list.forEach((raw) => {
                const e = sanitizeImportedEntry(raw);
                if (!e) return;
                const key = e.site + '::' + e.seriesUrl;
                if (!h[key] || String(e.watchedAt) > String(h[key].watchedAt)) h[key] = e;
            });
            saveHistory(h);
        }
        function mergeImportedEntries(entries) {
            const progress = loadProgress();
            let added = 0, updated = 0, skipped = 0;
            entries.forEach((raw) => {
                const e = sanitizeImportedEntry(raw);
                if (!e) { skipped++; return; }
                const site = e.site;
                const seriesUrl = e.seriesUrl;
                const key = site + '::' + seriesUrl;
                const existing = progress[key];
                if (existing) {
                    // v7.0 : une entree importee sans date n'ecrase plus une entree datee.
                    if (existing.watchedAt && (!e.watchedAt || new Date(existing.watchedAt) >= new Date(e.watchedAt))) { skipped++; return; }
                    progress[key] = Object.assign({}, existing, e, { site: site, seriesUrl: seriesUrl });
                    updated++;
                } else {
                    progress[key] = e;
                    added++;
                }
            });
            saveProgress(progress);
            return { added: added, updated: updated, skipped: skipped };
        }
        function importProgressFile(file) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const entries = parseProgressBackup(String(reader.result));
                    // v7.0 : un fichier sans progression mais avec reglages est restaure.
                    if (entries.length === 0 && !/id="ed-settings-backup"/.test(String(reader.result))) { alert('Aucune donnee Video Continuum trouvee dans ce fichier.'); return; }
                    const nbSettings = mergeImportedSettings(String(reader.result));
                    const result = mergeImportedEntries(entries);
                    mergeImportedHistory(String(reader.result));
                    alert('Import termine : ' + result.added + ' ajoutee(s), ' + result.updated + ' mise(s) a jour, ' + result.skipped + ' ignoree(s).' +
                        (nbSettings ? '\nReglages restaures (etats de suivi, intro/outro, YouTube, sites ajoutes...) : ' + nbSettings + ' groupe(s).' : ''));
                    buildPersistentPanel();
                } catch (e) { alert('Import impossible : ' + e.message); }
            };
            reader.onerror = () => alert('Impossible de lire ce fichier.');
            reader.readAsText(file);
        }

