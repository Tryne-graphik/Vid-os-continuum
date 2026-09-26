// ==UserScript==
// @name         Anime Tracker Generique
// @namespace    anime-tracker-generique
// @version      1.0
// @description  Suite de esprit-donghua-suivi-progression-v6 (v6 restait limite a esprit-donghua.xyz/animoflix.to/anime-sama.to, avec un adaptateur par site). Reecriture GENERIQUE : plus aucun scraping specifique a un site. La serie est reconnue par correspondance de son titre AniList dans le titre d'onglet de la page (ou associee manuellement via recherche AniList) ; le numero d'episode est devine par regex sur le titre d'onglet ; les "nouveaux episodes" sont detectes via le calendrier de diffusion officiel AniList (nextAiringEpisode) au lieu de rescraper les sites suivis. Fonctionne en theorie sur n'importe quel site avec une vraie balise <video>, y compris des plateformes legales.
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      graphql.anilist.co
// @run-at       document-idle
// ==/UserScript==

// CONTEXTE (2026-09-25) : nouvelle direction actee le 2026-09-21 (voir
// HISTORIQUE.md, section "Nouvelle direction actee : reecriture en tracker
// GENERIQUE + installeur") apres plusieurs jours d'usage stable du v6.
// Simplifications volontaires par rapport a v6 :
//  - Plus de clic automatique sur le bouton "lecture" du lecteur (l'utilisateur
//    clique lui-meme une fois, ce qui est de toute facon necessaire sur la
//    plupart des lecteurs pour des raisons de politique autoplay/son).
//  - Plus de navigation automatique vers l'episode suivant (aucune notion
//    generique et fiable d'URL "episode suivant" hors d'un site precis) :
//    le script SAUVEGARDE la progression automatiquement (fin d'episode/outro
//    detectes sur la vraie balise <video>) mais laisse l'utilisateur naviguer
//    lui-meme vers l'episode suivant.
//  - Plus de calque plein ecran ni d'iframe pilotee : le script observe
//    directement la balise <video> presente sur la page (fonctionne aussi
//    bien pour une balise <video> native que pour un lecteur qui l'insere
//    dans une iframe same-origin - pas de tentative sur une iframe
//    cross-origin, ce qui aurait reintroduit du code specifique par lecteur).
//  - "Nouveaux episodes" et validation du numero total d'episodes passent par
//    l'API publique et gratuite AniList (https://anilist.co/graphiql), pas
//    par un rescraping des sites suivis.
// Reste inchange dans l'esprit de v4/v6 : panneau persistant, sauvegarde
// export/import dans un fichier lie via File System Access API
// (showSaveFilePicker sur unsafeWindow - piege Tampermonkey deja documente en
// v4.11 : `window` est un proxy sandboxe qui rejette cet appel, il faut le
// vrai objet page via unsafeWindow), saut d'intro/detection d'outro par
// serie configurables.
//
// RIEN N'A ENCORE ETE TESTE DANS UN VRAI NAVIGATEUR.

