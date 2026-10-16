
// CONTEXTE (2026-09-21) : v4 (esprit-donghua-suivi-progression-v4.user.js,
// reste intact et INDEPENDANT sur le disque) gere esprit-donghua.xyz/Odysee.
// Ce script (v6) reprend son architecture qui a fait ses preuves (calque
// plein ecran jamais recree + second script injecte DANS l'iframe du
// lecteur natif pour piloter la vraie balise <video>) et la generalise a
// 3 "sites" par un systeme d'adaptateurs (SITES ci-dessous), chacun sachant
// juste extraire depuis sa page : nom de serie, numero d'episode, URL
// d'embed du lecteur, et comment passer a l'episode suivant/precedent.
//
// Differences structurelles trouvees en etudiant les 2 nouveaux sites
// (recherche HTML brute, pas encore de test en navigateur reel) :
//  - animoflix.to : une vraie page par episode (comme esprit-donghua),
//    liens suivant/precedent en HTML (`a.ep-nav-btn.next-btn` /
//    `a.ep-nav-btn[aria-label="Épisode précédent"]`). Mais 2-3 hebergeurs
//    video au choix par episode (video.sibnet.ru, ansembed.net, parfois
//    sendvid.com) exposes dans un <select id="epLecteurSelect"> - ce
//    script v1 ne gere QUE video.sibnet.ru (demande explicite de
//    l'utilisateur), ignore les episodes qui n'y sont pas disponibles.
//  - anime-sama.to : PAS de page par episode - une seule page par
//    saison/langue, avec un tableau JS (eps1/eps2/eps3...) listant les URLs
//    de TOUS les episodes de la saison pour chaque "lecteur". Changer
//    d'episode = changer d'index dans ce tableau (deja charge, aucune
//    requete reseau necessaire pour avancer), pas une vraie navigation de
//    page. Consequence : pas d'URL par episode a stocker - ce script
//    construit sa propre URL de reprise avec un suffixe `#ep=N` (ignore par
//    le site, relu par nous au chargement pour rouvrir directement cet
//    episode).
//  - video.sibnet.ru : lecteur Video.js standard (contrairement au lecteur
//    React maison d'Odysee) - la balise <video> existe DEJA dans le HTML
//    au chargement (pas seulement apres un clic comme sur Odysee), mais la
//    lecture ne demarre pas seule (`autoplay:false`) : il faut quand meme
//    simuler un clic sur le gros bouton central `.vjs-big-play-button`.
//    Piege trouve en concevant ce script (pas encore teste) : la boucle de
//    clic automatique de v4 s'arretait des que la balise <video> EXISTE
//    (videoFound) - correct pour Odysee (le clic LA fait apparaitre), mais
//    faux ici puisque la balise existe direct et la lecture n'a toujours
//    pas demarre. Corrige en arretant la boucle sur l'evenement `play` de
//    la video (playbackStarted) plutot que sur sa simple existence dans le
//    DOM - voir runInsidePlayerFrameGeneric().
//  - (v6.33 : choix auto de la qualite Odysee supprime - refuse sans compte.)
//
// RIEN DE TOUT CA N'A ENCORE ETE TESTE DANS UN VRAI NAVIGATEUR - attendu
// vu l'ampleur du changement (cf. historique de v4 : chaque nouvelle
// version a toujours demande au moins un aller-retour de bugs en usage
// reel avant de fonctionner).
//
// AJOUT (2026-09-26) : navigation directe sur odysee.com (SITE_ODYSEE,
// voir plus bas). Motivation utilisateur : certains donghua ne sont
// suivables QUE sur Odysee, mais la liste des videos d'une chaine Odysee
// est triee par date de mise en ligne, pas par episode, et une chaine
// mélange souvent plusieurs series - aucune notion fiable de "suivant" a
// lire dans la page elle-meme (contrairement aux 3 autres sites). Solution :
// reconstruire notre propre playlist ordonnee via l'API publique Odysee
// (claim_search sur la chaine, sans authentification), triee par numero
// d'episode devine dans le TITRE de chaque video (seule source fiable -
// verifie en usage reel : la recherche du site lui-meme ne retrouve meme
// pas toujours des videos pourtant bien hebergees, et le champ metadonnee
// "languages" de l'API reste a 'en' meme pour du contenu vostfr). Meme
// principe que anime-sama (navStyle 'index'), mais generalise pour
// supporter les trous dans la numerotation (une chaine donnee ne detient
// pas forcement TOUS les episodes d'une serie - voir episodeNumbersByIndex/
// resumeUrlsByIndex plus bas, qui remplacent l'hypothese "numero = index+1"
// valable uniquement pour anime-sama).
// Filet de securite demande explicitement par l'utilisateur : seules les
// videos dont le titre contient "vostfr" sont retenues dans la playlist -
// certains reposts se presentent comme "multi-traduction" mais sont en
// realite un sous-titrage automatique (Google Trad) de mauvaise qualite.
// Limite assumee : la playlist ne couvre que le contenu de LA CHAINE
// suivie (pas de recherche inter-chaines pour combler un trou), pour ne
// pas multiplier le risque de tomber sur une de ces mauvaises versions.
// Egalement ajoute : bouton "Ouvrir sur Odysee" cote SITE_ESPRIT_DONGHUA,
// qui ouvre la page Odysee correspondante dans un nouvel onglet et
// transfere les reglages intro/outro actuels (voir pendingIntroOutroTransfer)
// pour ne pas avoir a les re-regler la-bas.

