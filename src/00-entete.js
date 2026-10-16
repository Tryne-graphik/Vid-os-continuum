// ==UserScript==
// @name         Anime Tracker Continuum (v6)
// @namespace    esprit-donghua-tracker-v6
// @version      7.4
// @description  Suite de esprit-donghua-suivi-progression-v4 (v4 restait limite a esprit-donghua.xyz/Odysee) : meme principe (calque plein ecran, jamais recharge, iframe du lecteur natif pilotee par un second script injecte) mais etendu a 4 familles de sites - esprit-donghua.xyz (Odysee), animoflix.to (video.sibnet.ru), anime-sama.to (video.sibnet.ru) et odysee.com en navigation directe (playlist reconstruite via l'API publique Odysee) - avec UNE seule liste de suivi, groupee par site. Script independant de v4 (storage isole) : le fichier v4.36 reste intact sur le disque mais doit etre DESACTIVE dans Tampermonkey pour eviter un doublon de calque sur esprit-donghua.xyz.
// @match        https://esprit-donghua.xyz/*
// @match        https://odysee.com/*
// @match        https://animoflix.to/*
// @match        https://anime-sama.to/*
// @match        https://video.sibnet.ru/*
// @match        https://ansembed.net/*
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceURL
// @resource     vcCinzel https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/themes/cinzel.woff2
// @connect      esprit-donghua.xyz
// @connect      animoflix.to
// @connect      anime-sama.to
// @connect      api.na-backend.odysee.com
// @connect      odysee.com
// @connect      www.googleapis.com
// @connect      www.youtube.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      graphql.anilist.co
// @connect      api.aniskip.com
// @updateURL    https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js
// @downloadURL  https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js
// ==/UserScript==