(function () {
    'use strict';

    const STORE_PREFIX = 'tracked::';
    const BACKUP_DB_NAME = 'animeTrackerGeneriqueV1';
    const BACKUP_JSON_ID = 'atg-progress-backup';
    const DEFAULT_FILENAME = 'ma-progression-anime-tracker-generique.html';
    const LOG_PREFIX = '[AnimeTrackerGenerique]';

    const realWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // ================= Stockage : series suivies =================

    function loadTracked() {
        const keys = GM_listValues().filter((k) => k.indexOf(STORE_PREFIX) === 0);
        const map = {};
        keys.forEach((k) => { map[k.slice(STORE_PREFIX.length)] = GM_getValue(k); });
        return map;
    }
    function saveTrackedEntry(entry) { GM_setValue(STORE_PREFIX + entry.anilistId, entry); }
    function deleteTrackedEntry(id) { GM_deleteValue(STORE_PREFIX + id); }

    function isDomainHidden() {
        const hidden = GM_getValue('hiddenDomains', {});
        return !!hidden[location.hostname];
    }
    function setDomainHidden(hidden) {
        const map = GM_getValue('hiddenDomains', {});
        if (hidden) map[location.hostname] = true; else delete map[location.hostname];
        GM_setValue('hiddenDomains', map);
    }

    // ================= AniList (recherche + calendrier de diffusion) =================

    function gmRequest(details) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest(Object.assign({}, details, {
                onload: (res) => resolve(res),
                onerror: (err) => reject(err),
                ontimeout: () => reject(new Error('timeout'))
            }));
        });
    }
    function anilistQuery(query, variables) {
        return gmRequest({
            method: 'POST',
            url: 'https://graphql.anilist.co',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: JSON.stringify({ query: query, variables: variables })
        }).then((res) => {
            const json = JSON.parse(res.responseText);
            if (json.errors) throw new Error(json.errors.map((e) => e.message).join(', '));
            return json.data;
        });
    }
    function anilistSearch(search) {
        const q = 'query ($search: String) { Page(perPage: 10) { media(search: $search, type: ANIME, sort: POPULARITY_DESC) { id title { romaji english native } coverImage { medium } episodes nextAiringEpisode { episode airingAt } } } }';
        return anilistQuery(q, { search: search }).then((data) => data.Page.media);
    }
    function anilistFetchByIds(ids) {
        if (!ids.length) return Promise.resolve({});
        const q = 'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id episodes nextAiringEpisode { episode airingAt } } } }';
        return anilistQuery(q, { ids: ids }).then((data) => {
            const map = {};
            data.Page.media.forEach((m) => { map[m.id] = m; });
            return map;
        });
    }

    function checkForNewEpisodes(force) {
        const tracked = loadTracked();
        const ids = Object.keys(tracked).map(Number);
        if (!ids.length) return Promise.resolve();
        const last = GM_getValue('atg_lastNewEpisodeCheck', 0);
        if (!force && Date.now() - last < 3600 * 1000) return Promise.resolve();
        return anilistFetchByIds(ids).then((map) => {
            ids.forEach((id) => {
                const m = map[id];
                if (!m) return;
                const entry = tracked[id];
                entry.totalEpisodes = m.episodes || entry.totalEpisodes;
                entry.nextAiringEpisode = m.nextAiringEpisode ? m.nextAiringEpisode.episode : entry.nextAiringEpisode;
                saveTrackedEntry(entry);
            });
            GM_setValue('atg_lastNewEpisodeCheck', Date.now());
            renderPanel();
        }).catch((e) => console.log(LOG_PREFIX, 'echec verification nouveaux episodes', e));
    }
    function hasNewEpisode(entry) {
        const watched = entry.lastEpisode && entry.lastEpisode.number;
        if (watched == null) return false;
        const latestKnown = entry.nextAiringEpisode ? entry.nextAiringEpisode - 1 : entry.totalEpisodes;
        return latestKnown != null && latestKnown > watched;
    }

    // ================= Reconnaissance generique : titre d'onglet =================

    function stripDiacritics(s) {
        // Passe par NFD (caractere de base + marques combinantes separees), puis
        // retire les marques combinantes par plage de code point (0x0300-0x036F) -
        // evite d'ecrire ces caracteres combinants directement dans une regex.
        return s.normalize('NFD').split('').filter((ch) => {
            const c = ch.codePointAt(0);
            return !(c >= 0x0300 && c <= 0x036f);
        }).join('');
    }
    function normalizeTitle(s) {
        return stripDiacritics((s || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
    }
    function findMatchingTrackedSeries(pageTitle, tracked) {
        const norm = normalizeTitle(pageTitle);
        if (!norm) return null;
        let best = null;
        Object.keys(tracked).forEach((id) => {
            const e = tracked[id];
            if (!e.active) return;
            const candidates = [e.titleRomaji, e.titleEnglish, e.titleNative].filter(Boolean).map(normalizeTitle);
            candidates.forEach((c) => {
                if (c.length >= 3 && norm.indexOf(c) !== -1 && (!best || c.length > best.matchLen)) {
                    best = { entry: e, matchLen: c.length };
                }
            });
        });
        return best ? best.entry : null;
    }
    function guessEpisodeNumber(title) {
        if (!title) return null;
        const patterns = [
            /S\s?\d+\s*E\s?0*(\d{1,4})\b/i,
            /\bépisode\s*0*(\d{1,4})\b/i,
            /\bepisode\s*0*(\d{1,4})\b/i,
            /\bep\.?\s*0*(\d{1,4})\b/i,
            /\bE\s?0*(\d{1,4})\b/,
            /-\s*0*(\d{1,4})\s*(?:VOSTFR|VOST|VF|$)/i
        ];
        for (let i = 0; i < patterns.length; i++) {
            const m = title.match(patterns[i]);
            if (m) { const n = parseInt(m[1], 10); if (!isNaN(n)) return n; }
        }
        return null;
    }

    // ================= Progression =================

    function recordProgress(entry, number, url, pageTitle) {
        entry.lastEpisode = { number: number, url: url, title: pageTitle, watchedAt: new Date().toISOString() };
        saveTrackedEntry(entry);
        maybeAutoExport();
        renderPanel();
    }

    // ================= Suivi video generique (n'importe quelle balise <video>) =================

    let currentPageMatch = null;

    function attachVideoHandlers(video, entry, pageTitle) {
        let introApplied = false;
        let outroTriggered = false;
        const episodeNumber = guessEpisodeNumber(pageTitle);

        function maybeSkipIntro() {
            if (introApplied || !entry.introEnd) return;
            if (video.currentTime > 0.2 && video.currentTime < entry.introEnd) {
                video.currentTime = entry.introEnd;
                introApplied = true;
                toast('Intro sautée');
            }
        }
        function markWatched() {
            if (episodeNumber == null) {
                toast('Numéro d\'épisode non deviné — enregistre-le à la main dans le panneau.');
                return;
            }
            recordProgress(entry, episodeNumber, location.href, pageTitle);
            toast('Progression enregistrée : épisode ' + episodeNumber);
        }
        video.addEventListener('playing', maybeSkipIntro);
        video.addEventListener('timeupdate', () => {
            maybeSkipIntro();
            if (!outroTriggered && entry.outroStart && video.currentTime >= entry.outroStart) {
                outroTriggered = true;
                markWatched();
            }
        });
        video.addEventListener('ended', () => {
            if (!outroTriggered) { outroTriggered = true; markWatched(); }
        });
    }

    function onVideoFound(video) {
        const tracked = loadTracked();
        currentPageMatch = findMatchingTrackedSeries(document.title, tracked);
        if (currentPageMatch) attachVideoHandlers(video, currentPageMatch, document.title);
        renderPanel();
    }
    function setupVideoWatcher() {
        const existing = document.querySelector('video');
        if (existing) { onVideoFound(existing); return; }
        let attempts = 0;
        const observer = new MutationObserver(() => {
            const v = document.querySelector('video');
            if (v) { observer.disconnect(); onVideoFound(v); }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        const interval = setInterval(() => {
            attempts++;
            const v = document.querySelector('video');
            if (v) { clearInterval(interval); observer.disconnect(); onVideoFound(v); return; }
            if (attempts > 16) { clearInterval(interval); observer.disconnect(); }
        }, 500);
    }

    // ================= Export / import (fichier de sauvegarde lie) =================

    function loadAllEntriesSorted() {
        const tracked = loadTracked();
        const entries = Object.keys(tracked).map((id) => tracked[id]);
        entries.sort((a, b) => {
            const na = hasNewEpisode(a) ? 0 : 1, nb = hasNewEpisode(b) ? 0 : 1;
            if (na !== nb) return na - nb;
            return (a.titleRomaji || '').localeCompare(b.titleRomaji || '');
        });
        return entries;
    }
    function formatDate(iso) { return iso ? new Date(iso).toLocaleString('fr-FR') : '?'; }
    function buildHtml() {
        const entries = loadAllEntriesSorted();
        let items;
        if (entries.length === 0) {
            items = '<p>Aucun anime suivi pour le moment.</p>';
        } else {
            items = '<ul>' + entries.map((e) => {
                const title = e.titleRomaji || e.titleEnglish || ('AniList #' + e.anilistId);
                const ep = e.lastEpisode || {};
                return '<li><strong>' + title + '</strong> - Episode ' + (ep.number != null ? ep.number : '?') +
                    (ep.url ? (' - <a href="' + ep.url + '">Reprendre ici</a>') : '') +
                    ' <span style="color:#888;font-size:12px;">(' + formatDate(ep.watchedAt) + ')</span></li>';
            }).join('') + '</ul>';
        }
        const dataBlock = '<script type="application/json" id="' + BACKUP_JSON_ID + '">' +
            JSON.stringify(entries).replace(/</g, '\\u003c') + '</' + 'script>';
        return '<!doctype html><html><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1">' +
            '<title>Ma progression - Anime Tracker Generique</title>' +
            '<style>body{font-family:Arial,sans-serif;background:#0d0d12;color:#eee;padding:20px;} a{color:#03d0fc;} li{margin-bottom:12px;font-size:15px;}</style>' +
            '</head><body><h1>Ma progression - Anime Tracker Generique</h1>' + items + dataBlock + '</body></html>';
    }
    function downloadHtml(filename) {
        const blob = new Blob([buildHtml()], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    }
    function isFileSystemAccessSupported() { return typeof realWindow.showSaveFilePicker === 'function'; }
    function idbOpen() {
        return new Promise((resolve, reject) => {
            const req = realWindow.indexedDB.open(BACKUP_DB_NAME, 1);
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
    function loadBackupFileHandle() {
        if (!isFileSystemAccessSupported()) return Promise.resolve();
        return idbGetHandle('backupFile').then((handle) => {
            backupFileHandle = handle || null;
            renderPanel();
        }).catch((e) => console.log(LOG_PREFIX, 'impossible de relire le fichier de sauvegarde lie', e));
    }
    function chooseBackupFile() {
        if (!isFileSystemAccessSupported()) {
            alert('Ton navigateur ne supporte pas la sauvegarde directe dans un fichier (File System Access API, dispo sur Chrome/Edge).');
            return;
        }
        realWindow.showSaveFilePicker({
            suggestedName: DEFAULT_FILENAME,
            types: [{ description: 'Page HTML', accept: { 'text/html': ['.html'] } }]
        }).then((handle) => {
            backupFileHandle = handle;
            return idbSetHandle('backupFile', handle);
        }).then(() => { renderPanel(); return writeBackupFile(); }).catch((e) => {
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
    function writeBackupFile() {
        if (!backupFileHandle) return Promise.resolve(false);
        return ensureBackupPermission(backupFileHandle).then((ok) => {
            if (!ok) throw new Error('permission refusee');
            return backupFileHandle.createWritable();
        }).then((writable) => writable.write(buildHtml()).then(() => writable.close())).then(() => true).catch((e) => {
            console.log(LOG_PREFIX, 'echec ecriture fichier lie, repli sur telechargement', e);
            return false;
        });
    }
    function saveProgressBackup() {
        return writeBackupFile().then((wrote) => { if (!wrote) downloadHtml(DEFAULT_FILENAME); });
    }
    function maybeAutoExport() {
        if (Object.keys(loadTracked()).length === 0) return;
        const today = new Date().toISOString().slice(0, 10);
        if (GM_getValue('atg_lastAutoExport', null) === today) return;
        saveProgressBackup();
        GM_setValue('atg_lastAutoExport', today);
    }
    function parseProgressBackup(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const dataEl = doc.getElementById(BACKUP_JSON_ID);
        if (!dataEl) return [];
        try {
            const entries = JSON.parse(dataEl.textContent);
            return Array.isArray(entries) ? entries : [];
        } catch (e) {
            console.log(LOG_PREFIX, 'bloc JSON illisible', e);
            return [];
        }
    }
    function mergeImportedEntries(entries) {
        let added = 0, updated = 0, skipped = 0;
        entries.forEach((e) => {
            if (!e || !e.anilistId) return;
            const existing = GM_getValue(STORE_PREFIX + e.anilistId, null);
            if (existing) {
                const existingDate = existing.lastEpisode && existing.lastEpisode.watchedAt;
                const importedDate = e.lastEpisode && e.lastEpisode.watchedAt;
                if (existingDate && importedDate && new Date(existingDate) >= new Date(importedDate)) { skipped++; return; }
                saveTrackedEntry(Object.assign({}, existing, e));
                updated++;
            } else {
                saveTrackedEntry(e);
                added++;
            }
        });
        return { added: added, updated: updated, skipped: skipped };
    }
    function importProgressFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            const entries = parseProgressBackup(String(reader.result));
            if (entries.length === 0) { alert('Aucune entree de progression trouvee dans ce fichier (format non reconnu - cet import ne comprend que le format de ce script, pas celui de v4/v6).'); return; }
            const result = mergeImportedEntries(entries);
            alert('Import termine : ' + result.added + ' ajoutee(s), ' + result.updated + ' mise(s) a jour, ' + result.skipped + ' ignoree(s).');
            renderPanel();
        };
        reader.onerror = () => alert('Impossible de lire ce fichier.');
        reader.readAsText(file);
    }

    // ================= UI : toast =================

    function toast(text) {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111;color:#eee;padding:10px 16px;border-radius:6px;z-index:2147483647;font:14px Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.5);';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    // ================= UI : panneau persistant =================

    let panelEl = null, toggleBtn = null, searchModalEl = null;

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent =
            '#atg-toggle{position:fixed;bottom:16px;right:16px;z-index:2147483000;width:44px;height:44px;border-radius:50%;background:#03d0fc;color:#000;border:none;font-size:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5);}' +
            '#atg-toggle .atg-badge{position:absolute;top:-4px;right:-4px;background:#ff4444;color:#fff;border-radius:10px;font-size:11px;padding:1px 5px;}' +
            '#atg-panel{position:fixed;bottom:68px;right:16px;width:340px;max-height:70vh;overflow:auto;background:#111318;color:#eee;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.6);z-index:2147483000;font:13px Arial,sans-serif;padding:12px;display:none;}' +
            '#atg-panel h3{margin:0 0 8px;font-size:14px;color:#03d0fc;}' +
            '#atg-panel .atg-section{margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #2a2d35;}' +
            '#atg-panel button{background:#22252c;color:#eee;border:1px solid #3a3d45;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;margin:2px 2px 2px 0;}' +
            '#atg-panel button:hover{background:#2f333c;}' +
            '#atg-panel input[type=text],#atg-panel input[type=number]{background:#1a1c22;color:#eee;border:1px solid #3a3d45;border-radius:4px;padding:4px;font-size:12px;width:100%;box-sizing:border-box;margin-bottom:4px;}' +
            '#atg-panel .atg-series{padding:6px 0;border-bottom:1px solid #22252c;}' +
            '#atg-panel .atg-series a{color:#03d0fc;text-decoration:none;}' +
            '#atg-panel .atg-new{color:#ffcc44;}' +
            '#atg-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483100;display:flex;align-items:center;justify-content:center;}' +
            '#atg-modal{background:#111318;color:#eee;border-radius:8px;padding:14px;width:360px;max-height:70vh;overflow:auto;font:13px Arial,sans-serif;}' +
            '#atg-modal .atg-result{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #22252c;cursor:pointer;}' +
            '#atg-modal .atg-result:hover{background:#1a1c22;}' +
            '#atg-modal .atg-result img{width:32px;height:44px;object-fit:cover;border-radius:3px;}';
        document.head.appendChild(style);
    }

    function ensureToggleButton() {
        if (toggleBtn) return;
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'atg-toggle';
        toggleBtn.textContent = '🎬';
        toggleBtn.title = 'Anime Tracker';
        toggleBtn.addEventListener('click', () => {
            panelEl.style.display = (panelEl.style.display === 'none' || !panelEl.style.display) ? 'block' : 'none';
        });
        document.body.appendChild(toggleBtn);
    }
    function ensurePanel() {
        if (panelEl) return;
        panelEl = document.createElement('div');
        panelEl.id = 'atg-panel';
        document.body.appendChild(panelEl);
        panelEl.addEventListener('click', onPanelClick);
    }

    function onPanelClick(ev) {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const tracked = id ? loadTracked() : null;
        const entry = id ? tracked[id] : null;
        if (action === 'associate') { openSearchModal(document.title); }
        else if (action === 'save-manual') {
            if (!currentPageMatch) return;
            const numInput = panelEl.querySelector('#atg-manual-episode');
            const n = parseInt(numInput.value, 10);
            if (isNaN(n)) { alert('Numero d\'episode invalide.'); return; }
            recordProgress(currentPageMatch, n, location.href, document.title);
        }
        else if (action === 'toggle-active') { entry.active = !entry.active; saveTrackedEntry(entry); renderPanel(); }
        else if (action === 'set-intro') {
            const v = prompt('Fin de l\'intro en secondes (ex: 90) :', entry.introEnd || '');
            if (v === null) return;
            entry.introEnd = v.trim() === '' ? null : Number(v);
            saveTrackedEntry(entry); renderPanel();
        }
        else if (action === 'set-outro') {
            const v = prompt('Debut de l\'outro en secondes (ex: 1200) :', entry.outroStart || '');
            if (v === null) return;
            entry.outroStart = v.trim() === '' ? null : Number(v);
            saveTrackedEntry(entry); renderPanel();
        }
        else if (action === 'delete') {
            if (confirm('Retirer "' + (entry.titleRomaji || entry.anilistId) + '" du suivi ?')) { deleteTrackedEntry(id); renderPanel(); }
        }
        else if (action === 'check-new') { checkForNewEpisodes(true); }
        else if (action === 'choose-backup') { chooseBackupFile(); }
        else if (action === 'export-now') { saveProgressBackup(); }
        else if (action === 'import') { panelEl.querySelector('#atg-import-input').click(); }
        else if (action === 'hide-domain') {
            if (confirm('Masquer Anime Tracker sur ' + location.hostname + ' ? (reactivable via le menu Tampermonkey)')) {
                setDomainHidden(true);
                toggleBtn.remove(); panelEl.remove(); toggleBtn = null; panelEl = null;
            }
        }
    }

    function renderPanel() {
        if (!panelEl) return;
        const tracked = loadTracked();
        const entries = loadAllEntriesSorted();
        const newCount = entries.filter(hasNewEpisode).length;
        if (toggleBtn) {
            let badge = toggleBtn.querySelector('.atg-badge');
            if (newCount > 0) {
                if (!badge) { badge = document.createElement('span'); badge.className = 'atg-badge'; toggleBtn.appendChild(badge); }
                badge.textContent = newCount;
            } else if (badge) { badge.remove(); }
        }

        let pageSectionHtml;
        if (currentPageMatch) {
            const guessed = guessEpisodeNumber(document.title);
            pageSectionHtml = '<div class="atg-section">' +
                '<div><strong>' + (currentPageMatch.titleRomaji || currentPageMatch.titleEnglish) + '</strong></div>' +
                '<div>Episode devine sur cette page : ' + (guessed != null ? guessed : '(non devine)') + '</div>' +
                '<input type="number" id="atg-manual-episode" value="' + (guessed != null ? guessed : (currentPageMatch.lastEpisode.number || '')) + '">' +
                '<button data-action="save-manual">Enregistrer comme vu</button>' +
                '</div>';
        } else {
            const video = document.querySelector('video');
            pageSectionHtml = '<div class="atg-section">' +
                '<div>' + (video ? 'Aucune serie suivie ne correspond au titre de cette page.' : 'Aucune balise video detectee sur cette page.') + '</div>' +
                '<button data-action="associate">Associer cette page à une série…</button>' +
                '</div>';
        }

        const listHtml = entries.length === 0 ? '<p>Aucun anime suivi.</p>' : entries.map((e) => {
            const ep = e.lastEpisode || {};
            const title = e.titleRomaji || e.titleEnglish || ('AniList #' + e.anilistId);
            return '<div class="atg-series">' +
                '<div>' + (hasNewEpisode(e) ? '<span class="atg-new">● </span>' : '') +
                '<strong>' + title + '</strong>' + (e.active ? '' : ' (inactif)') + '</div>' +
                '<div>Dernier vu : Episode ' + (ep.number != null ? ep.number : '?') +
                (ep.url ? (' — <a href="' + ep.url + '">Reprendre</a>') : '') + '</div>' +
                '<div>' +
                '<button data-action="set-intro" data-id="' + e.anilistId + '">Fin intro</button>' +
                '<button data-action="set-outro" data-id="' + e.anilistId + '">Debut outro</button>' +
                '<button data-action="toggle-active" data-id="' + e.anilistId + '">' + (e.active ? 'Desactiver' : 'Activer') + '</button>' +
                '<button data-action="delete" data-id="' + e.anilistId + '">Supprimer</button>' +
                '</div></div>';
        }).join('');

        const backupStatus = backupFileHandle ? ('Sauvegarde liee : ' + backupFileHandle.name) : 'Sauvegarde : telechargement classique';

        panelEl.innerHTML =
            '<h3>Anime Tracker (générique)</h3>' +
            pageSectionHtml +
            '<div class="atg-section"><strong>Suivi (' + entries.length + ')</strong>' + listHtml + '</div>' +
            '<div class="atg-section">' +
            '<button data-action="check-new">Vérifier nouveaux épisodes</button><br>' +
            '<span>' + backupStatus + '</span><br>' +
            '<button data-action="choose-backup">Choisir fichier sauvegarde</button>' +
            '<button data-action="export-now">Exporter</button>' +
            '<button data-action="import">Importer</button>' +
            '<input type="file" id="atg-import-input" accept=".html" style="display:none">' +
            '</div>' +
            '<div class="atg-section"><button data-action="hide-domain">Masquer sur ce site</button></div>';

        panelEl.querySelector('#atg-import-input').addEventListener('change', (ev) => {
            if (ev.target.files[0]) importProgressFile(ev.target.files[0]);
        });
    }

    // ================= Modal de recherche AniList =================

    function closeSearchModal() { if (searchModalEl) { searchModalEl.remove(); searchModalEl = null; } }
    function openSearchModal(prefill) {
        closeSearchModal();
        searchModalEl = document.createElement('div');
        searchModalEl.id = 'atg-modal-overlay';
        searchModalEl.innerHTML =
            '<div id="atg-modal">' +
            '<h3>Associer une série (AniList)</h3>' +
            '<input type="text" id="atg-modal-input" value="' + (prefill || '').replace(/"/g, '&quot;') + '">' +
            '<button id="atg-modal-search">Rechercher</button>' +
            '<button id="atg-modal-close">Fermer</button>' +
            '<div id="atg-modal-results"></div>' +
            '</div>';
        document.body.appendChild(searchModalEl);
        searchModalEl.querySelector('#atg-modal-close').addEventListener('click', closeSearchModal);
        searchModalEl.addEventListener('click', (ev) => { if (ev.target === searchModalEl) closeSearchModal(); });
        function runSearch() {
            const q = searchModalEl.querySelector('#atg-modal-input').value.trim();
            if (!q) return;
            const results = searchModalEl.querySelector('#atg-modal-results');
            results.textContent = 'Recherche...';
            anilistSearch(q).then((media) => {
                if (media.length === 0) { results.textContent = 'Aucun résultat.'; return; }
                results.innerHTML = '';
                media.forEach((m) => {
                    const row = document.createElement('div');
                    row.className = 'atg-result';
                    const title = m.title.romaji || m.title.english || m.title.native;
                    row.innerHTML = (m.coverImage && m.coverImage.medium ? '<img src="' + m.coverImage.medium + '">' : '') + '<span>' + title + '</span>';
                    row.addEventListener('click', () => selectSeries(m));
                    results.appendChild(row);
                });
            }).catch((e) => { results.textContent = 'Erreur de recherche : ' + e.message; });
        }
        searchModalEl.querySelector('#atg-modal-search').addEventListener('click', runSearch);
        searchModalEl.querySelector('#atg-modal-input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') runSearch(); });
        if (prefill) runSearch();
    }
    function selectSeries(media) {
        const id = String(media.id);
        const tracked = loadTracked();
        let entry = tracked[id];
        if (!entry) {
            entry = {
                anilistId: media.id,
                titleRomaji: media.title.romaji, titleEnglish: media.title.english, titleNative: media.title.native,
                cover: media.coverImage && media.coverImage.medium,
                totalEpisodes: media.episodes || null,
                nextAiringEpisode: media.nextAiringEpisode ? media.nextAiringEpisode.episode : null,
                active: true, introEnd: null, outroStart: null,
                lastEpisode: { number: null, url: null, title: null, watchedAt: null }
            };
        }
        saveTrackedEntry(entry);
        closeSearchModal();
        currentPageMatch = entry;
        const video = document.querySelector('video');
        if (video) attachVideoHandlers(video, entry, document.title);
        const guessed = guessEpisodeNumber(document.title);
        if (guessed != null) recordProgress(entry, guessed, location.href, document.title);
        renderPanel();
        panelEl.style.display = 'block';
    }

    // ================= Demarrage =================

    function main() {
        if (isDomainHidden()) return;
        injectStyles();
        ensureToggleButton();
        ensurePanel();
        loadBackupFileHandle().then(() => renderPanel());
        renderPanel();
        setupVideoWatcher();
        checkForNewEpisodes(false);
        maybeAutoExport();

        GM_registerMenuCommand('Anime Tracker : afficher/masquer le panneau', () => {
            panelEl.style.display = (panelEl.style.display === 'none' || !panelEl.style.display) ? 'block' : 'none';
        });
        GM_registerMenuCommand('Anime Tracker : choisir le fichier de sauvegarde', chooseBackupFile);
        GM_registerMenuCommand('Anime Tracker : réafficher sur ce site (si masqué)', () => { setDomainHidden(false); location.reload(); });
    }

    if (document.body) main();
    else document.addEventListener('DOMContentLoaded', main);
})();
