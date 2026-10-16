        // ---- Personnaliser (v6.59) : couleur d'accent, police du texte, Cinzel (livree, OFL) pour les titres.
        function vcFonts() { return { theme: 'Police du thème', segoe: 'Segoe UI', calibri: 'Calibri', cambria: 'Cambria', georgia: 'Georgia', verdana: 'Verdana', consolas: 'Consolas' }; }
        function currentFont() { const f = GM_getValue('fontFamily', 'theme'); return vcFonts()[f] ? f : 'theme'; }
        function currentAccent() { const a = GM_getValue('accentColor', ''); return /^#[0-9a-f]{6}$/i.test(a) ? a : ''; }
        function hexRgb(h) { return [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)); }
        function rgbHex(c) { return '#' + c.map((v) => ('0' + v.toString(16)).slice(-2)).join(''); }
        function relLum(c) {
            const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
        }
        // Accent en texte : eclairci jusqu'a 4,5:1 sur plaque sombre (#15151f).
        function accentText(h) {
            let c = hexRgb(h);
            for (let i = 0; i < 12 && (relLum(c) + 0.05) / 0.058 < 4.5; i++) c = c.map((v) => Math.round(v + (255 - v) * 0.2));
            return rgbHex(c);
        }
        function accentTargets() { return { cadre: 'Cadre du panneau', titres: 'Titres des sections', cases: 'Cases cochees', tout: 'Tout' }; }
        function currentAccentTarget() { const t = GM_getValue('accentTarget', 'cadre'); return accentTargets()[t] ? t : 'cadre'; }
        function themeAccent() { return themes()[currentThemeId()].acc; }
        function currentThemeId() { const t = GM_getValue('theme', 'stele'); return themes()[t] ? t : 'stele'; }
        function themeTexUrl(tex) {
            if (!tex) return 'none';
            try { const u = typeof GM_getResourceURL === 'function' && GM_getResourceURL(tex[0]); if (u) return 'url("' + u + '")'; } catch (e) { /* repli */ }
            return 'url("https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/themes/' + tex[1] + '")';
        }
        function applyTheme(el) {
            if (!el) return;
            ensureVcStyles();
            bindScaleOnResize();
            const id = currentThemeId();
            el.classList.add('vc-th-host');
            Object.keys(themes()).forEach((k) => el.classList.toggle('vc-th-' + k, k === id));
            el.classList.add('vc-thm');
            el.classList.toggle('vc-light', !!themes()[id].light);
            el.classList.toggle('vc-glass', !!themes()[id].glass);
            el.setAttribute('data-vc-layout', currentLayout());
            const acc = currentAccent();
            const tg = currentAccentTarget();
            ['cadre', 'titres', 'cases'].forEach((t) => el.classList.toggle('vc-ct-' + t, !!acc && (tg === t || tg === 'tout')));
            ['cc', 'cct', 'ccon'].forEach((n) => el.style.removeProperty('--vc-' + n));
            if (acc) {
                el.style.setProperty('--vc-cc', acc);
                el.style.setProperty('--vc-cct', accentText(acc));
                el.style.setProperty('--vc-ccon', relLum(hexRgb(acc)) > 0.18 ? '#000' : '#fff');
            }
            // v7.3 : "Police du theme" par defaut (choix de Personnaliser sinon).
            el.style.setProperty('--vc-font', '"' + (currentFont() === 'theme' ? themes()[id].font || 'Segoe UI' : vcFonts()[currentFont()]).replace(/^Georgia$/, 'VC Georgia') + '"');
            el.classList.toggle('vc-cinzel', GM_getValue('titleCinzel', false) === true);
            applyScale(el);
        }
        // Grand ecran : panneau compact en 1080p (fenetre ~950 px de haut), agrandi au-dela
        // (x1,25 en 1440p, plafonne a x1,6).
        function applyScale(el) {
            const z = Math.round(Math.max(1, Math.min(1.6, window.innerHeight / 1050)) * 100) / 100;
            const off = el.id === 'ep-panel' ? 120 : 70;
            el.style.zoom = z === 1 ? '' : String(z);
            // le zoom agrandit aussi le decalage du haut (top) : hauteur max = 100vh / z - off,
            // sinon le bas du panneau sortait de l'ecran en 1440p / 4K (recette 6.58).
            el.style.maxHeight = 'calc(100vh / ' + z + ' - ' + off + 'px)';
        }
        let vcScaleBound = false;
        function bindScaleOnResize() {
            if (vcScaleBound) return;
            vcScaleBound = true;
            window.addEventListener('resize', () => document.querySelectorAll('.vc-th-host').forEach(applyScale));
        }
        function groupLabel(t) { return '<div class="vc-grp">' + t + '</div>'; }
        function versionButtonHtml(prefix, v) {
            return '<button id="' + prefix + '-version-btn" class="vc-ver" title="Verifier les mises a jour : ouvre la page d\'installation, Tampermonkey indique si une version plus recente existe">v' + v + ' &#8635;</button>';
        }
        function themeSelectHtml(id) {
            const cur = currentThemeId();
            return '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;">Theme :<select id="' + id + '" aria-label="Theme du panneau" style="flex:1;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                Object.keys(themes()).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + themes()[k].label + '</option>').join('') + '</select></label>';
        }
        function bindThemeSelect(container, id) {
            const sel = container.querySelector('#' + id);
            if (sel) sel.addEventListener('change', () => { GM_setValue('theme', sel.value); document.querySelectorAll('.vc-th-host').forEach(applyTheme); syncAccentInput(container, id); });
            bindCustomize(container, id.replace('-theme-select', ''));
        }
        function customizeHtml(prefix, open) {
            const f = currentFont(), F = vcFonts();
            const row = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;';
            return collapsibleSection('perso', 'Personnaliser',
                '<label style="' + row + '">Couleur :<input type="color" id="' + prefix + '-accent" value="' + (currentAccent() || themeAccent()) + '" aria-label="Couleur (pipette dans le selecteur)" style="flex:1;height:26px;padding:0 2px;border:none;background:none;cursor:pointer;">' +
                '<button id="' + prefix + '-accent-apply" title="Appliquer et enregistrer la couleur choisie" style="' + BTN_STYLE + 'flex:0 0 auto;">Appliquer</button></label>' +
                '<label style="' + row + '">Appliquer à<select id="' + prefix + '-accent-target" aria-label="Element colore" style="flex:1;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                Object.keys(accentTargets()).map((k) => '<option value="' + k + '"' + (k === currentAccentTarget() ? ' selected' : '') + '>' + accentTargets()[k] + '</option>').join('') + '</select></label>' +
                '<label style="' + row + '">Police :<select id="' + prefix + '-font" aria-label="Police du panneau" style="flex:1;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                Object.keys(F).map((k) => '<option value="' + k + '"' + (k === f ? ' selected' : '') + ' style="font-family:\'' + F[k] + '\';">' + F[k] + '</option>').join('') + '</select></label>' +
                '<label style="' + row + '">Agencement :<select id="' + prefix + '-layout" aria-label="Agencement du panneau" style="flex:1;">' +
                Object.keys(layouts()).map((k) => '<option value="' + k + '"' + (k === GM_getValue('panelLayout', 'theme') ? ' selected' : '') + '>' + layouts()[k] + '</option>').join('') + '</select></label>' +
                '<label class="vc-track" title="Titres des sections en Cinzel (capitales gravees)"><input type="checkbox" id="' + prefix + '-cinzel"' + (GM_getValue('titleCinzel', false) === true ? ' checked' : '') + '><span class="off">Titres en Cinzel</span><span class="on">&#10003; Titres en Cinzel</span></label>' +
                '<button id="' + prefix + '-perso-reset" title="Revenir a l\'accent et a la police du theme" style="' + BTN_STYLE + '">Réinitialiser</button>', open, true);
        }
        function syncAccentInput(container, id) {
            const inp = container.querySelector('#' + id.replace('-theme-select', '') + '-accent');
            if (inp && !currentAccent()) inp.value = themeAccent();
        }
        function bindCustomize(container, prefix) {
            const q = (s) => container.querySelector('#' + prefix + s);
            const all = () => document.querySelectorAll('.vc-th-host').forEach(applyTheme);
            const acc = q('-accent'), apply = q('-accent-apply'), tgt = q('-accent-target'), font = q('-font'), lay = q('-layout'), cz = q('-cinzel'), reset = q('-perso-reset');
            // v6.60 : plus d'application en direct, bouton Appliquer (demande utilisateur).
            if (apply && acc) apply.addEventListener('click', (ev) => { ev.preventDefault(); GM_setValue('accentColor', acc.value); all(); });
            if (tgt) tgt.addEventListener('change', () => { GM_setValue('accentTarget', tgt.value); all(); });
            if (font) font.addEventListener('change', () => { GM_setValue('fontFamily', font.value); all(); });
            if (lay) lay.addEventListener('change', () => { GM_setValue('panelLayout', lay.value); all(); });
            if (cz) cz.addEventListener('change', () => { GM_setValue('titleCinzel', cz.checked); all(); });
            if (reset) reset.addEventListener('click', () => {
                GM_setValue('accentColor', ''); GM_setValue('accentTarget', 'cadre'); GM_setValue('fontFamily', 'theme'); GM_setValue('panelLayout', 'theme'); GM_setValue('titleCinzel', false);
                if (acc) acc.value = themeAccent();
                if (tgt) tgt.value = 'cadre';
                if (font) font.value = 'theme';
                if (lay) lay.value = 'theme';
                if (cz) cz.checked = false;
                all();
            });
        }
        function toggleButtonsHtml(prefix, autoNext, autoOpen) {
            ensureVcStyles();
            const t = (id, on, label) => '<label class="vc-track vc-small" title="' + (label === 'Ouverture auto' ? 'Ouvre le lecteur tout seul sur une page d\'episode' : 'Enchaine l\'episode suivant a la fin') + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="off">' + label + '</span><span class="on">&#10003; ' + label + '</span></label>';
            return '<div style="display:flex;gap:4px;">' + t(prefix + 'autonext' + (prefix === 'ed-' ? '-cb' : ''), autoNext, 'Enchaîner') +
                t(prefix + 'autoopen' + (prefix === 'ed-' ? '-cb' : ''), autoOpen, 'Ouverture auto') + '</div>';
        }
        // "Chargement... 42%" -> fine barre ; tout autre message reste en texte.
        function statusHtml(text) {
            const m = /^Chargement\.\.\.(?: (\d+)%)?$/.exec(text || '');
            if (!m) return escapeHtml(text || '');
            const pct = m[1] ? Number(m[1]) : 0;
            return '<div style="display:flex;align-items:center;gap:6px;" title="Chargement de la video"><div style="flex:1;height:4px;background:#333;border-radius:2px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:#03d0fc;"></div></div><span style="font-size:10px;color:#aaa;">' + pct + '%</span></div>';
        }
        function trackButtonHtml(id, checked) {
            ensureVcStyles();
            return '<label class="vc-track"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="off">&#9734; Suivre</span><span class="on">&#9733; Suivi</span></label>';
        }

        // Endpoint Apps Script (google-apps-script/incidents-collector.gs).
        // Tant que l'URL n'est pas collee, repli sur une issue GitHub
        // pre-remplie (depot public). Le "secret" n'en est pas un (il est
        // dans ce script public) : il ecarte seulement les bots generiques,
        // le vrai garde-fou est le quota journalier cote serveur.
        const INCIDENTS_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbyhbP6zqVXnReLV0mcwEWBF68w7zZBfe6DSD7u522SeXECVNzGiHux6FVD8yKEm2H3s/exec';
        const INCIDENTS_SHARED_SECRET = 'c9322995-95ba-4fca-a51f-1d67abd6ea96';
        let incidentDraft = '';
        // Message de resultat garde hors du DOM : le panneau est regenere
        // (ex. 1re verification des nouveaux episodes, 8s apres le
        // chargement) et effacait le "Merci, envoye !" en plein envoi.
        let incidentNote = { text: '', color: '#888' };
        function setIncidentNote(text, color) {
            incidentNote = { text: text, color: color };
            ['ep', 'ed'].forEach((prefix) => {
                const el = document.getElementById(prefix + '-fb-note');
                if (el) { el.textContent = text; el.style.color = color; }
            });
        }

        function incidentSectionHtml(prefix, open) {
            const draft = incidentDraft.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            return menuItem('incident', 'Signaler',
                '<select id="' + prefix + '-fb-type" style="width:100%;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                '<option>Bug</option><option>Vidéo ne se lance pas</option><option>Suggestion</option><option>Autre</option></select>' +
                '<textarea id="' + prefix + '-fb-body" aria-label="Description du problème" rows="4" placeholder="Ce que tu faisais, ce qui s\'est passe..." style="width:100%;box-sizing:border-box;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;resize:vertical;">' + draft + '</textarea>' +
                '<div style="font-size:10px;color:#888;">Envoye avec : site, anime, episode, version, navigateur.</div>' +
                '<button id="' + prefix + '-fb-send" style="' + BTN_STYLE + '">&#128228; Envoyer</button>' +
                '<span id="' + prefix + '-fb-note" style="font-size:11px;color:' + incidentNote.color + ';">' + incidentNote.text + '</span>', open);
        }

