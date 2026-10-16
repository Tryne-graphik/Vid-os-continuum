        // ---- Themes (v7.4) : liste seulement. Couleurs, formes et signature de chaque theme : css/themes/<id>.css
        // (classe .vc-th-<id> sur l'hote) ; agencement par defaut : css/agencements/<layout>.css (attribut data-vc-layout).
        // font = police si "Police du theme" ; acc = accent par defaut (pipette de Personnaliser) ; light = theme clair.
        // fonction (pas de const) : ensureVcStyles peut tourner avant cette ligne.
        function themes() { return {
            stele: { label: 'Stèle de cultivation', layout: 'tablettes', font: 'Segoe UI', acc: '#03d0fc' },
            inspecteur: { label: 'Inspecteur', layout: 'liste', font: 'Segoe UI', acc: '#03d0fc' },
            linear: { label: 'Indigo', layout: 'onglets', font: 'Segoe UI', acc: '#5e6ad2' },
            groupes: { label: 'Graphite', layout: 'liste', font: 'Segoe UI', acc: '#0a84ff' },
            tonal: { label: 'Tonal', layout: 'rail', font: 'Segoe UI', acc: '#d0bcff' },
            parchemin: { label: 'Parchemin et sceaux', layout: 'liste', font: 'Cambria', acc: '#a8261f', light: true },
            jade: { label: 'Jade impérial', layout: 'tablettes', font: 'Segoe UI', acc: '#3fe0aa' },
            laque: { label: 'Laque noire et or', layout: 'liste', font: 'Bahnschrift', acc: '#d9a94a' },
            neon: { label: 'Verre néon', layout: 'rail', font: 'Segoe UI', acc: '#03d0fc', glass: true },
            nuit: { label: 'Nuit violette', layout: 'onglets', font: 'Segoe UI', acc: '#b46bff' },
            braise: { label: 'Braise', layout: 'tablettes', font: 'Segoe UI', acc: '#ff6a3d' },
            menthe: { label: 'Menthe néon', layout: 'tablettes', font: 'Segoe UI', acc: '#50ffbe', glass: true }
        }; }
        function layouts() { return { theme: 'Celui du thème', liste: 'Liste', tablettes: 'Tablettes', onglets: 'Onglets', rail: 'Rail d’icônes' }; }
        function currentLayout() {
            const l = GM_getValue('panelLayout', 'theme');
            return layouts()[l] && l !== 'theme' ? l : themes()[currentThemeId()].layout;
        }
        // Seule partie dynamique du CSS : polices (Cinzel livree via @resource ; chiffres de Georgia pris dans Cambria).
        function themeFontCss() {
            return '@font-face{font-family:"VC Georgia";src:local("Cambria");unicode-range:U+0030-0039;}@font-face{font-family:"VC Georgia";src:local("Georgia");}' +
                '@font-face{font-family:"VC Cinzel";src:' + themeTexUrl(['vcCinzel', 'cinzel.woff2']) + ' format("woff2");font-weight:400 900;font-display:swap;}';
        }
