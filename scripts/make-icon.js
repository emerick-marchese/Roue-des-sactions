// Génère build/icon.ico (Windows) et src/img/icon.png à partir de build/icon.svg.
// À relancer seulement si l'icône change. Nécessite Playwright (Chromium) :
//   npx playwright install chromium   puis   node scripts/make-icon.js
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const racine = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(racine, "build/icon.svg"), "utf8");
const TAILLES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

// Image BMP 32 bits (BGRA, de bas en haut) + masque ET, telle qu'attendue dans un .ico.
function bmpIco(taille, rgba) {
  const entete = Buffer.alloc(40);
  entete.writeUInt32LE(40, 0);
  entete.writeInt32LE(taille, 4);
  entete.writeInt32LE(taille * 2, 8);
  entete.writeUInt16LE(1, 12);
  entete.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(taille * taille * 4);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const src = (y * taille + x) * 4;
      const dst = ((taille - 1 - y) * taille + x) * 4;
      pixels[dst] = rgba[src + 2];
      pixels[dst + 1] = rgba[src + 1];
      pixels[dst + 2] = rgba[src];
      pixels[dst + 3] = rgba[src + 3];
    }
  }
  const ligneMasque = Math.ceil(taille / 32) * 4;
  const masque = Buffer.alloc(ligneMasque * taille);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      if (rgba[(y * taille + x) * 4 + 3] === 0) {
        masque[(taille - 1 - y) * ligneMasque + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return Buffer.concat([entete, pixels, masque]);
}

(async () => {
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage();
  const images = await page.evaluate(
    async ({ svg, tailles }) => {
      const img = new Image();
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
      await img.decode();
      return tailles.map((t) => {
        const c = document.createElement("canvas");
        c.width = c.height = t;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, t, t);
        return {
          taille: t,
          rgba: Array.from(ctx.getImageData(0, 0, t, t).data),
          png: c.toDataURL("image/png").split(",")[1],
        };
      });
    },
    { svg, tailles: [...TAILLES, 512] }
  );
  await navigateur.close();

  const entrees = images
    .filter((i) => TAILLES.includes(i.taille))
    .map((i) => ({
      taille: i.taille,
      donnees: i.taille >= 64 ? Buffer.from(i.png, "base64") : bmpIco(i.taille, Uint8Array.from(i.rgba)),
    }));

  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2);
  entete.writeUInt16LE(entrees.length, 4);
  const repertoire = Buffer.alloc(16 * entrees.length);
  let decalage = 6 + repertoire.length;
  entrees.forEach((e, n) => {
    const o = n * 16;
    repertoire.writeUInt8(e.taille >= 256 ? 0 : e.taille, o);
    repertoire.writeUInt8(e.taille >= 256 ? 0 : e.taille, o + 1);
    repertoire.writeUInt16LE(1, o + 4);
    repertoire.writeUInt16LE(32, o + 6);
    repertoire.writeUInt32LE(e.donnees.length, o + 8);
    repertoire.writeUInt32LE(decalage, o + 12);
    decalage += e.donnees.length;
  });
  fs.writeFileSync(path.join(racine, "build/icon.ico"), Buffer.concat([entete, repertoire, ...entrees.map((e) => e.donnees)]));

  const grande = images.find((i) => i.taille === 512);
  fs.mkdirSync(path.join(racine, "src/img"), { recursive: true });
  fs.writeFileSync(path.join(racine, "src/img/icon.png"), Buffer.from(grande.png, "base64"));
  console.log("build/icon.ico et src/img/icon.png générés.");
})();
