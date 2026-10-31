# Roue des sanctions — Roblox France

Application de bureau Windows du serveur Discord **Roblox France**
([discord.gg/robloxfr](https://discord.gg/robloxfr)) : une roue à tirage au sort, avec des
chances réglables pour chaque choix, le claquement de la flèche sur les picots, des confettis
et un historique des tirages.

## Installer

1. Télécharger **`Roue-des-sanctions-Setup-<version>.exe`** dans les
   [Releases](https://github.com/emerick-marchese/roue-des-sactions/releases/latest) du dépôt
   (ou l'artefact « Roue-des-sanctions-Setup » de l'action *Installateur Windows*).
2. Double-cliquer dessus. Windows peut afficher « Windows a protégé votre ordinateur » car
   l'installateur n'est pas signé : cliquer sur **Informations complémentaires**, puis
   **Exécuter quand même**.
3. Suivre l'assistant. Une icône **Roue des sanctions** est créée sur le bureau et dans le
   menu Démarrer. Une ancienne « La Roue » est remplacée, et ses roues enregistrées sont gardées.

Pour désinstaller : *Paramètres → Applications → Roue des sanctions → Désinstaller*.

## Utilisation

- **Lancer** : bouton « Lancer la roue », clic sur le logo au centre, touche <kbd>Espace</kbd>,
  ou attraper la roue à la souris et la lancer d'un geste (plus le geste est rapide, plus elle tourne).
- **Chances** : chaque choix a un nom, une couleur (clic sur la pastille) et un nombre de
  chances réglé avec − et + (ou la molette). Plus il a de chances, plus sa part de roue est
  grande ; le pourcentage s'affiche tout seul, rien à calculer. À 0, le choix est retiré de la
  roue sans être supprimé.
- **Mêmes chances**, **Mélanger**, **Coller une liste** (un choix par ligne, `Mute 1 h ; 3` pour lui donner 3 chances).
- **Plusieurs roues** : menu en haut à gauche, avec une corbeille pour supprimer une roue ;
  chaque roue garde son propre historique.
- **Réglages** : volume, bruit de la flèche (plastique, bois, métal), durée de rotation,
  confettis, retrait automatique du gagnant (tirage sans remise), export / import d'une roue (.json).
- Raccourcis : <kbd>Espace</kbd> lancer · <kbd>M</kbd> son · <kbd>P</kbd> panneau · <kbd>F11</kbd> plein écran.

Le tirage est équitable : le gagnant est tiré au hasard (générateur cryptographique) selon les
chances, puis la roue est freinée pour s'arrêter dessus. Les sons sont synthétisés en direct
(aucun fichier audio). Les roues et réglages sont enregistrés sur l'ordinateur
(`%APPDATA%\La Roue`).

## Développement

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm start          # lance l'application
npm run dist       # fabrique dist/La-Roue-Setup-<version>.exe
```

`npm run dist` fonctionne sous Windows, mais aussi sous Linux et macOS sans Wine
(voir `scripts/build-win.js`). À chaque modification poussée sur la branche `main`, l'action
`.github/workflows/windows.yml` refabrique l'installateur sous Windows et le publie dans les
*Releases* (`v<version>`). Pour publier une nouvelle version, augmenter `version` dans
`package.json`.

| Fichier | Rôle |
|---|---|
| `main.js`, `preload.js` | Fenêtre Electron (taille retenue, plein écran, une seule instance) |
| `src/js/roue.js` | Dessin de la roue, freinage, picots et flèche à ressort, lancer à la main |
| `src/js/sons.js` | Sons synthétisés : claquements, roulement, élan, fanfare |
| `src/js/app.js` | Roues enregistrées, éditeur des parts, historique, réglages |
| `src/js/confettis.js` | Confettis |
| `build/logo-robloxfr.webp` | Logo du serveur ; `npm run icone` régénère `build/icon.ico`, `src/img/icon.png` et `src/img/robloxfr.png` (Playwright requis) |
