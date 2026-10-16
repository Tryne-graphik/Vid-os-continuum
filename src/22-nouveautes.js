        // ---- Nouveautes (v6.18) : encart repliable, ouvert d'office tant
        // que la version installee n'a pas ete "vue" (ouverture de l'encart).
        const CHANGELOG = [
            ['7.4', ['Chaque thème reprend maintenant l’agencement de sa maquette : menus en liste (Parchemin, Laque, Inspecteur, Graphite), en tablettes (Stèle, Jade, Braise, Menthe), en onglets (Indigo, Nuit violette) ou en rail d’icônes à gauche (Tonal, Verre néon).',
                'Nouveau réglage « Agencement » (Personnaliser) : garder celui du thème ou en choisir un autre.',
                'Un seul menu ouvert à la fois ; le bouton principal (Regarder, Plein écran) a enfin la couleur de chaque thème ; Fin intro ici / Début outro ici redeviennent verts une fois réglés.',
                'Thème Parchemin : numéro d’épisode, version et (!) bien lisibles sur le fond clair.']],
            ['7.3', ['Chaque thème a maintenant sa propre allure : forme des boutons, bouton principal, police des titres, cadre. Seuls les 12 nouveaux thèmes restent (les anciens sont retirés ; un ancien choix passe sur Stèle de cultivation).',
                'Police : nouveau choix « Police du thème », par défaut (Personnaliser).',
                'Libellés plus clairs : Regarder, Mes séries, Nouveaux épisodes, Enchaîner, Ouverture auto, Fin intro ici, Début outro ici, Avancé, Réglages par série, Ne plus suivre, Fichier de sauvegarde, Redonner l’accès, Afficher : à rattraper.',
                'Police Georgia : les chiffres sont maintenant pris dans Cambria et restent alignés (le 5 et le 9 ne descendent plus sous la ligne).']],
            ['7.2', ['Nouveau look : le panneau est rangé en cartes (épisode, suivi) et les menus deviennent des tablettes ; un seul menu s\'ouvre à la fois, encadré et dans la couleur d\'accent.',
                '12 nouveaux thèmes (Réglages > Plus > Affichage) : Stèle de cultivation (par défaut), Inspecteur, Indigo, Graphite, Tonal, Parchemin et sceaux, Jade impérial, Laque noire et or, Verre néon, Nuit violette, Braise, Menthe néon. Les anciens thèmes restent disponibles.']],
            ['7.1', ['Ligne « Source » sous le numéro d\'épisode (bleu = lecteur du site, rouge = YouTube) avec un bouton Changer : une seule fenêtre pour les lecteurs du site, le même épisode sur les autres sites et les vidéos YouTube. Remplace le volet Sources du lecteur.',
                'Recherche YouTube : le nom de la série doit apparaître en entier (« The Demon Hunter\'s Romance », une série live, n\'est plus proposée pour « The Demon Hunter »), les vidéos d\'une autre saison sont écartées, et un épisode deux fois trop long ou trop court aussi (si la durée est connue).']],
            ['7.0', ['Version de recette complète : sauvegarde plus sûre (les noms comme "Re:Zero" et les séries exclues ne se perdent plus à la restauration ; un fichier contenant seulement des réglages s\'importe).', 'Sécurité : un fichier de sauvegarde piégé ne peut plus injecter de code ; le lecteur n\'écoute plus que le calque.', 'Plus fluide : vérification des nouveaux épisodes 4 séries à la fois et jamais en onglet caché, moins d\'écritures pendant la lecture.', 'Clavier : Échap ferme la fenêtre du dessus, puis le lecteur ; le focus va dans la fenêtre ouverte.', 'Panneau : accents corrigés, Réglages fermés hors épisode (plus de défilement en 1366x768), Nouveautés limitées aux 5 dernières versions, message clair quand le filtre masque tout.']],
            ['6.66', ['Le panneau reste ferme (ou ouvert) d\'une page a l\'autre : il ne reapparait plus a chaque rechargement.', 'Nouveautes fermees par defaut : le (!) jaune signale une nouvelle version, a ouvrir si besoin.']],
            ['6.65', ['Opera (Tampermonkey) : les boutons du panneau, Importer, Historique, le suivi et les Fiches ne reagissaient pas. Corrige.']],
            ['6.64', ['Nouveau bouton "\u2713 Deja vu" dans la Fiche : icone grise (3 coches) sur les vignettes des series vues avant le script. Une serie suivie garde son icone de suivi.']],
            ['6.63', ['Nouvelle icone "Pas aime" (orange, 3 croix) sur les vignettes : bouton "\uD83D\uDC4E Pas aime" dans la Fiche, pour se souvenir d\'une serie qu\'on n\'a pas aimee (suivie ou non). Re-cliquer pour la retirer.']],
            ['6.62', ['Fiche : synopsis en francais retrouve depuis les vignettes d\'episode d\'Esprit Donghua (lu sur la page de la serie).', 'Fiche : genres et note aussi pour les series AniList sans fiche MyAnimeList (beaucoup de donghua), en essayant le nom romanise puis le nom anglais.']],
            ['6.61', ['Bouton "ℹ Fiche" sur toutes les vignettes (Esprit Donghua, Animoflix, sites ajoutes) : synopsis, genres et note par-dessus la page, sans lancer l\'episode.', 'Anime-Sama : le bouton Fiche des vignettes ouvre aussi la fiche sur place (lien "Page de l\'anime" dedans).', 'Une fiche deja ouverte se reaffiche tout de suite ; rien n\'est enregistre pour les series non suivies.']],
            ['6.60', ['Personnaliser : "Accent" devient "Couleur", avec un bouton Appliquer (la couleur ne change plus pendant le choix).', 'Nouvelle liste "Appliquer a" : cadre du panneau (par defaut), titres des sections, cases cochees, ou tout.']],
            ['6.59', ['Series en memoire mieux reperables sur les pages des sites : cadre de couleur autour de la vignette (meme couleur que l\'icone, agrandie).', 'Option "Estomper les séries suivies" (panneau du site, Reglages > Plus > Affichage) : les series deja en memoire sont grisees, les nouveautes ressortent ; nettes au survol.', 'Reglages > Plus > Personnaliser : couleur d\'accent (avec pipette), police du panneau (6 polices Windows), titres en Cinzel, bouton Reinitialiser.']],
            ['6.58', ['Lisibilite (12 pistes) : police Segoe UI 12 px demi-gras ; boutons sur plaques pleines et textures adoucies ; verre trempe fume (texte lisible sur scene claire) ; titres de sections en simples intitules ; couleurs d\'accent adoucies ; plus de noir ni de blanc purs.', 'Cartes des sites : etat avec icone et mot (● 2 a rattraper, ✓ a jour). Zones de clic d\'au moins 24 px, contour clavier visible sur tous les themes.', 'Option "Panneau discret en lecture" (Reglages > Plus > Affichage) : le panneau s\'efface apres 4 s sans souris et revient au survol.']],
            ['6.57', ['Retours de recette : nom de la serie sur 2 lignes si besoin, bouton "ℹ Fiche" sur la ligne de l\'episode, numero de version cliquable pour verifier les mises a jour.', '"↻ Verifier les nouveaux episodes" de nouveau sur une ligne entiere ; Reglages : Fin intro | Début outro | Plus, et Plus range en 3 groupes (Intro / outro, Affichage, Page).', 'Croix ✕ sur Nouveautes pour la masquer jusqu\'a la prochaine version.', 'Themes plus lisibles (texte teinte, semi-gras, ombre) ; panneau agrandi automatiquement sur grand ecran (1440p, 4K).']],
            ['6.56', ['Themes du panneau (Reglages > Plus > Theme) : Metallique, Fibre de carbone, Verre trempe, Pierre noire, Pierre bleue, ou Actuel. Une couleur d\'accent par theme ; le lecteur et le panneau du site suivent le meme theme.']],
            ['6.55', ['Reglages ouvert par defaut (Fin intro / Début outro toujours visibles).', 'Afficher l\'etat AniSkip deplace dans Reglages > Plus, en bouton comme les autres ; Plus aligne sur les autres sections.']],
            ['6.54', ['Correctif : la 6.53 ne se lancait pas (erreur de syntaxe).']],
            ['6.53', ['Nom de la serie et numero d\'episode un peu plus petits.']],
            ['6.52', ['Panneau plus compact (tient sur un ecran 1080p) : Plein écran / Fermer, Prec. / N° / Aller / Suiv., Nouveaux ep. / Historique et Signaler / Legende sur une meme ligne ; Fiche de l\'anime = bouton ℹ a cote du nom ; Vérifier MAJ dans Nouveautes ; Suivre | Historique ; liste des series + ↻ (verifier les nouveaux episodes) ; Reglages | Sources, Sauvegarde | Nouveautes, Exporter | Importer, YouTube | Source du site.', 'Tous les boutons a la meme taille (Suivre, Plein écran, Fermer, Aller... etaient plus gros).', 'Ligne AniSkip masquee par defaut (Reglages > Afficher l\'etat AniSkip) et raccourcie : AniSkip ✓ / ✗, detail au survol.']],
            ['6.51', ['Clavier : Echap ferme les fenetres (fiche, reglages, historique, suivi) ; cases Suivre, vignettes YouTube, lignes du resume et bouton Fiche utilisables au clavier (Tab, Entree).', 'Lecteurs d\'ecran : champs et listes etiquetes, statut et compte a rebours annonces.']],
            ['6.50', ['Fenetre de suivi : la saison vue est affichee apres le nom (Anime-Sama, Animoflix, myfluneo), ex. "Clevatess · Saison 2".', 'Fenetre "Mes animes" et petit bouton ▶ retires des autres sites. "Ajouter ce site" devient une commande directe du menu Tampermonkey (depuis la page d\'un episode).', 'Sauvegarde complete : en plus de la progression et de l\'historique, le fichier garde les series abandonnees / en attente, les reglages intro/outro, les chaines YouTube, les sites ajoutes, les reprises et les preferences (restaures a l\'import, sans ecraser ceux deja presents).']],
            ['6.49', ['Nouvelles saisons detectees pour les series en attente (pause) sur Anime-Sama, Animoflix et myfluneo : la serie repasse en nouvel episode avec un bouton "Regarder (Saison N)" dans la fenetre de suivi.', 'Anime-Sama / myfluneo : des qu\'un episode de la nouvelle saison est vu, l\'ancienne saison est retiree du suivi (elle reste dans l\'historique).']],
            ['6.48', ['Nouvel etat "Saison finie, en attente" (violet, 3 cases cochees) : bouton pause dans la fenetre de suivi d\'un site. La serie n\'est plus comptee "a rattraper" et repasse toute seule en nouvel episode quand la suite sort (sites qui continuent la numerotation, ex. Esprit Donghua).', 'Icones des vignettes plus petites (24 px).', 'Section "Legende des icones" dans le panneau.']],
            ['6.47', ['Animoflix : plus de 2e icone au milieu de certaines vignettes (elle se posait sur le petit drapeau de langue).']],
            ['6.46', ['Animoflix : icone de suivi des vignettes en bas a droite aussi (meme etiquette Anime qui la cachait).']],
            ['6.45', ['Anime-Sama : icone de suivi des vignettes deplacee en bas a droite (l\'etiquette "Anime" du site la cachait).']],
            ['6.44', ['Boutons Épisode précédent / suivant places sous la barre de lecture, dans la rangee des commandes (entre le temps et les reglages).']],
            ['6.43', ['Verification des nouveaux episodes : les series importees d\'une ancienne sauvegarde (Esprit Donghua) retrouvent leur page serie par la recherche du site au lieu d\'une erreur "Refused to connect to legacy:".']],
            ['6.42', ['Boutons Épisode précédent / suivant plus petits et plus bas, juste au-dessus de la barre de lecture.']],
            ['6.41', ['Pastilles des vignettes remplacees par une petite icone liste a cases, cases a la couleur de l\'etat, 1re case cochee (croix pour les series exclues), la coche se dessine a l\'apparition.']],
            ['6.40', ['Pastille ✓ sur les vignettes des sites : verte = suivi ici, turquoise = nouvel episode a voir, jaune = suivi sur un autre site, rouge = exclu du suivi.']],
            ['6.39', ['Boutons Épisode précédent / suivant deplaces en bas au centre, au-dessus de la barre de lecture.',
                'Le bouton Suivant reste visible (grise, "Pas encore sorti") sur le dernier episode sorti.',
                'Video sans choix de qualite (fichier d\'origine) qui cale : bascule directe sur YouTube au lieu de recharger.']],
            ['6.38', ['Boutons Épisode précédent / suivant sur la video, a gauche et a droite du centre : ils apparaissent quand la souris bouge et disparaissent apres 3 s.',
                'Vignettes YouTube : badge VOSTFR (annonce dans le titre) ou ST auto FR (sous-titres traduits automatiquement par YouTube).',
                'Lecture sur YouTube : "Prec." revient a l\'episode precedent au lieu d\'afficher "Aucun episode precedent".']],
            ['6.37', ['Recherche YouTube : essaie aussi le nom anglais de la serie et "EP N" - trouve les compilations (ex. "EP 181 - EP 200") qui ne citent pas le numero cherche.',
                'Lecteur YouTube : le bouton "Plus de videos" est masque (il cachait les reglages).',
                'Épisode suivant sur YouTube : ne retombe plus sur le site quand YouTube affiche sa page de consentement aux cookies.']],
            ['6.36', ['"Trouver sur YouTube" cherche tout seul et propose les videos en vignettes (plus de lien a coller) ; la chaine choisie est retenue pour les episodes suivants.', 'Compilations YouTube : le debut de chaque episode est lu dans les chapitres de la video quand elle en a (sinon estime).']],
            ['6.35', ['Recherche YouTube : les videos aux sous-titres anglais incrustes dans l\'image (pas traduisibles en francais) ne sont plus proposees.']],
            ['6.34', ['Video qui cale ou episode indisponible : l\'encadre cherche tout seul l\'episode sur YouTube et affiche les resultats (nom de la serie + numero, VOSTFR en premier). Un clic lance la video et retient la chaine : les prochains episodes qui calent y basculent automatiquement.',
                'Titres YouTube "Episode 243" reconnus (avant : seulement "EP 243").']],
            ['6.33', ['Video qui cale au changement d\'episode : un nouvel essai est fait automatiquement avant d\'afficher l\'encadre "Reessayer".',
                'Choix automatique de la qualite Odysee et case 720p supprimes (Odysee le refuse sans compte : petite fenetre rouge). Avec un compte, regler la qualite sur odysee.com/$/settings.']],
            ['6.32', ['Esprit Donghua a change ses adresses d\'episodes (numerotation par saison) : les series suivies dont l\'adresse ne marchait plus sont retrouvees et corrigees toutes seules, la detection des nouveaux episodes remarche.',
                'Plus d\'encadre jaune "elements tiers suspects" : le detail reste dans la console (F12).']],
            ['6.31', ['Épisode suivant : le decompte commence 4 s avant le debut de l\'outro et enchaine 2 s apres (la derniere replique n\'est plus coupee). Sans outro reglee : decompte sur les 4 dernieres secondes, enchainement a la fin.',
                'Decompte en bas a droite (ne cache plus les sous-titres) avec "Suivant maintenant" a cote d\'"Annuler".',
                'Boutons "Fin intro" / "Début outro" verts quand c\'est regle pour la serie (a la main ou par AniSkip), gris sinon.']],
            ['6.30', ['Numero d\'episode plus gros, chargement en fine barre (les messages d\'erreur restent en texte).',
                '"Lecture continue" et "Lecteur auto" deviennent des boutons comme "Suivi" ; 720p rangee dans Reglages > Plus (sous-menu decale).',
                'Sites tout en bas en petits boutons toujours visibles, avec le choix du mode d\'ouverture juste dessous.']],
            ['6.29', ['Panneaux allégés : boutons principaux en haut, liste par site tout en bas, titres de menus sur fond gris, Réglages réduits à Fin intro / Début outro (le reste dans "Plus"), Odysee et YouTube regroupés dans "Autres sources".',
                '"Suivre cet anime" devient un gros bouton, décoché par défaut pour un nouvel anime (la saison suivante d\'un anime suivi reste suivie). Nouveau "Historique" : une ligne par série regardée, suivie ou non, avec Reprendre / Suivre / croix ; doublons entre sites en rouge.',
                'Par défaut, seuls les sites avec des animes à rattraper sont affichés ; ligne "doublons" quand un anime est suivi sur deux sites.',
                '"Aller" à l\'épisode : corrigé pour les épisodes 1 à 9 d\'Esprit Donghua (zéro devant), ne bloque plus sur un "dernier connu" périmé, et cherche dans la liste de la série si l\'adresse devinée n\'existe pas.']],
            ['6.28', ['"Revenir a la source du site" relit la page de l\'episode : Suivant / Precedent remarchent (avant : "Aucun episode suivant detecte").']],
            ['6.27', ['YouTube sans cle API : "Lire sur YouTube" (ou bouton "Trouver sur YouTube") demande une seule fois le lien d\'une video de la serie, puis trouve l\'episode, meme dans une compilation de 10 ou 20 episodes, avec les sous-titres traduits en francais.',
                'Quand la video cale chez l\'hebergeur, bascule automatique sur YouTube si une chaine est associee ; la serie reste sur YouTube ensuite ("Revenir a la source du site" pour annuler). Le suivi avance tout seul pendant une compilation.']],
            ['6.26', ['Si la video cale chez l\'hebergeur (fichier trop lourd ou mal prepare, cas de certaines chaines Odysee pour Wan Jie Du Zun), un encadre l\'explique et propose : Reessayer, Chercher sur YouTube, Rechercher sur Google, Épisode suivant.']],
            ['6.25', ['Plus de message "@connect" dans la console : les nouveaux episodes des sites ajoutes ne sont verifies que depuis ces sites.']],
            ['6.24', ['Odysee : un meme anime publie par plusieurs chaines (ou avec des titres differents) ne cree plus plusieurs lignes de suivi. Les doublons existants sont fusionnes une fois, en gardant le plus ancien episode vu.']],
            ['6.23', ['Fiche de l\'anime sur tous les sites (bouton \u2139 dans le lecteur, le panneau et la fenetre de suivi) : synopsis en francais quand le site le fournit (sinon AniList en anglais), genres, tags sans spoilers, note, nombre d\'episodes, statut et prochain episode.',
                'Sites ajoutes : la verification des nouveaux episodes n\'etait pas autorisee par Tampermonkey, corrige.']],
            ['6.22', ['"Ajouter ce site" (fenetre \u25B6 Mes animes, depuis la page d\'un episode) : le lecteur, le suivi, la reprise, l\'enchainement et AniSkip sur un site non prevu. Teste sur french-anime.com et myfluneo.eu. Menu Tampermonkey : "Retirer ce site".']],
            ['6.21', ['Lecteur de secours automatique : si le lecteur d\'un episode est mort (ex. "video not found"), le lecteur suivant de la page est essaye tout seul.',
                'Si aucun lecteur ne marche, un encadre explique que c\'est le site (video supprimee, hebergeur en panne) et non Video Continuum, cherche tout seul le meme episode sur l\'autre site (Anime-Sama / Animoflix), et propose "Rechercher sur Google" et "Épisode suivant".',
                'Les lecteurs d\'autres hebergeurs (ex. lecteur 2 d\'animoflix) peuvent etre pilotes.',
                'Odysee : la verification des nouveaux episodes n\'etait plus autorisee, corrige.']],
            ['6.20', ['Animoflix : le lecteur fonctionne de nouveau (le site est passe de Sibnet, ferme, a ansembed).']],
            ['6.19', ['Section "Sites" : un bouton par site gere (Esprit Donghua, Animoflix, Anime-Sama, Odysee) + choix "Ouvrir dans" : nouvel onglet, nouvelle fenetre ou cet onglet.',
                '"Mes animes" disponible sur TOUS les sites : petit bouton \u25B6 en bas a gauche (ou menu Tampermonkey) qui liste tes animes suivis avec "Reprendre", sans quitter ta page. Le bouton se masque via le menu Tampermonkey.']],
            ['6.18', ['Bouton \u2139 Fiche sur les vignettes d\'Anime-Sama : ouvre la page de l\'anime (synopsis, genres) au lieu de l\'episode.',
                'AniSkip : intro, resume et generique de fin sautes automatiquement quand la communaute AniSkip a les temps de l\'episode (ligne "AniSkip" dans le lecteur, "Changer" si le mauvais anime est reconnu). Tes reglages manuels restent prioritaires : vide-les dans Configuration pour laisser AniSkip faire.',
                'Cet encart Nouveautes.']],
            ['6.17', ['Titre "Video Continuum" centre, version en jaune.']],
            ['6.16', ['Bouton "\u2713 Tout vu" dans la fenetre de suivi d\'un site.']],
            ['6.15', ['Intro et outro avec debut ET fin (resume avant le generique, episode qui continue apres le generique de fin).',
                'Croix \u2715 pour abandonner le suivi d\'un anime.',
                'Encadre "Deja vu jusqu\'a l\'ep. N sur un autre site".',
                'Panneau descendu pour laisser voir le haut du site.']],
            ['6.14', ['Reprise de la lecture la ou tu t\'etais arrete.']]
        ];
        function currentScriptVersion() { return (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?'; }
        function newsSectionHtml(prevOpen, prefix) {
            if (GM_getValue('newsHiddenFor', '') === currentScriptVersion()) return '';
            const unseen = GM_getValue('lastSeenVersion', '') !== currentScriptVersion();
            // v7.0 : 5 dernieres versions seulement (tout l'historique faisait ~9000 px).
            const body = CHANGELOG.slice(0, 5).map(([v, items]) => '<div style="font-size:11px;color:#ccc;"><b style="color:#ffd400;">v' + v + '</b><ul style="margin:2px 0 0 16px;padding:0;">' +
                items.map((t) => '<li style="margin:2px 0;">' + escapeHtml(t) + '</li>').join('') + '</ul></div>').join('') +
                '<a href="https://github.com/Tryne-graphik/Vid-os-continuum/blob/master/HISTORIQUE.md" target="_blank" rel="noopener" style="font-size:11px;color:#03d0fc;">Tout l\'historique des versions</a>' +
                '<button id="' + prefix + '-check-update-btn" title="Ouvre la page d\'installation du script - Tampermonkey indique lui-meme si une mise a jour est disponible" style="' + BTN_STYLE + '">&#128260; Vérifier MAJ</button>';
            // v7.4 : element de menu ; le bouton Masquer est dans le volet.
            return menuItem('nouveautes', 'Nouveautés', body + '<button class="vc-news-x" title="Masquer jusqu’à la prochaine version">&#10005; Masquer jusqu’à la prochaine version</button>', { badge: unseen ? '(!)' : '' });
        }
        function bindNewsSection(container) {
            const tab = container.querySelector('.vc-tab[data-menu="nouveautes"]');
            if (tab) tab.addEventListener('click', () => {
                GM_setValue('lastSeenVersion', currentScriptVersion());
                document.querySelectorAll('.vc-tab[data-menu="nouveautes"] .vc-badge').forEach((b) => b.remove());
            });
            const x = container.querySelector('.vc-news-x');
            const hide = (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                GM_setValue('newsHiddenFor', currentScriptVersion());
                GM_setValue('lastSeenVersion', currentScriptVersion());
                document.querySelectorAll('[data-menu="nouveautes"]').forEach((n) => n.remove());
            };
            if (x) x.addEventListener('click', hide);
        }

        function bindIncidentSection(container, prefix) {
            const body = container.querySelector('#' + prefix + '-fb-body');
            const sendBtn = container.querySelector('#' + prefix + '-fb-send');
            if (!body || !sendBtn) return;
            body.addEventListener('input', () => { incidentDraft = body.value; });
            sendBtn.addEventListener('click', () => {
                const description = body.value.trim();
                if (!description) { alert('Ecris un message avant d\'envoyer.'); return; }
                const statusEl = document.getElementById('ed-status');
                const report = {
                    action: 'incident', secret: INCIDENTS_SHARED_SECRET,
                    type: container.querySelector('#' + prefix + '-fb-type').value,
                    site: currentEpisode ? currentEpisode.siteLabel : site.label,
                    anime: currentEpisode ? currentEpisode.seriesName : '',
                    episode: currentEpisode ? String(currentEpisode.episodeNumber || '') : '',
                    description: description,
                    version: (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?',
                    browser: navigator.userAgent,
                    page: location.href,
                    playerStatus: lastStatusText
                };
                if (INCIDENTS_ENDPOINT_URL.indexOf('PASTE_') === 0) {
                    const ctx = '\n\n---\nType : ' + report.type + '\nSite : ' + report.site + '\nAnime : ' + report.anime + ' (ep ' + report.episode + ')\nVersion : ' + report.version + '\nNavigateur : ' + report.browser + '\nPage : ' + report.page;
                    window.open('https://github.com/Tryne-graphik/Vid-os-continuum/issues/new?title=' + encodeURIComponent('[' + report.type + '] ' + report.anime) + '&body=' + encodeURIComponent(description + ctx), '_blank');
                    return;
                }
                sendBtn.disabled = true; sendBtn.textContent = 'Envoi...';
                // anonymous : sans les cookies Google du navigateur - avec plusieurs
                // comptes Google connectes, Apps Script renvoie une page HTML au
                // lieu du JSON ("reponse serveur inattendue", v6.13).
                gmRequest({ method: 'POST', url: INCIDENTS_ENDPOINT_URL, data: JSON.stringify(report), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, timeout: 20000, anonymous: true })
                    .then((res) => {
                        let json = null;
                        try { json = JSON.parse(res.responseText); } catch (e) {}
                        if (!json || json.status !== 'ok') {
                            console.log('[AnimeTracker v6] reponse incident inattendue', res.status, res.finalUrl, (res.responseText || '').slice(0, 500));
                            throw new Error(json && json.message ? json.message : 'reponse serveur inattendue, statut ' + res.status);
                        }
                        setIncidentNote('Merci, envoye !', '#4caf50');
                        incidentDraft = '';
                        ['ep', 'ed'].forEach((p2) => { const b = document.getElementById(p2 + '-fb-body'); if (b) b.value = ''; });
                    })
                    .catch((e) => { setIncidentNote('Echec de l\'envoi (' + ((e && e.message) || 'reseau') + ') - reessaie plus tard.', '#f66'); })
                    .then(() => { sendBtn.disabled = false; sendBtn.innerHTML = '&#128228; Envoyer'; });
            });
        }

