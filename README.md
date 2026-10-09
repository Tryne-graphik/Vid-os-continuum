# Vidéo Continuum

Script Tampermonkey qui retient où tu en es dans tes animes, saute les
génériques et enchaîne les épisodes, avec un panneau de suivi des nouveaux
épisodes.

## Ce qu'il fait

- **Sites gérés** : Esprit Donghua, Anime-Sama, Animoflix, Odysee, plus les
  sites que tu ajoutes toi-même (menu Tampermonkey → **« ➕ Ajouter ce
  site »**, depuis la page d'un épisode, lecteur affiché).
- **Lecteur plein écran** : saut de l'intro et de la fin (réglages par série,
  ou automatique via AniSkip), épisode suivant enchaîné, reprise à l'endroit
  où tu t'étais arrêté, boutons ⏮ / ⏭ sous la barre de lecture.
- **Suivi** : un panneau par site avec les animes « à rattraper », une
  fenêtre de suivi détaillée et un historique.
- **Icônes sur les vignettes des sites** (légende dans le panneau) : vert =
  suivi et à jour, turquoise = nouvel épisode, violet = saison finie en
  attente de la suite, jaune = suivi sur un autre site, rouge = abandonné.
- **Saison finie (⏸)** dans la fenêtre de suivi : la série ne compte plus
  « à rattraper » ; Vidéo Continuum détecte la saison suivante (Anime-Sama,
  Animoflix, myfluneo) ou le prochain épisode et te la signale.
- **Repli YouTube** quand la vidéo du site cale ou manque : recherche de
  l'épisode (compilations comprises) et sous-titres traduits en français.
- **Sauvegarde** : export / import d'un fichier qui contient ta progression,
  ton historique et tes réglages (séries abandonnées ou en attente,
  intro/outro, chaînes YouTube, sites ajoutés, reprises).

## Installation

**Le plus simple** : lance `installateur/Vidéo-Continuum-Installateur.exe` et
suis les étapes (choix du navigateur → installation de Tampermonkey →
installation du script).

**À la main** :
1. Installe l'extension [Tampermonkey](https://www.tampermonkey.net/).
2. Chrome / Edge / Opera : dans la page des extensions, active
   **« Autoriser les scripts utilisateur »** (ou le « Mode développeur »)
   pour Tampermonkey, sinon aucun script ne s'exécute.
3. Ouvre ce lien et clique sur **Installer** :
   https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js

Les mises à jour arrivent ensuite automatiquement (ou via le bouton
**🔄 Vérifier MAJ** du panneau).

### Vérifier l'installateur

L'exécutable n'est pas signé : Windows SmartScreen peut afficher un
avertissement (« Informations complémentaires » → « Exécuter quand même »).
Pour vérifier qu'il n'a pas été modifié, compare son empreinte SHA-256
(PowerShell : `Get-FileHash Vidéo-Continuum-Installateur.exe`) :

```
b06776336d6532994bb70b135f245db6a9c108799ffdc8b7ea556fa7abd34462
```

Son code source est dans `installateur/Program.cs` : il ne fait qu'ouvrir
des pages dans ton navigateur (Tampermonkey, la page des extensions, puis
le script ci-dessus), avec une image pour chaque clic à faire. Il n'installe
rien lui-même, ne touche pas au registre et ne demande pas de droits
administrateur.

## Données et vie privée

- Ta progression reste **dans ton navigateur** (stockage Tampermonkey).
  Rien n'est envoyé ailleurs, sauf ce qui suit.
- **« Signaler un problème »** n'envoie que ce que tu écris, plus : le
  type, le site, l'anime, l'épisode, la version du script, ton navigateur
  (user-agent), l'adresse de la page et l'état du lecteur. Rien n'est
  envoyé sans clic sur « Envoyer ».
- Pour fonctionner, le script lit des pages publiques : celles des sites
  d'anime (nouveaux épisodes, saisons), la recherche YouTube (repli) et
  AniList (fiche de l'anime, saut automatique AniSkip). Aucune donnée
  personnelle n'y est envoyée.
- **N'importe que des sauvegardes de confiance.** L'import filtre les
  contenus dangereux (liens hors des sites gérés, code injecté), mais une
  sauvegarde reste une liste de liens choisie par quelqu'un d'autre.

## ⚠️ Avertissement

Outil personnel, non affilié aux sites sur lesquels il fonctionne ni aux
hébergeurs vidéo qu'ils utilisent. Il n'héberge et ne redistribue aucune
vidéo. Chacun reste responsable des sites qu'il visite. Voir `LICENSE`.
