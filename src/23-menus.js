        // ---- Menus du panneau (v7.4) : onglets (.vc-nav > .vc-tab) + volets (.vc-pane), un seul ouvert.
        // Meme HTML pour les 4 agencements (css/agencements/*.css) : liste, tablettes, onglets, rail.
        // --o = ordre d'affichage en agencement "liste" (volet juste sous son onglet).
        // fonctions (pas de const) : appelables avant cette ligne (meme raison que themes()).
        function vcIcons() { return {
            reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
            youtube: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
            sauvegarde: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
            nouveautes: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
            incident: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
            legende: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'
        }; }
        function vcIcon(key) {
            return '<svg class="vc-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (vcIcons()[key] || '') + '</svg>';
        }
        // Element de menu : { key, label, html, badge }. 4e argument (ancien "open") ignore.
        function menuItem(key, label, html, extra) {
            return Object.assign({ key: key, label: label, html: html }, extra && typeof extra === 'object' ? extra : {});
        }
        function menusHtml(items) {
            items = items.filter(Boolean);
            const tabs = items.map((m, i) => '<button type="button" class="vc-tab" data-menu="' + m.key + '" aria-expanded="false" title="' + m.label + '" style="--o:' + (2 * i + 1) + ';">' +
                vcIcon(m.key) + '<span class="vc-lbl">' + m.label + '</span>' + (m.badge ? '<span class="vc-badge">' + m.badge + '</span>' : '') + '</button>').join('');
            const panes = items.map((m, i) => '<div class="vc-pane" data-menu="' + m.key + '" style="--o:' + (2 * i + 2) + ';" hidden>' +
                '<div class="vc-pane-title">' + m.label + '</div>' + m.html + '</div>').join('');
            return '<nav class="vc-nav" aria-label="Menus">' + tabs + '</nav>' + panes;
        }
        // Menu ouvert retenu par panneau ('ep' / 'ed') d'une reconstruction a l'autre ; '' = tout ferme.
        function vcMenuState() { return vcMenuState.s || (vcMenuState.s = {}); }
        function openMenu(root, prefix, key) {
            vcMenuState()[prefix] = key;
            root.querySelectorAll('.vc-tab').forEach((t) => t.setAttribute('aria-expanded', String(t.getAttribute('data-menu') === key)));
            root.querySelectorAll('.vc-pane').forEach((p) => { p.hidden = p.getAttribute('data-menu') !== key; });
            root.classList.toggle('vc-menu-open', !!key);
        }
        function bindMenus(root, prefix, defaultKey) {
            const has = (k) => k && root.querySelector('.vc-pane[data-menu="' + k + '"]');
            const start = prefix in vcMenuState() ? vcMenuState()[prefix] : defaultKey;
            openMenu(root, prefix, has(start) ? start : '');
            root.querySelectorAll('.vc-tab').forEach((t) => t.addEventListener('click', () => {
                const k = t.getAttribute('data-menu');
                openMenu(root, prefix, vcMenuState()[prefix] === k ? '' : k);
            }));
        }
        function isMenuOpen(prefix, key) { return vcMenuState()[prefix] === key; }
