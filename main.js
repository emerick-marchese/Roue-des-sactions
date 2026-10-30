// Processus principal : une seule fenêtre, qui retient sa taille et sa position.
const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");

app.setAppUserModelId("fr.cogec.laroue");
// Les sons de la roue doivent pouvoir jouer sans attendre un premier clic.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const FOND = "#0b0c22";
const fichierFenetre = () => path.join(app.getPath("userData"), "fenetre.json");
let fenetre = null;

function lirePositionFenetre() {
  try {
    const p = JSON.parse(fs.readFileSync(fichierFenetre(), "utf8"));
    const visible = screen.getAllDisplays().some(({ workArea: z }) =>
      p.x < z.x + z.width - 100 && p.x + p.width > z.x + 100 && p.y >= z.y - 20 && p.y < z.y + z.height - 100
    );
    return visible ? p : { width: p.width, height: p.height, maximized: p.maximized };
  } catch {
    return { width: 1380, height: 880 };
  }
}

function enregistrerPositionFenetre() {
  if (!fenetre) return;
  const b = fenetre.getNormalBounds();
  try {
    fs.writeFileSync(fichierFenetre(), JSON.stringify({ ...b, maximized: fenetre.isMaximized() }));
  } catch {
    // Pas grave : la fenêtre reprendra sa taille par défaut.
  }
}

function creerFenetre() {
  const pos = lirePositionFenetre();
  fenetre = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: pos.width,
    height: pos.height,
    minWidth: 980,
    minHeight: 660,
    show: false,
    title: "La Roue",
    backgroundColor: FOND,
    icon: path.join(__dirname, "src/img/icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: FOND, symbolColor: "#d9dcff", height: 44 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (pos.maximized) fenetre.maximize();
  fenetre.once("ready-to-show", () => fenetre.show());
  fenetre.on("close", enregistrerPositionFenetre);
  fenetre.on("closed", () => (fenetre = null));
  fenetre.on("enter-full-screen", () => fenetre.webContents.send("plein-ecran", true));
  fenetre.on("leave-full-screen", () => fenetre.webContents.send("plein-ecran", false));

  // L'application ne navigue jamais ailleurs et n'ouvre pas d'autres fenêtres.
  fenetre.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  fenetre.webContents.on("will-navigate", (e) => e.preventDefault());

  fenetre.webContents.on("before-input-event", (e, touche) => {
    if (touche.type !== "keyDown") return;
    if (touche.key === "F11") {
      fenetre.setFullScreen(!fenetre.isFullScreen());
      e.preventDefault();
    } else if (touche.key === "Escape" && fenetre.isFullScreen()) {
      fenetre.setFullScreen(false);
    } else if (touche.key === "F12" && !app.isPackaged) {
      fenetre.webContents.toggleDevTools();
    }
  });

  fenetre.loadFile(path.join(__dirname, "src/index.html"));
}

ipcMain.on("plein-ecran", () => fenetre && fenetre.setFullScreen(!fenetre.isFullScreen()));
ipcMain.handle("version", () => app.getVersion());

app.on("second-instance", () => {
  if (!fenetre) return;
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  creerFenetre();
});

app.on("window-all-closed", () => app.quit());