(function () {
    'use strict';

    // Opera + Tampermonkey (2026-10-16) : addEventListener n'enregistre rien (boutons morts, sans erreur)
    // alors que les proprietes onclick... marchent. Test au demarrage ; si casse, repli sur on<type>.
    // ponytail: le repli occupe la propriete on<type> (un site qui la reecrit apres coup ecrase nos ecouteurs).
    (function fixBrokenAddEventListener() {
        const proto = EventTarget.prototype;
        const nativeAdd = proto.addEventListener, nativeRemove = proto.removeEventListener;
        let ok = false;
        const probe = document.createElement('span');
        nativeAdd.call(probe, 'click', () => { ok = true; });
        probe.click();
        if (ok) return;
        console.warn('[AnimeTracker v6] addEventListener inactif (Opera + Tampermonkey ?) : repli sur les proprietes on<type>.');
        const lists = new WeakMap();
        proto.addEventListener = function (type, fn, opts) {
            if (typeof fn !== 'function' || !(('on' + type) in this)) return nativeAdd.call(this, type, fn, opts);
            let byType = lists.get(this);
            if (!byType) lists.set(this, byType = {});
            let list = byType[type];
            if (!list) {
                list = byType[type] = [];
                const target = this, prev = this['on' + type];
                this['on' + type] = function (ev) {
                    if (typeof prev === 'function') prev.call(target, ev);
                    list.slice().forEach((l) => {
                        if (l.once) list.splice(list.indexOf(l), 1);
                        l.fn.call(target, ev);
                    });
                };
            }
            if (!list.some((l) => l.fn === fn)) list.push({ fn: fn, once: !!(opts && opts.once) });
        };
        proto.removeEventListener = function (type, fn, opts) {
            const list = (lists.get(this) || {})[type];
            if (!list) return nativeRemove.call(this, type, fn, opts);
            const i = list.findIndex((l) => l.fn === fn);
            if (i >= 0) list.splice(i, 1);
        };
        // window / document peuvent etre des enveloppes du bac a sable : on les force aussi.
        [window, document].forEach((t) => { try { t.addEventListener = proto.addEventListener; t.removeEventListener = proto.removeEventListener; } catch (e) { /* lecture seule */ } });
    })();

    const isTopFrame = (window.top === window.self);
    const PLAYER_ORIGIN_ODYSEE = 'https://odysee.com';
    const PLAYER_ORIGIN_SIBNET = 'https://video.sibnet.ru';
    const PLAYER_ORIGIN_ANSEMBED = 'https://ansembed.net';
    const MSG_PREFIX = 'anime-tracker-v6-';
    const PLAYER_FRAME_NAME = 'continuum-player';

