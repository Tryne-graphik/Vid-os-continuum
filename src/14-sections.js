        // ---- Sections repliables + signalement d'incident (v6.8) ----
        const BTN_STYLE = 'background:#333;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

        function collapsibleSection(key, title, innerHtml, open, sub) {
            // sub : sous-menu (decale et plus clair, ex. Reglages > Plus).
            return '<details data-sec="' + key + '"' + (open ? ' open' : '') + ' style="padding-top:2px;' + '' + '">' +
                '<summary style="cursor:pointer;font-size:11px;font-weight:bold;color:#eee;background:' + (sub ? '#4a4a58' : '#3a3a46') + ';padding:6px 8px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</summary>' +
                '<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">' + innerHtml + '</div></details>';
        }

        // v7.4 : tout le CSS vient de css/ (base, agencements, themes), recopie ici par build.js ; seules les polices sont dynamiques.
        function vcCss() { return /*@@VC_CSS@@*/''; }
        function ensureVcStyles() {
            if (document.getElementById('vc-styles')) return;
            const st = document.createElement('style');
            st.id = 'vc-styles';
            st.textContent = vcCss() + themeFontCss();
            (document.head || document.documentElement).appendChild(st);
        }
