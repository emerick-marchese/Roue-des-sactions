# La Roue

Application de bureau Windows : une roue à tirage au sort, avec des parts en pourcentage,
le claquement de la flèche sur les picots, des confettis et un historique des tirages.

## Installer

1. Télécharger **`La-Roue-Setup-1.0.0.exe`** dans les
   [Releases](https://github.com/emerick-marchese/roue-des-sactions/releases/latest) du dépôt
   (ou l'artefact « La-Roue-Setup » de l'action *La Roue – installateur Windows*).
2. Double-cliquer dessus. Windows peut afficher « Windows a protégé votre ordinateur » car
   l'installateur n'est pas signé : cliquer sur **Informations complémentaires**, puis
   **Exécuter quand même**.
3. Suivre l'assistant. Une icône **La Roue** est créée sur le bureau et dans le menu Démarrer.

Pour désinstaller : *Paramètres → Applications → La Roue → Désinstaller*.

## Utilisation

- **Lancer** : bouton « Lancer la roue », clic sur le moyeu « LANCER », touche <kbd>Espace</kbd>,
  ou attraper la roue à la souris et la lancer d'un geste (plus le geste est rapide, plus elle tourne).
- **Parts** : chaque choix a un nom, une couleur (clic sur la pastille) et une part en %.
  Molette ou flèches ↑ ↓ dans le champ pour ajuster (<kbd>Maj</kbd> = pas de 5).
  Si le total ne fait pas 100 %, la roue répartit au prorata et le bouton « Ramener à 100 % »
  corrige d'un clic. Une part à 0 % retire le choix de la roue sans le supprimer.
- **Parts égales**, **Mélanger**, **Coller une liste** (un choix par ligne, `Nom ; 30` pour fixer la part).
- **Plusieurs roues** : menu en haut à gauche ; chaque roue garde son propre historique.
- **Réglages** : volume, bruit de la flèche (plastique, bois, métal), durée de rotation,
  confettis, retrait automatique du gagnant (tirage sans remise), export / import d'une roue (.json).
- Raccourcis : <kbd>Espace</kbd> lancer · <kbd>M</kbd> son · <kbd>P</kbd> panneau · <kbd>F11</kbd> plein écran.

Le tirage est équitable : le gagnant est tiré au hasard (générateur cryptographique) selon les
pourcentages, puis la roue est freinée pour s'arrêter dessus. Les sons sont synthétisés en direct
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
| `build/icon.svg` | Icône ; `npm run icone` régénère `build/icon.ico` et `src/img/icon.png` (Playwright requis) |
