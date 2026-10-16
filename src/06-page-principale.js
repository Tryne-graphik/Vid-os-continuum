    // ================= Contexte : page principale =================
    //
    // Doit rester APRES la definition de SITES/des adaptateurs ci-dessus -
    // detectSite() les lit au moment de l'appel, pas seulement a sa
    // definition (bug trouve en usage reel le 2026-09-21 : cet appel etait
    // place tout en haut du fichier, avant que SITE_ESPRIT_DONGHUA/
    // SITE_ANIMOFLIX/SITE_ANIME_SAMA/SITES (declares en `const`, donc dans
    // leur "zone morte temporelle" tant que leur ligne n'a pas encore
    // ete executee) existent - ReferenceError immediat qui arretait TOUT
    // le script silencieusement, sur les 3 sites y compris esprit-donghua.xyz).
    // ================= Partout : "mes animes" + liens des sites (v6.19) =================
    //
    // Le script tourne desormais sur tous les sites (@match *://*/*) pour
    // offrir, depuis n'importe quelle page, la liste des animes suivis
    // (comme des favoris) sans quitter ce qu'on fait : ouverture au choix
    // dans un nouvel onglet, une nouvelle fenetre ou l'onglet courant. Le
    // stockage GM_* est celui du script, donc le meme sur tous les sites.
    const SITE_LINKS = [
        ['Esprit Donghua', 'https://esprit-donghua.xyz/'],
        ['Animoflix', 'https://animoflix.to/'],
        ['Anime-Sama', 'https://anime-sama.to/'],
        ['Odysee', 'https://odysee.com/']
    ];
    const OPEN_MODES = [['tab', 'Nouvel onglet'], ['window', 'Nouvelle fenetre'], ['same', 'Cet onglet']];
    function escHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function getOpenMode() { return GM_getValue('openMode', 'tab'); }
    function openWithMode(url) {
        const mode = getOpenMode();
        if (mode === 'same') { location.href = url; return; }
        const w = window.open(url, '_blank', mode === 'window' ? 'popup,width=1280,height=760' : '');
        if (w) w.opener = null;
    }
    function siteLinksHtml() {
        const links = SITE_LINKS.concat(Object.keys(loadCustomSites()).map((h) => [h, 'https://' + h + '/']));
        return '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + links.map(([label, url]) =>
            '<a href="' + url + '" class="vc-open-link" style="flex:1 1 auto;text-align:center;background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc55;border-radius:4px;padding:3px 3px;font:bold 10px Arial,sans-serif;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</a>').join('') + '</div>';
    }
    function openModeSelectHtml() {
        const cur = getOpenMode();
        return '<label style="display:flex;align-items:center;gap:6px;font:11px Arial,sans-serif;color:#ccc;">Ouvrir dans :' +
            '<select class="vc-open-mode" style="flex:1;padding:3px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
            OPEN_MODES.map(([v, l]) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
    }
    // Delegation globale : liens de sites/"Reprendre" et selecteur de mode,
    // ou qu'ils soient (panneau, calque).
    if (isTopFrame) {
        document.addEventListener('click', (ev) => {
            const a = ev.target.closest && ev.target.closest('a.vc-open-link');
            if (!a) return;
            ev.preventDefault();
            openWithMode(a.href);
        }, true);
        document.addEventListener('change', (ev) => {
            if (!ev.target.classList || !ev.target.classList.contains('vc-open-mode')) return;
            GM_setValue('openMode', ev.target.value);
            document.querySelectorAll('select.vc-open-mode').forEach((sel) => { sel.value = ev.target.value; });
        }, true);
    }
    function addCurrentSite() {
        const host = hostOf(location.href);
        const site = makeGenericSite(host);
        Promise.resolve(site.isPlayablePage(document) ? site.extract(document, location.href) : null).then((info) => {
            if (!info || !info.embedSrc) {
                alert('Aucun lecteur video reconnu sur cette page.\n\nOuvre la page d\'un episode (lecteur visible), puis reessaie.');
                return;
            }
            const nbPlayers = (info.embedCandidates || []).length;
            if (!confirm('Detecte sur ' + host + ' :\n\nAnime : ' + info.seriesName + '\nEpisode : ' + info.episodeNumber + (info.totalEpisodes ? ' (sur ' + info.totalEpisodes + ')' : '') +
                '\nLecteur : ' + hostOf(info.embedSrc) + (nbPlayers > 1 ? ' (+' + (nbPlayers - 1) + ' de secours)' : '') +
                '\nÉpisode suivant : ' + (info.navStyle === 'index' ? 'liste du site' : (info.nextPageUrl ? 'lien trouve' : 'non trouve')) +
                '\n\nAjouter ' + host + ' a Video Continuum ? (la page va se recharger)')) return;
            const all = loadCustomSites();
            all[host] = { addedAt: new Date().toISOString() };
            GM_setValue('customSites', all);
            location.reload();
        });
    }

    const CURRENT_SITE = detectSite();
    if (!CURRENT_SITE) {
        // Autre site : seulement "Ajouter ce site" dans le menu Tampermonkey
        // (fenetre "Mes animes" et bouton flottant retires en v6.50).
        if (!isTopFrame) return;
        GM_registerMenuCommand('\u2795 Ajouter ce site a Vidéo Continuum', addCurrentSite);
        return;
    }

    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => main(CURRENT_SITE), { once: true });
    } else {
        main(CURRENT_SITE);
    }

