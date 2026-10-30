// Fabrique l'installateur Windows (dist/La-Roue-Setup-x.y.z.exe).
// Sous Windows : simple appel à electron-builder.
// Sous Linux/macOS : electron-builder lancerait Wine pour extraire le programme de
// désinstallation ; on lui fait plutôt lire ce programme directement dans l'installateur
// (le lecteur intégré prévu pour macOS), ce qui évite d'avoir à installer Wine.
const builder = require("electron-builder");

if (process.platform !== "win32") {
  require("app-builder-lib/out/util/macosVersion").isMacOsCatalina = () => true;
}

builder
  .build({ targets: builder.Platform.WINDOWS.createTarget("nsis", builder.Arch.x64) })
  .then((fichiers) => console.log("\nInstallateur prêt :\n  " + fichiers.filter((f) => f.endsWith(".exe")).join("\n  ")))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
