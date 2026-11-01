// Pont minimal entre la page et Electron : plein écran, numéro de version et son personnel.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bureau", {
  pleinEcran: () => ipcRenderer.send("plein-ecran"),
  surPleinEcran: (rappel) => ipcRenderer.on("plein-ecran", (_e, actif) => rappel(actif)),
  version: () => ipcRenderer.invoke("version"),
  sonPerso: {
    lire: () => ipcRenderer.invoke("son-perso:lire"),
    enregistrer: (nom, octets) => ipcRenderer.invoke("son-perso:enregistrer", nom, octets),
  },
});
