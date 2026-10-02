# Plan v7 — Vidéo Continuum en extension avec panneau latéral

> **En pause (décision de l'utilisateur, 2026-10-02)** : d'abord terminer la v6.xx,
> puis créer une page GitHub de présentation de tous les projets (avec une partie
> « rejoindre un projet »). La v7 sera reprise si des contributeurs nous rejoignent.

Rédigé le 2026-10-02. Décisions prises par Claude sur délégation de l'utilisateur
(« je te laisse gérer les décisions »). La v6 (userscript) reste en service
pendant tout le chantier, en corrections de bugs uniquement — même schéma que
v4 → v6.

## 1. Objectif

- Toutes les commandes dans le **panneau latéral du navigateur** : les pubs des
  sites ne voient plus nos clics, et « Mes animes » est disponible partout sans
  rien injecter dans les pages.
- **Version générique** : les sites sont des « adaptateurs » (les 4 actuels +
  ceux ajoutés par l'utilisateur), plus rien de spécifique codé en dur dans le
  cœur.
- Reprendre tout ce que fait la v6.23 : lecteur plein écran avec lecteurs de
  secours, suivi, reprise de position, AniSkip, fiche (synopsis/genres),
  multi-site, « Tout vu », Nouveautés, signalement d'incidents.
- **Nouveau grâce à l'extension** :
  - blocage réseau des régies de pub par site (`declarativeNetRequest`) — ce que
    le userscript n'a pas pu faire (tentative v6.23 abandonnée) ;
  - vérification des nouveaux épisodes en arrière-plan + **notification
    Windows** (`chrome.alarms` + `chrome.notifications`) ;
  - permissions demandées **site par site** quand on ajoute un site (au lieu de
    « tous les sites » comme la v6.19).

## 2. Inventaire des ressources (vérifié le 2026-10-02)

| Besoin | Disponible | Manque / action |
|---|---|---|
| Navigateurs cibles | Chrome, Opera (utilisateur), Edge | Vérifier le support du panneau latéral sur Opera (phase 0) |
| Node.js | v24.20, npm 11.19 | — |
| Tests sans dépendance | `node:test` intégré | — |
| Tests navigateur d'une extension | MCP Playwright (ne charge pas d'extension) | `npm i -D playwright` dans le dossier v7 (gratuit) — lance Chromium avec `--load-extension` |
| Débogage pages d'extension | MCP chrome-devtools | — |
| Git / GitHub | git 2.55, dépôt public `Vid-os-continuum` | **`gh` absent** → `winget install GitHub.cli` (gratuit) pour les PR des équipes de nuit |
| Délégation économique (CLAUDE.md) | MCP `ai-delegate` : Ollama local (qwen2.5-coder 7b/14b, gemma 26b, qwen 14b 32k), Groq, DeepSeek, Gemini (gros contexte), compare_ai | — |
| Équipes de nuit | Skills `schedule` (agents cloud planifiés), `loop` ; agents en arrière-plan ; Planificateur de tâches Windows | Connexion GitHub des agents cloud (au 1er `/schedule`) |
| Hooks | aucun configuré | Optionnel : hook qui lance les tests unitaires après chaque modif du dossier v7 (skill `update-config`) |
| Revue de code | skills `code-review`, `simplify`, `ponytail-review` | — |
| Données à migrer | export HTML de la v6 (bloc de données) | Bouton « Exporter pour la v7 » (JSON) dans la v6 |

## 3. Architecture (Manifest V3, JavaScript sans étape de build)

```
extension/
  manifest.json          side_panel, storage, sidePanel, scripting, alarms,
                         notifications, declarativeNetRequest ; hôtes : les 4 sites
                         + optional_host_permissions "*://*/*" (demandé site par site)
  background.js          service worker : stockage, AniList/AniSkip, vérif. épisodes,
                         règles anti-pub, routage des messages
  sidepanel.html/.js     toute l'interface (liste, commandes, réglages, fiche…)
  content/page.js        dans l'onglet : adaptateur du site, calque lecteur (iframe)
  content/frame.js       dans l'iframe lecteur : pilotes (ansembed, sibnet, odysee,
                         générique) — injecté seulement dans NOTRE iframe
  lib/                   code pur partagé, repris de la v6 : adaptateurs, parseurs
                         (DLE, épisodes anime-sama…), AniSkip, nettoyage de titres,
                         clés de stockage
  test/                  node:test + pages HTML réelles enregistrées (fixtures)
```

Principe : `lib/` = fonctions pures testables sans navigateur (≈ 60 % du code
v6 s'y extrait tel quel) ; le reste = colle de messages.

Le lecteur reste **dans la page** (la vidéo doit y être). Le panneau contient les
commandes. Limite connue : en plein écran (F11 / bouton plein écran), le
navigateur masque le panneau → on garde quelques commandes minimales sur le
calque (suivant, fermer), comme aujourd'hui.

## 4. Phases

| Phase | Contenu | Qui | Effort estimé |
|---|---|---|---|
| **0. Prototype** | Extension minimale : panneau latéral « Mes animes » lu depuis un export v6 ; chargement non empaqueté dans Chrome **et Opera** | Claude (jour) | 1 séance |
| **1. Extraction de `lib/`** | Porter les fonctions pures de la v6 + tests sur fixtures (pages réelles des 4 sites + french-anime + myfluneo) | **Équipe de nuit** (port mécanique : Ollama qwen2.5-coder 14b) + relecture Claude | 2-3 nuits + 1 relecture |
| **2. Lecteur** | `content/page.js` + `frame.js` : calque, lecteurs de secours, reprise, AniSkip, sauts intro/outro | Claude (jour) | 2 séances |
| **3. Panneau** | Interface complète dans le panneau + messages | Claude (jour), maquettes possibles en nuit | 2 séances |
| **4. Arrière-plan** | Vérification des épisodes + notifications ; AniList/AniSkip ; anti-pub par site | Claude + nuit | 1-2 séances |
| **5. Sites ajoutés** | « Ajouter ce site » avec demande de permission ; adaptateur générique v6.22 | Claude | 1 séance |
| **6. Migration & diffusion** | « Exporter pour la v7 » dans la v6 ; import ; paquet + guide d'installation ; installateur mis à jour | Claude | 1 séance |
| **7. Bêta** | Toi + ton ami ; v6 désactivée seulement après validation | Utilisateurs | 1-2 semaines |

Total : **≈ 10-12 séances de jour + 4-6 nuits**, soit 3 à 5 semaines au rythme
actuel.

## 5. Équipes de nuit

Deux types, du moins coûteux au plus coûteux :

1. **Veille des sites (sans IA, gratuite)** — script Node/Playwright lancé chaque
   nuit par le Planificateur de tâches Windows : ouvre un épisode de chaque site
   géré, vérifie que l'adaptateur trouve le lecteur et que la vidéo démarre, et
   écrit un rapport. Aurait détecté tout seul la fermeture de Sibnet et le
   passage d'animoflix à ansembed. Une IA n'intervient que si un test échoue.
   *À mettre en place dès maintenant, utile aussi pour la v6.*
2. **Développement (agent cloud planifié, `/schedule`)** — chaque nuit, prend la
   tâche suivante de `TACHES-v7.md` sur la branche `v7`, code + tests, pousse une
   branche `nuit/<date>` et un compte rendu. **Jamais de fusion ni de
   publication sans revue de jour.** Le travail mécanique est délégué à
   Ollama (local, gratuit) quand l'agent tourne sur le PC ; l'agent cloud sert
   aux tâches de code pur (phase 1, tests).

Garde-fous : tâches courtes et vérifiables (tests qui passent) ; aucune donnée
personnelle ni secret dans les tâches ; la v6 publiée n'est jamais touchée la
nuit.

## 6. Coûts

| Poste | Coût | Décision |
|---|---|---|
| `gh`, Playwright, Node, Ollama | 0 € | Installer `gh` |
| Opera Add-ons, Edge Add-ons | 0 € | Plus tard, version générique uniquement |
| Chrome Web Store | 5 $ une fois | **Plus tard, optionnel** : risque de refus pour une extension pensée pour des sites de streaming non officiels ; viser la version générique d'abord |
| Certificat de signature pour l'installateur | ≈ 100-300 €/an | **Non** : pas rentable pour un usage entre amis |
| Nom de domaine (vitrine) | ≈ 10-15 €/an | Optionnel, GitHub Pages gratuit suffit |
| IA | Abonnement Claude existant ; agents cloud = usage de l'abonnement ; Ollama gratuit ; Groq/DeepSeek/Gemini : niveaux gratuits | Surveiller l'usage les premières nuits ; passer à un forfait supérieur seulement si les nuits saturent les limites |

**Budget à prévoir : 0 € pour aller jusqu'à la bêta ; 5 $ si publication sur le
Chrome Web Store.**

## 7. Économie de tokens

- Le fichier v6 fait ≈ 3 600 lignes : ne jamais le relire en entier. Chercher par
  `grep`, lire des extraits ; le portage mécanique va à Ollama avec les **chemins**
  des fichiers (règle du CLAUDE.md global).
- Revues à gros contexte (tout le dossier v7) : Gemini.
- Décisions d'architecture et code de sécurité (permissions, anti-pub,
  messages) : Claude uniquement.
- Les nuits travaillent sur des tâches courtes avec tests : peu d'allers-retours.

## 8. Risques

- **Opera** : support du panneau latéral à vérifier en phase 0 (repli : popup
  d'extension ou fenêtre séparée).
- **Installation hors magasin** : Chrome affiche un avertissement « mode
  développeur » ; pas de mise à jour automatique hors magasin → script de mise
  à jour ou passage par Opera/Edge Add-ons.
- **Sites qui changent** : couvert par la veille de nuit (section 5.1).
- **Pubs** : le blocage réseau par site couvre mieux que le userscript, sans
  garantie sur les régies à domaines tournants.

## 9. Prochaines actions

1. Installer `gh` (gratuit).
2. Mettre en place la **veille des sites** de nuit (sans IA).
3. Phase 0 : prototype du panneau latéral, test Chrome + Opera.
4. Créer `TACHES-v7.md` + la routine de nuit de développement une fois le
   prototype validé.
