// Pluie de confettis plein écran, lancée à chaque résultat.
(function () {
  const canvas = document.getElementById("confettis");
  const ctx = canvas.getContext("2d");
  let morceaux = [];
  let enCours = false;
  let precedent = 0;

  function ajuster() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", ajuster);
  ajuster();

  function boucle(t) {
    const dt = Math.min(0.033, (t - precedent) / 1000);
    precedent = t;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    morceaux = morceaux.filter((m) => m.y < innerHeight + 40 && m.vie > 0);
    for (const m of morceaux) {
      m.vx *= 1 - 1.6 * dt;
      m.vy = m.vy * (1 - 1.2 * dt) + 900 * dt;
      m.vy = Math.min(m.vy, 260 + m.flottement * 120);
      m.x += (m.vx + Math.sin(t / 300 + m.flottement * 6) * 30) * dt;
      m.y += m.vy * dt;
      m.rot += m.vrot * dt;
      m.retournement += m.vret * dt;
      m.vie -= dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, m.vie * 1.5);
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);
      ctx.scale(1, Math.cos(m.retournement));
      ctx.fillStyle = m.couleur;
      if (m.rond) {
        ctx.beginPath();
        ctx.arc(0, 0, m.taille * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-m.taille / 2, -m.taille * 0.3, m.taille, m.taille * 0.6);
      }
      ctx.restore();
    }
    if (morceaux.length) requestAnimationFrame(boucle);
    else {
      enCours = false;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  function salve(x, y, angle, nombre, couleurs) {
    for (let i = 0; i < nombre; i++) {
      const a = angle + (Math.random() - 0.5) * 1.1;
      const v = 650 + Math.random() * 900;
      morceaux.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 12,
        retournement: Math.random() * Math.PI,
        vret: 4 + Math.random() * 8,
        taille: 7 + Math.random() * 8,
        couleur: couleurs[Math.floor(Math.random() * couleurs.length)],
        rond: Math.random() < 0.25,
        flottement: Math.random(),
        vie: 3.2 + Math.random() * 1.6,
      });
    }
  }

  window.Confettis = {
    lancer(couleurs) {
      const palette = [...couleurs, "#FFD66B", "#FFFFFF", "#FF3D7F"];
      salve(-10, innerHeight * 0.75, -Math.PI / 3, 110, palette);
      salve(innerWidth + 10, innerHeight * 0.75, (-2 * Math.PI) / 3, 110, palette);
      salve(innerWidth / 2, innerHeight * 0.15, -Math.PI / 2, 40, palette);
      if (!enCours) {
        enCours = true;
        precedent = performance.now();
        requestAnimationFrame(boucle);
      }
    },
  };
})();
