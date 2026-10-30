// Pont minimal entre la page et Electron : le plein écran et le numéro de version.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bureau", {
  pleinEcran: () => ipcRenderer.send("plein-ecran"),
  surPleinEcran: (rappel) => ipcRenderer.on("plein-ecran", (_e, actif) => rappel(actif)),
  version: () => ipcRenderer.invoke("version"),
});
