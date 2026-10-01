# Vidéo_Continuum

Script Tampermonkey qui retient où tu en es dans tes animes, saute les
génériques et enchaîne les épisodes, avec un panneau de suivi des nouveaux
épisodes.

## Installation

**Le plus simple** : lance `installateur/Vidéo_Continuum-Installateur.exe` et
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
(PowerShell : `Get-FileHash Vidéo_Continuum-Installateur.exe`) :

```
c6eeb62a1810f63b8c6dd05907e52a4f1c773e63ffda30c1411aac77696495e0
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
- La clé API YouTube éventuelle reste dans ton navigateur et n'est jamais
  exportée.
- **N'importe que des sauvegardes de confiance.** L'import filtre les
  contenus dangereux (liens hors des sites gérés, code injecté), mais une
  sauvegarde reste une liste de liens choisie par quelqu'un d'autre.

## ⚠️ Avertissement

Outil personnel, non affilié aux sites sur lesquels il fonctionne ni aux
hébergeurs vidéo qu'ils utilisent. Il n'héberge et ne redistribue aucune
vidéo. Chacun reste responsable des sites qu'il visite. Voir `LICENSE`.
