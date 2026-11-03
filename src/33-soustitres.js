        // ---- Sous-titres FR : démarrer / arrêter le service local (traduction/serve.js, 127.0.0.1:8787) + voyant d'état (v7.12).
        // Démarrage : lien videocontinuum:// (lanceur Windows, traduction/installer-lanceur.ps1) ; arrêt et état : requêtes HTTP.
        // Un seul sondage (toutes les 3 s) alimente tous les panneaux : voyant dans l'onglet, détail dans le volet, notification de fin,
        // démarrage automatique quand le lecteur passe sur YouTube, bouton « Traduire cet épisode », coût du mois.
        const SUBS_URL = 'http://127.0.0.1:8787/';
        function subsMon() { return subsMon.m || (subsMon.m = { uis: [], st: null, prevRun: [], starting: 0, autoAt: 0, pendingId: '', timer: 0 }); }
        function subsYtId() {
            const f = document.getElementById('ed-player-frame');
            const m = f && String(f.src || '').match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/);
            return m ? m[1] : '';
        }
        function subsStart() {
            subsMon().starting = Date.now() + 15000;
            const a = document.createElement('a'); a.href = 'videocontinuum://start'; a.click(); // 1re fois : le navigateur demande d'autoriser le lien
        }
        function subsToast(text) {
            const d = document.createElement('div');
            d.textContent = text;
            d.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:2147483647;background:rgba(20,20,28,.92);color:#fff;font:600 13px Arial,sans-serif;padding:8px 14px;border-radius:6px;border:1px solid #43a047;pointer-events:none;';
            document.body.appendChild(d);
            setTimeout(() => d.remove(), 6000);
        }
        const subsMmss = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
        function subsView(st) { // -> { color, text, extra }
            const m = subsMon();
            if (!st) return { color: '#777', text: Date.now() < m.starting ? 'Démarrage…' : 'Service éteint', extra: '' };
            const bad = st.jobs.find((j) => j.failed), run = st.jobs.find((j) => !j.failed);
            if (bad) return { color: '#e53935', text: 'Erreur de traduction', extra: bad.err.slice(-120) };
            if (!st.key) return { color: '#e53935', text: 'Clé DeepSeek absente', extra: 'Variable DEEPSEEK_API_KEY non définie' };
            if (run) {
                const eta = run.done > 0 && run.total ? ' · reste ~' + subsMmss(run.sec / run.done * (run.total - run.done)) : '';
                return { color: '#fb8c00', text: 'Traduction en cours', extra: (run.total ? 'bloc ' + run.done + '/' + run.total : 'préparation') + ' · ' + subsMmss(run.sec) + eta };
            }
            return { color: '#43a047', text: 'Service prêt', extra: '' };
        }
        function subsCost(st) {
            const u = st && st.usage; if (!u) return '';
            const k = u.tokIn + u.tokOut;
            return 'Ce mois : ' + (k >= 1e6 ? (k / 1e6).toFixed(2) + ' M' : Math.round(k / 1e3) + ' k') + ' tokens · ≤ ' + u.usd.toFixed(3).replace('.', ',') + ' $ (tarif heures pleines)';
        }
        async function subsTick() {
            const m = subsMon();
            let st = null;
            try { const r = await gmRequest({ method: 'GET', url: SUBS_URL + 'status', timeout: 2500 }); if (r.status === 200) st = JSON.parse(r.responseText); } catch (e) {}
            m.st = st;
            if (st) m.starting = 0;
            // fin de traduction : une tâche suivie a disparu sans échec
            const run = st ? st.jobs.filter((j) => !j.failed).map((j) => j.id) : [];
            if (st && !st.jobs.some((j) => j.failed) && m.prevRun.some((id) => run.indexOf(id) < 0)) subsToast('✓ Sous-titres FR prêts');
            m.prevRun = run;
            // démarrage automatique : le lecteur est sur YouTube et le service éteint (au plus un essai par minute)
            if (!st && subsYtId() && GM_getValue('subsAuto', true) === true && Date.now() > m.autoAt && Date.now() > m.starting) { m.autoAt = Date.now() + 60000; subsStart(); }
            // « Traduire cet épisode » demandé pendant que le service était éteint
            if (st && m.pendingId) { const id = m.pendingId; m.pendingId = ''; gmRequest({ method: 'GET', url: SUBS_URL + 'sub?v=' + id + '&t=0', timeout: 8000 }).catch(() => {}); }
            const v = subsView(st), cost = subsCost(st);
            m.uis = m.uis.filter((u) => { if (u.root.isConnected) u.seen = true; return u.root.isConnected || !u.seen; }); // rattaché après bindSubs : on ne retire qu'un panneau vu puis disparu
            m.uis.forEach((u) => {
                u.dot.style.background = v.color; u.txt.textContent = v.text; u.prog.textContent = v.extra; u.cost.textContent = cost;
                u.tabDot.style.background = v.color;
                u.bStart.disabled = !!st; u.bStop.disabled = !st;
            });
            if (!m.uis.length) { clearInterval(m.timer); m.timer = 0; }
        }
        function subsSectionHtml(prefix) {
            return menuItem('soustitres', 'Sous-titres',
                '<div class="vc-row" style="align-items:center;gap:6px;"><span id="' + prefix + '-subs-dot" style="width:11px;height:11px;border-radius:50%;background:#777;flex:0 0 auto;"></span><span id="' + prefix + '-subs-txt" style="font-size:12px;">Service : ...</span></div>' +
                '<div id="' + prefix + '-subs-prog" class="vc-note"></div>' +
                '<div class="vc-row"><button id="' + prefix + '-subs-start" title="Lance le service de traduction (nécessite le lanceur : traduction/installer-lanceur.ps1)">Démarrer</button>' +
                '<button id="' + prefix + '-subs-stop" class="vc-danger" title="Arrête le service et les traductions en cours">Arrêter</button></div>' +
                '<button id="' + prefix + '-subs-now" title="Lance tout de suite la traduction de la vidéo YouTube du lecteur (démarre le service si besoin)">Traduire cet épisode</button>' +
                '<label class="vc-track" title="Quand le lecteur passe sur YouTube et que le service est éteint, le démarrer tout seul"><input type="checkbox" id="' + prefix + '-subs-auto"' + (GM_getValue('subsAuto', true) === true ? ' checked' : '') + '><span class="off">Démarrage automatique</span><span class="on">&#10003; Démarrage automatique</span></label>' +
                '<div id="' + prefix + '-subs-cost" class="vc-note"></div>' +
                '<span class="vc-note">Gris : éteint · Vert : prêt · Orange : traduction en cours · Rouge : erreur</span>');
        }
        function bindSubs(root, prefix) {
            const q = (k) => root.querySelector('#' + prefix + '-subs-' + k);
            const ui = { root: root, seen: false, dot: q('dot'), txt: q('txt'), prog: q('prog'), cost: q('cost'), bStart: q('start'), bStop: q('stop') };
            if (!ui.dot) return;
            const m = subsMon();
            // voyant aussi sur l'onglet : visible sans ouvrir le volet (y compris dans le lecteur plein écran)
            const tab = root.querySelector('.vc-tab[data-menu="soustitres"]');
            ui.tabDot = document.createElement('span');
            ui.tabDot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#777;margin-left:5px;flex:0 0 auto;';
            if (tab) tab.appendChild(ui.tabDot);
            ui.bStart.addEventListener('click', () => { subsStart(); ui.txt.textContent = 'Démarrage…'; });
            ui.bStop.addEventListener('click', () => { gmRequest({ method: 'POST', url: SUBS_URL + 'stop', timeout: 2500 }).catch(() => {}); setTimeout(subsTick, 800); });
            q('now').addEventListener('click', () => {
                const id = subsYtId();
                if (!id) { ui.prog.textContent = 'Aucune vidéo YouTube dans le lecteur : ouvre l\'épisode via la source YouTube.'; return; }
                m.pendingId = id;
                if (!m.st) subsStart();
                subsTick();
            });
            q('auto').addEventListener('change', (e) => GM_setValue('subsAuto', e.target.checked));
            m.uis.push(ui);
            if (!m.timer) m.timer = setInterval(subsTick, 3000);
            subsTick();
        }
