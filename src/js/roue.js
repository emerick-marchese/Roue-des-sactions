// La roue : dessin sur canvas, rotation freinée, picots qui font claquer la flèche.
//
// Repère : un angle « roue » vaut 0 en haut et croît dans le sens des aiguilles d'une montre.
// `rot` est la rotation cumulée (en degrés) ; l'angle de roue situé sous la flèche vaut -rot.
(function () {
  const RAD = Math.PI / 180;
  const mod = (a, n) => ((a % n) + n) % n;
  const borner = (v, min, max) => Math.min(max, Math.max(min, v));

  // Rayons en fraction du rayon total R.
  const G = {
    cadreInt: 0.912,
    ampoules: 0.956,
    ampouleR: 0.018,
    jante: 0.904,
    janteInt: 0.856,
    picots: 0.88,
    picotR: 0.0145,
    texteExt: 0.81,
    texteInt: 0.2,
    moyeu: 0.152,
    pivot: 0.962,
    pointe: 0.785,
    flecheLarg: 0.058,
  };
  const NB_AMPOULES = 24;
  const DEFLEXION_MAX = 26; // en degrés, quand un picot passe sous la pointe
  const ECART_MAX_PICOTS = 15; // un picot au moins tous les 15° (sinon la roue serait muette)
  const ECART_MIN_PICOTS = 1.5;

  function hasard() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }

  function clair(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
  }

  function toile(largeur, hauteur) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(largeur));
    c.height = Math.max(1, Math.ceil(hauteur));
    return c;
  }

  function degradeOr(ctx, r) {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, "#FFF0B8");
    g.addColorStop(0.3, "#F7C14E");
    g.addColorStop(0.55, "#C98A1E");
    g.addColorStop(0.75, "#F5C65A");
    g.addColorStop(1, "#9A5E0E");
    return g;
  }

  class Roue {
    constructor(canvas, rappels = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.rappels = rappels; // clic(force, delaiSecondes), vitesse(toursParSeconde), fin(part)
      this.parts = [];
      this.picots = [];
      this.contact = 3;
      this.rot = 0;
      this.rotPrec = 0;
      this.sens = 1;
      this.vitesse = 0;
      this.anim = null;
      this.glisse = null;
      this.fleche = { angle: 0, vit: 0 };
      this.gagnant = null;
      this.surbrillance = 0;
      this.lumieres = { mode: "repos", phase: 0, depuis: 0 };
      this.survolMoyeu = false;
      this.dernierRendu = 0;
      this.S = 0;
      this.dpr = 1;
      this.dernierT = performance.now();
      this.logo = null;
      if (rappels.logo) {
        const img = new Image();
        img.onload = () => {
          this.logo = img;
          if (this.S) this.preparerVerre();
        };
        img.src = rappels.logo;
      }

      new ResizeObserver(() => this.redimensionner()).observe(canvas.parentElement);
      this.brancherSouris();
      requestAnimationFrame((t) => this.boucle(t));
    }

    get tourne() {
      return !!this.anim;
    }

    // segments : [{ id, label, color, weight }] — les parts à 0 % n'apparaissent pas.
    definirParts(segments) {
      const actifs = segments.filter((s) => s.weight > 0);
      const total = actifs.reduce((t, s) => t + s.weight, 0);
      let debut = 0;
      this.parts = actifs.map((s) => {
        const etendue = (s.weight / total) * 360;
        const p = { id: s.id, label: s.label, color: s.color, chance: s.weight / total, debut, etendue };
        debut += etendue;
        return p;
      });

      const picots = [];
      for (const p of this.parts) {
        const n = Math.max(1, Math.ceil(p.etendue / ECART_MAX_PICOTS - 1e-9));
        for (let k = 0; k < n; k++) picots.push(p.debut + (k * p.etendue) / n);
      }
      this.picots = picots.filter((a, i) => i === 0 || a - picots[i - 1] >= ECART_MIN_PICOTS);
      if (this.picots.length > 1 && 360 - this.picots[this.picots.length - 1] < ECART_MIN_PICOTS) this.picots.pop();
      let ecartMin = 360;
      this.picots.forEach((a, i) => {
        const suivant = i + 1 < this.picots.length ? this.picots[i + 1] : this.picots[0] + 360;
        ecartMin = Math.min(ecartMin, suivant - a);
      });
      this.contact = borner(ecartMin * 0.42, 0.6, 3.2);

      this.effacerGagnant();
      this.preparerRoue();
    }

    effacerGagnant() {
      this.gagnant = null;
      this.surbrillance = 0;
      if (this.lumieres.mode === "victoire") this.lumieres.mode = "repos";
    }

    partSousFleche() {
      const a = mod(-this.rot, 360);
      return this.parts.find((p) => a >= p.debut && a < p.debut + p.etendue) || this.parts[this.parts.length - 1];
    }

    // Lance la roue. Le gagnant est tiré selon les pourcentages, puis la roue est freinée
    // pour s'arrêter dessus. `v0` (°/s) permet d'enchaîner sur un lancer à la main.
    lancer({ sens = 1, v0 = null, duree = 8, tours = 6 } = {}) {
      if (this.anim || !this.parts.length) return null;
      this.glisse = null;
      this.effacerGagnant();

      let r = hasard();
      let part = this.parts[this.parts.length - 1];
      for (const p of this.parts) {
        if (r < p.chance) {
          part = p;
          break;
        }
        r -= p.chance;
      }
      const cible = part.debut + part.etendue * (0.12 + 0.76 * hasard());
      const reste = sens > 0 ? mod(-cible - this.rot, 360) : mod(cible + this.rot, 360);

      let distance;
      let secondes;
      if (v0) {
        const voulu = (v0 * borner(duree * (0.55 + v0 / 2000), 3.5, 15)) / 3;
        distance = reste + 360 * Math.max(2, Math.round((voulu - reste) / 360));
        secondes = borner((3 * distance) / v0, 3, 16);
      } else {
        distance = reste + 360 * (tours + Math.floor(hasard() * 2));
        secondes = duree * (0.92 + hasard() * 0.16);
      }

      this.anim = {
        de: this.rot,
        vers: this.rot + sens * distance,
        debut: performance.now(),
        duree: secondes * 1000,
        recul: false,
      };
      this.sens = sens;
      this.lumieres.mode = "rotation";
      return part;
    }

    // ----- Boucle d'animation -----

    boucle(t) {
      const dt = Math.min(0.05, (t - this.dernierT) / 1000);
      this.dernierT = t;
      this.avancer(t, dt);
      const calme = !this.anim && !this.glisse && Math.abs(this.fleche.angle) < 0.05 && Math.abs(this.fleche.vit) < 0.5;
      if (!calme || t - this.dernierRendu > 40) {
        this.dessiner(t);
        this.dernierRendu = t;
      }
      requestAnimationFrame((t2) => this.boucle(t2));
    }

    avancer(t, dt) {
      let fini = false;
      const a = this.anim;
      if (a) {
        const p = (t - a.debut) / a.duree;
        if (p >= 1) {
          this.rot = a.vers;
          fini = true;
        } else {
          const e = a.recul ? 1 - (1 - p) * (1 - p) : 1 - Math.pow(1 - p, 3);
          this.rot = a.de + (a.vers - a.de) * e;
        }
      }

      const delta = this.rot - this.rotPrec;
      if (delta !== 0 && !(a && a.recul)) this.sens = Math.sign(delta);
      if (dt > 0) this.vitesse += (Math.abs(delta) / dt - this.vitesse) * Math.min(1, dt * 12);
      this.compterPicots(this.rotPrec, this.rot, dt);
      this.rotPrec = this.rot;
      this.animerFleche(dt);
      if (this.rappels.vitesse) this.rappels.vitesse(this.vitesse / 360);

      if (this.gagnant && this.surbrillance < 1) this.surbrillance = Math.min(1, this.surbrillance + dt * 2.5);
      const l = this.lumieres;
      const pas = l.mode === "rotation" ? borner(3 + this.vitesse / 35, 3, 26) : l.mode === "victoire" ? 0 : 2.2;
      l.phase += pas * dt;

      if (fini) this.terminerAnimation();
    }

    terminerAnimation() {
      const { recul, sansFin } = this.anim;
      this.anim = null;
      if (sansFin) {
        this.vitesse = 0;
        return;
      }
      // Si la roue s'arrête contre un picot, la flèche la repousse un peu en arrière.
      const d = recul ? null : this.picotEnContact();
      if (d != null) {
        this.anim = {
          de: this.rot,
          vers: this.rot - this.sens * (d + 0.25),
          debut: performance.now(),
          duree: 260,
          recul: true,
        };
        return;
      }
      this.vitesse = 0;
      const part = this.partSousFleche();
      this.gagnant = part;
      this.surbrillance = 0;
      this.lumieres.mode = "victoire";
      this.lumieres.depuis = performance.now();
      if (this.rappels.fin) this.rappels.fin(part);
    }

    // Distance (en degrés) dont la roue est « montée » sur le picot qui touche la flèche, sinon null.
    picotEnContact() {
      let enfonce = null;
      for (const p of this.picots) {
        const ecart = mod(p + this.rot + 180, 360) - 180;
        const avant = -this.sens * ecart;
        if (avant > 0 && avant <= this.contact) enfonce = Math.max(enfonce || 0, this.contact - avant);
      }
      return enfonce;
    }

    compterPicots(a0, a1, dt) {
      if (a0 === a1 || !this.picots.length) return;
      const bas = Math.min(a0, a1);
      const haut = Math.max(a0, a1);
      const passages = [];
      for (const p of this.picots) {
        // Le picot p passe sous la flèche quand rot ≡ -p (mod 360).
        let v = -p + 360 * Math.ceil((bas + p) / 360);
        if (v <= bas) v += 360;
        for (; v <= haut; v += 360) passages.push(Math.abs(v - a0) / (haut - bas));
      }
      if (!passages.length) return;
      passages.sort((x, y) => x - y);
      const vitesse = (haut - bas) / Math.max(dt, 1 / 240);
      // Plus la flèche claque souvent, plus chaque claquement est doux (sinon, au départ,
      // des dizaines de claquements par seconde à pleine force agressent les oreilles).
      const parSeconde = (vitesse * this.picots.length) / 360;
      const force = borner(1.1 / (1 + parSeconde / 12), 0.14, 1);
      let dernier = -1;
      for (const f of passages) {
        const delai = f * dt;
        if (dernier >= 0 && delai - dernier < 0.02) continue;
        dernier = delai;
        if (this.rappels.clic) this.rappels.clic(force * (0.88 + hasard() * 0.12), delai);
      }
      // Le picot vient de libérer la flèche : elle part du côté opposé à son appui.
      const f = this.fleche;
      const sens = Math.sign(a1 - a0);
      if (sens * f.angle < DEFLEXION_MAX * 0.8) f.angle = sens * DEFLEXION_MAX * borner(0.6 + vitesse / 2500, 0.6, 1);
    }

    animerFleche(dt) {
      const f = this.fleche;
      let pousse = 0;
      for (const p of this.picots) {
        const ecart = mod(p + this.rot + 180, 360) - 180;
        const avant = -this.sens * ecart;
        if (avant > 0 && avant <= this.contact) pousse = Math.max(pousse, 1 - avant / this.contact);
      }
      // Ressort amorti (≈ 6 Hz), intégré par petits pas.
      const raideur = 1500;
      const amorti = 15;
      const n = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        f.vit += (-raideur * f.angle - amorti * f.vit) * h;
        f.angle += f.vit * h;
      }
      // Tant qu'un picot appuie, la flèche ne peut pas revenir plus près du centre.
      const appui = this.sens * pousse * DEFLEXION_MAX;
      if (pousse > 0 && this.sens * f.angle < this.sens * appui) {
        f.angle = appui;
        f.vit = 0;
      }
      if (Math.abs(f.angle) < 0.01 && Math.abs(f.vit) < 0.05) f.angle = f.vit = 0;
    }

    // ----- Souris : clic sur le moyeu, ou lancer la roue à la main -----

    position(e) {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left - this.S / 2;
      const y = e.clientY - r.top - this.S / 2;
      return { distance: Math.hypot(x, y) / this.R, angle: Math.atan2(y, x) / RAD };
    }

    brancherSouris() {
      const c = this.canvas;
      c.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || this.anim) return;
        const p = this.position(e);
        if (p.distance <= G.moyeu) {
          this.appuiMoyeu = true;
          return;
        }
        if (p.distance > G.jante || !this.parts.length) return;
        c.setPointerCapture(e.pointerId);
        this.effacerGagnant();
        this.lumieres.mode = "repos";
        this.glisse = { angle: p.angle, rot: this.rot, echantillons: [{ t: performance.now(), rot: this.rot }] };
        c.style.cursor = "grabbing";
      });

      c.addEventListener("pointermove", (e) => {
        const p = this.position(e);
        if (this.glisse) {
          const g = this.glisse;
          let d = p.angle - g.angle;
          d = mod(d + 180, 360) - 180;
          g.angle = p.angle;
          g.rot += d;
          this.rot = g.rot;
          const t = performance.now();
          g.echantillons.push({ t, rot: g.rot });
          while (g.echantillons.length > 2 && t - g.echantillons[0].t > 110) g.echantillons.shift();
          return;
        }
        this.survolMoyeu = !this.anim && p.distance <= G.moyeu;
        c.style.cursor = this.anim ? "default" : this.survolMoyeu ? "pointer" : p.distance <= G.jante && this.parts.length ? "grab" : "default";
      });

      const lacher = (e) => {
        if (this.appuiMoyeu) {
          this.appuiMoyeu = false;
          if (this.position(e).distance <= G.moyeu && this.rappels.lancement) this.rappels.lancement();
          return;
        }
        const g = this.glisse;
        if (!g) return;
        this.glisse = null;
        c.style.cursor = "grab";
        const t = performance.now();
        const ech = g.echantillons.filter((s) => t - s.t <= 110);
        if (ech.length < 2 || t - ech[ech.length - 1].t > 70) return this.reposerApresGlisse();
        const v = ((ech[ech.length - 1].rot - ech[0].rot) / (ech[ech.length - 1].t - ech[0].t)) * 1000;
        if (Math.abs(v) < 160) return this.reposerApresGlisse();
        if (this.rappels.lancement) this.rappels.lancement({ sens: Math.sign(v), v0: borner(Math.abs(v), 300, 2600) });
      };
      c.addEventListener("pointerup", lacher);
      c.addEventListener("pointercancel", lacher);
      c.addEventListener("pointerleave", () => (this.survolMoyeu = false));
    }

    reposerApresGlisse() {
      const d = this.picotEnContact();
      if (d != null) {
        this.anim = { de: this.rot, vers: this.rot - this.sens * (d + 0.25), debut: performance.now(), duree: 220, recul: true, sansFin: true };
      }
    }

    // ----- Dessin -----

    redimensionner() {
      const parent = this.canvas.parentElement;
      const S = Math.floor(Math.min(parent.clientWidth, parent.clientHeight));
      const dpr = window.devicePixelRatio || 1;
      if (S <= 0 || (S === this.S && dpr === this.dpr)) return;
      this.S = S;
      // La tête de la flèche monte jusqu'à 1,02 R : on garde la marge nécessaire.
      this.R = S / 2 / 1.045;
      this.dpr = dpr;
      this.canvas.width = Math.round(S * dpr);
      this.canvas.height = Math.round(S * dpr);
      this.canvas.style.width = S + "px";
      this.canvas.style.height = S + "px";
      this.preparerCadre();
      this.preparerRoue();
      this.preparerVerre();
      this.dessiner(performance.now());
    }

    preparerCadre() {
      const { R, dpr } = this;
      const c = toile(this.S * dpr, this.S * dpr);
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.translate(this.S / 2, this.S / 2);

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = R * 0.07;
      ctx.shadowOffsetY = R * 0.025;
      const fond = ctx.createRadialGradient(0, -R * 0.2, R * 0.6, 0, 0, R);
      fond.addColorStop(0, "#33287E");
      fond.addColorStop(1, "#160F3F");
      ctx.fillStyle = fond;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.995, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = R * 0.012;
      ctx.strokeStyle = degradeOr(ctx, R);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.99, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = R * 0.006;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      ctx.arc(0, 0, G.cadreInt * R, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < NB_AMPOULES; i++) {
        const a = ((i + 0.5) * 360) / NB_AMPOULES - 90;
        const x = Math.cos(a * RAD) * G.ampoules * R;
        const y = Math.sin(a * RAD) * G.ampoules * R;
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.arc(x, y, G.ampouleR * R * 1.45, 0, Math.PI * 2);
        ctx.fill();
      }
      this.imgCadre = c;
    }

    preparerRoue() {
      if (!this.S) return;
      const { R, dpr } = this;
      const Rj = G.jante * R;
      const rs = G.janteInt * R;
      const c = toile(2 * Rj * dpr, 2 * Rj * dpr);
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.translate(Rj, Rj);

      if (!this.parts.length) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rs);
        g.addColorStop(0, "#34366a");
        g.addColorStop(1, "#1d1e3e");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rs, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.font = `600 ${Math.round(R * 0.06)}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Ajoutez des choix", 0, -R * 0.4);
      }

      for (const p of this.parts) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        if (p.etendue >= 359.999) {
          ctx.arc(0, 0, rs, 0, Math.PI * 2);
        } else {
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, rs, (p.debut - 90) * RAD, (p.debut + p.etendue - 90) * RAD);
          ctx.closePath();
        }
        ctx.fill();
      }

      // Relief : centre légèrement éclairci, bord assombri.
      const relief = ctx.createRadialGradient(0, 0, rs * 0.1, 0, 0, rs);
      relief.addColorStop(0, "rgba(255, 255, 255, 0.14)");
      relief.addColorStop(0.5, "rgba(255, 255, 255, 0)");
      relief.addColorStop(0.85, "rgba(0, 0, 0, 0.06)");
      relief.addColorStop(1, "rgba(0, 0, 0, 0.28)");
      ctx.fillStyle = relief;
      ctx.beginPath();
      ctx.arc(0, 0, rs, 0, Math.PI * 2);
      ctx.fill();

      if (this.parts.length > 1) {
        ctx.strokeStyle = "rgba(255, 250, 235, 0.85)";
        ctx.lineWidth = Math.max(1, R * 0.0055);
        ctx.lineCap = "round";
        for (const p of this.parts) {
          const a = (p.debut - 90) * RAD;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * rs, Math.sin(a) * rs);
          ctx.stroke();
        }
      }

      for (const p of this.parts) this.ecrire(ctx, p);

      // Jante dorée.
      ctx.beginPath();
      ctx.arc(0, 0, Rj, 0, Math.PI * 2);
      ctx.arc(0, 0, rs, 0, Math.PI * 2, true);
      ctx.fillStyle = degradeOr(ctx, Rj);
      ctx.fill();
      ctx.lineWidth = Math.max(1, R * 0.004);
      ctx.strokeStyle = "rgba(90, 50, 0, 0.55)";
      ctx.beginPath();
      ctx.arc(0, 0, rs, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 245, 210, 0.6)";
      ctx.beginPath();
      ctx.arc(0, 0, Rj - ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();

      // Picots.
      const pr = G.picotR * R;
      for (const a of this.picots) {
        const x = Math.cos((a - 90) * RAD) * G.picots * R;
        const y = Math.sin((a - 90) * RAD) * G.picots * R;
        ctx.fillStyle = "rgba(60, 30, 0, 0.45)";
        ctx.beginPath();
        ctx.arc(x + pr * 0.25, y + pr * 0.35, pr * 1.05, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(x - pr * 0.35, y - pr * 0.35, pr * 0.1, x, y, pr);
        g.addColorStop(0, "#FFFFFF");
        g.addColorStop(0.45, "#E4E6F2");
        g.addColorStop(1, "#8C90AA");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      this.imgRoue = c;
    }

    ecrire(ctx, p) {
      const R = this.R;
      const exterieur = G.texteExt * R;
      const longueurMax = exterieur - G.texteInt * R;
      const demi = (Math.min(p.etendue, 180) / 2) * RAD;
      const police = (t) => `700 ${t}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
      const tailleMax = Math.max(10, R * 0.072);
      const tailleMin = Math.max(9, R * 0.03);

      // La hauteur du texte est limitée par la largeur de la part à son extrémité intérieure.
      const tient = (t, largeur) => {
        const interieur = exterieur - largeur;
        return t <= 2 * interieur * Math.sin(demi) * 0.82;
      };

      let texte = p.label.trim() || "—";
      let taille = tailleMax;
      ctx.font = police(taille);
      let largeur = ctx.measureText(texte).width;
      while (taille > tailleMin && (largeur > longueurMax || !tient(taille, largeur))) {
        taille -= 0.5;
        ctx.font = police(taille);
        largeur = ctx.measureText(texte).width;
      }
      if (largeur > longueurMax || !tient(taille, largeur)) {
        while (texte.length > 1) {
          texte = texte.slice(0, -1);
          largeur = ctx.measureText(texte.trimEnd() + "…").width;
          if (largeur <= longueurMax && tient(taille, largeur)) break;
        }
        texte = texte.trimEnd() + "…";
        if (texte.length < 3 || !tient(taille, ctx.measureText(texte).width)) return;
      }

      ctx.save();
      ctx.rotate((p.debut + p.etendue / 2 - 90) * RAD);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const fonce = clair(p.color);
      ctx.shadowColor = fonce ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = taille * 0.25;
      ctx.shadowOffsetY = fonce ? 0 : taille * 0.06;
      ctx.fillStyle = fonce ? "#1C1440" : "#FFFFFF";
      ctx.fillText(texte, exterieur, taille * 0.04);
      ctx.restore();
    }

    preparerVerre() {
      const { R, dpr } = this;
      const c = toile(this.S * dpr, this.S * dpr);
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.translate(this.S / 2, this.S / 2);

      // Reflet sur la roue.
      const reflet = ctx.createRadialGradient(-R * 0.38, -R * 0.5, 0, -R * 0.2, -R * 0.3, R * 0.95);
      reflet.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      reflet.addColorStop(0.55, "rgba(255, 255, 255, 0.03)");
      reflet.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = reflet;
      ctx.beginPath();
      ctx.arc(0, 0, G.janteInt * R, 0, Math.PI * 2);
      ctx.fill();

      // Moyeu.
      const m = G.moyeu * R;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = R * 0.04;
      ctx.shadowOffsetY = R * 0.012;
      ctx.fillStyle = degradeOr(ctx, m);
      ctx.beginPath();
      ctx.arc(0, 0, m, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const centre = ctx.createRadialGradient(-m * 0.3, -m * 0.4, m * 0.1, 0, 0, m * 0.8);
      centre.addColorStop(0, "#41359A");
      centre.addColorStop(1, "#140D3A");
      ctx.fillStyle = centre;
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = Math.max(1, R * 0.003);
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      if (this.logo) {
        // Logo au centre, rogné en cercle ; le carré blanc tient dans le disque.
        const ri = m * 0.8;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, ri, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(this.logo, -ri * 1.13, -ri * 1.13, ri * 2.26, ri * 2.26);
        ctx.restore();
      } else {
        ctx.fillStyle = "#FFE3A0";
        ctx.font = `800 ${Math.round(m * 0.27)}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
        ctx.letterSpacing = `${(m * 0.03).toFixed(1)}px`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("LANCER", m * 0.015, m * 0.03);
      }
      this.imgVerre = c;
    }

    dessiner(t) {
      const { ctx, S, R, dpr } = this;
      if (!S || !this.imgRoue) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(this.imgCadre, 0, 0, S, S);
      ctx.translate(S / 2, S / 2);

      this.dessinerAmpoules(t);

      const Rj = G.jante * R;
      ctx.save();
      ctx.rotate(this.rot * RAD);
      ctx.drawImage(this.imgRoue, -Rj, -Rj, 2 * Rj, 2 * Rj);
      if (this.gagnant && this.parts.length > 1) this.dessinerGagnant(t);
      ctx.restore();

      ctx.drawImage(this.imgVerre, -S / 2, -S / 2, S, S);

      if (this.survolMoyeu && !this.anim) {
        ctx.strokeStyle = "rgba(255, 214, 110, 0.75)";
        ctx.lineWidth = R * 0.012;
        ctx.shadowColor = "rgba(255, 200, 80, 0.9)";
        ctx.shadowBlur = R * 0.04;
        ctx.beginPath();
        ctx.arc(0, 0, G.moyeu * R * 1.04, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }

      this.dessinerFleche();
    }

    dessinerGagnant(t) {
      const { ctx, R } = this;
      const rs = G.janteInt * R;
      const s = this.surbrillance;
      const g = this.gagnant;
      ctx.fillStyle = `rgba(6, 5, 24, ${0.55 * s})`;
      ctx.beginPath();
      ctx.arc(0, 0, rs, 0, Math.PI * 2);
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rs, (g.debut + g.etendue - 90) * RAD, (g.debut - 90) * RAD, true);
      ctx.closePath();
      ctx.fill("evenodd");

      const pulsation = 0.65 + 0.35 * Math.sin(t / 180);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rs - R * 0.006, (g.debut - 90) * RAD, (g.debut + g.etendue - 90) * RAD);
      ctx.closePath();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * s})`;
      ctx.lineWidth = R * 0.012;
      ctx.lineJoin = "round";
      ctx.shadowColor = g.color;
      ctx.shadowBlur = R * 0.06 * pulsation * s;
      ctx.stroke();
      ctx.restore();
    }

    dessinerAmpoules(t) {
      const { ctx, R } = this;
      const l = this.lumieres;
      const r = G.ampouleR * R;
      let allumee;
      if (l.mode === "victoire") {
        const ecoule = t - l.depuis;
        const etape = Math.floor(ecoule / 180);
        allumee = ecoule < 2600 ? (i) => (i + etape) % 2 === 0 : (i) => (Math.floor(ecoule / 700) + i) % 4 !== 0;
      } else {
        const phase = Math.floor(l.phase);
        allumee = (i) => mod(i - phase, 3) === 0;
      }
      for (let i = 0; i < NB_AMPOULES; i++) {
        const a = (((i + 0.5) * 360) / NB_AMPOULES - 90) * RAD;
        const x = Math.cos(a) * G.ampoules * R;
        const y = Math.sin(a) * G.ampoules * R;
        if (allumee(i)) {
          const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
          halo.addColorStop(0, "rgba(255, 220, 130, 0.55)");
          halo.addColorStop(1, "rgba(255, 200, 90, 0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
          ctx.fill();
          const coeur = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
          coeur.addColorStop(0, "#FFFFFF");
          coeur.addColorStop(0.5, "#FFF1C2");
          coeur.addColorStop(1, "#FFC54D");
          ctx.fillStyle = coeur;
        } else {
          const eteinte = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
          eteinte.addColorStop(0, "#8A7346");
          eteinte.addColorStop(1, "#3E2F17");
          ctx.fillStyle = eteinte;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    dessinerFleche() {
      const { ctx, R } = this;
      const L = (G.pivot - G.pointe) * R;
      const w = G.flecheLarg * R;
      ctx.save();
      ctx.translate(0, -G.pivot * R);
      ctx.rotate(-this.fleche.angle * RAD);

      ctx.beginPath();
      ctx.moveTo(0, L);
      ctx.bezierCurveTo(w * 0.35, L * 0.62, w, L * 0.28, w, 0);
      ctx.arc(0, 0, w, 0, Math.PI, true);
      ctx.bezierCurveTo(-w, L * 0.28, -w * 0.35, L * 0.62, 0, L);
      ctx.closePath();
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = R * 0.025;
      ctx.shadowOffsetY = R * 0.012;
      const corps = ctx.createLinearGradient(-w, 0, w, 0);
      corps.addColorStop(0, "#FF7FA0");
      corps.addColorStop(0.45, "#FF3D6E");
      corps.addColorStop(1, "#C70F45");
      ctx.fillStyle = corps;
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = Math.max(1.5, R * 0.007);
      ctx.strokeStyle = "#FFF6E6";
      ctx.lineJoin = "round";
      ctx.stroke();

      const goupille = w * 0.42;
      ctx.fillStyle = degradeOr(ctx, goupille);
      ctx.beginPath();
      ctx.arc(0, 0, goupille, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, R * 0.003);
      ctx.strokeStyle = "rgba(90, 50, 0, 0.7)";
      ctx.stroke();
      ctx.restore();
    }
  }

  window.Roue = Roue;
})();
