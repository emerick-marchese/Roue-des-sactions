// Sons de la roue, entièrement synthétisés (aucun fichier audio à fournir) :
// le claquement de la flèche sur chaque picot, le roulement, l'élan au lancer et la fanfare.
(function () {
  // Chaque timbre de claquement = un bruit d'impact très court + quelques résonances amorties.
  const TIMBRES = {
    plastique: {
      bruit: { amp: 0.35, duree: 0.0008 },
      modes: [
        [1900, 0.006, 1],
        [3400, 0.0022, 0.3],
        [1050, 0.011, 0.55],
        [300, 0.018, 0.4],
      ],
    },
    bois: {
      bruit: { amp: 0.55, duree: 0.0016 },
      modes: [
        [880, 0.014, 1],
        [1720, 0.0065, 0.55],
        [2950, 0.003, 0.3],
        [190, 0.028, 0.45],
      ],
    },
    // Grosse roue de plateau télé : clac grave et sec, avec un peu de résonance du bois.
    plateau: {
      bruit: { amp: 0.5, duree: 0.0012 },
      modes: [
        [640, 0.018, 1],
        [1480, 0.008, 0.6],
        [2850, 0.0035, 0.25],
        [150, 0.045, 0.7],
      ],
    },
    metal: {
      bruit: { amp: 0.3, duree: 0.0006 },
      modes: [
        [2650, 0.04, 0.75],
        [4300, 0.022, 0.3],
        [6100, 0.012, 0.12],
        [1320, 0.03, 0.4],
      ],
    },
  };

  let ctx = null;
  let maitre = null;
  let envoiReverb = null;
  let busClics = null;
  let roulement = null;
  const claquements = {};
  const reglages = { volume: 0.8, actif: true, timbre: "plastique" };
  let prochainClic = 0;
  const DUREE_PERSO = 0.4;

  function contexte() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    ctx = new AudioContext({ latencyHint: "interactive" });
    const compresseur = ctx.createDynamicsCompressor();
    compresseur.threshold.value = -12;
    compresseur.knee.value = 10;
    compresseur.ratio.value = 4;
    compresseur.attack.value = 0.002;
    compresseur.release.value = 0.15;
    maitre = ctx.createGain();
    maitre.gain.value = gainMaitre();
    maitre.connect(compresseur).connect(ctx.destination);

    // Petite réverbération de pièce, pour que les claquements ne sonnent pas « dans le vide ».
    const reverb = ctx.createConvolver();
    reverb.buffer = reponsePiece(0.9);
    const retour = ctx.createGain();
    retour.gain.value = 0.22;
    envoiReverb = ctx.createGain();
    envoiReverb.connect(reverb).connect(retour).connect(maitre);

    // Les claquements passent par un filtre qui enlève les aigus les plus agressifs.
    const doux = ctx.createBiquadFilter();
    doux.type = "lowpass";
    doux.frequency.value = 4800;
    doux.Q.value = 0.5;
    busClics = ctx.createGain();
    busClics.gain.value = 0.8;
    busClics.connect(doux);
    doux.connect(maitre);
    doux.connect(envoiReverb);
    return ctx;
  }

  function gainMaitre() {
    return reglages.actif ? reglages.volume * reglages.volume * 0.85 : 0;
  }

  function reponsePiece(duree) {
    const n = Math.floor(ctx.sampleRate * duree);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 120 ? i / 120 : 1);
      }
    }
    return b;
  }

  function fabriquerClaquement(timbre) {
    const sr = ctx.sampleRate;
    const duree = Math.max(...timbre.modes.map((m) => m[1])) * 7 + 0.01;
    const n = Math.floor(sr * duree);
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const modes = timbre.modes.map(([f, decroissance, amp]) => ({
      f: f * (0.96 + Math.random() * 0.08),
      decroissance: decroissance * (0.9 + Math.random() * 0.2),
      amp,
      phase: Math.random() * Math.PI * 2,
    }));
    let precedent = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const blanc = Math.random() * 2 - 1;
      const aigu = blanc - precedent; // passe-haut très simple
      precedent = blanc;
      let s = aigu * timbre.bruit.amp * Math.exp(-t / timbre.bruit.duree);
      for (const m of modes) s += m.amp * Math.exp(-t / m.decroissance) * Math.sin(2 * Math.PI * m.f * t + m.phase);
      d[i] = s * Math.min(1, i / 6);
    }
    let crete = 0;
    for (let i = 0; i < n; i++) crete = Math.max(crete, Math.abs(d[i]));
    for (let i = 0; i < n; i++) d[i] *= 0.9 / crete;
    return b;
  }

  function variantes(nom) {
    if (nom === "perso") return claquements.perso || variantes("plastique");
    if (!claquements[nom]) {
      claquements[nom] = Array.from({ length: 5 }, () => fabriquerClaquement(TIMBRES[nom]));
    }
    return claquements[nom];
  }

  function bruit(duree) {
    const n = Math.floor(ctx.sampleRate * duree);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let brun = 0;
    for (let i = 0; i < n; i++) {
      brun = (brun + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = brun * 3.5;
    }
    return b;
  }

  const Sons = {
    regler(r) {
      Object.assign(reglages, r);
      if (maitre) maitre.gain.setTargetAtTime(gainMaitre(), ctx.currentTime, 0.02);
    },

    // Un claquement de la flèche. `force` 0..1, `delai` en secondes.
    clic(force = 1, delai = 0) {
      if (!reglages.actif) return;
      contexte();
      // Au plus un claquement toutes les 20 ms : au-delà, on en saute plutôt que de saturer.
      const t = ctx.currentTime + delai;
      if (t < prochainClic) return;
      prochainClic = t + 0.02;
      const liste = variantes(reglages.timbre);
      const perso = reglages.timbre === "perso" && claquements.perso;
      const source = ctx.createBufferSource();
      source.buffer = liste[Math.floor(Math.random() * liste.length)];
      source.playbackRate.value = perso ? 1 : 0.94 + Math.random() * 0.12;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.85 * force, t);
      source.connect(gain).connect(busClics);
      source.start(t);
      if (perso) {
        // Un son importé peut être long : on n'en garde que le début, avec un fondu.
        gain.gain.setValueAtTime(0.85 * force, t + DUREE_PERSO - 0.04);
        gain.gain.linearRampToValueAtTime(0, t + DUREE_PERSO);
        source.stop(t + DUREE_PERSO + 0.01);
      }
    },

    // Son choisi par l'utilisateur (fichier audio), joué à la place du claquement.
    async chargerSonPerso(donnees) {
      contexte();
      claquements.perso = [await ctx.decodeAudioData(donnees)];
    },

    // Bruit de roulement qui suit la vitesse de la roue (en tours par seconde).
    vitesse(tours) {
      if (!ctx) return; // le contexte audio naît au premier claquement ou au premier lancer
      const n = reglages.actif ? Math.min(1, tours / 2.6) : 0;
      if (!roulement) {
        if (n < 0.02) return;
        const source = ctx.createBufferSource();
        source.buffer = bruit(3);
        source.loop = true;
        const filtre = ctx.createBiquadFilter();
        filtre.type = "bandpass";
        filtre.Q.value = 0.8;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        source.connect(filtre).connect(gain).connect(maitre);
        source.start();
        roulement = { source, filtre, gain, n: 0 };
      }
      if (Math.abs(n - roulement.n) < 0.01) return;
      roulement.n = n;
      const t = ctx.currentTime;
      roulement.gain.gain.setTargetAtTime(0.1 * n * n, t, 0.06);
      roulement.filtre.frequency.setTargetAtTime(160 + 700 * n, t, 0.06);
    },

    // Souffle au moment du lancer.
    elan(force = 1) {
      if (!reglages.actif) return;
      contexte();
      const t = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = bruit(0.8);
      const filtre = ctx.createBiquadFilter();
      filtre.type = "bandpass";
      filtre.Q.value = 1.1;
      filtre.frequency.setValueAtTime(380, t);
      filtre.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
      filtre.frequency.exponentialRampToValueAtTime(700, t + 0.7);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28 * force, t + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      source.connect(filtre).connect(gain).connect(maitre);
      source.start(t);
      source.stop(t + 0.8);
    },

    // Fanfare de victoire : arpège de cloches, accord cuivré, quelques étincelles.
    victoire() {
      if (!reglages.actif) return;
      contexte();
      const t0 = ctx.currentTime + 0.03;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => cloche(f, t0 + i * 0.085, 0.32, 1.1));
      [261.63, 523.25, 659.25, 783.99].forEach((f) => cuivre(f, t0 + 0.36, 1.5));
      cloche(1046.5, t0 + 0.36, 0.3, 2.2);
      cloche(1568, t0 + 0.37, 0.16, 1.8);
      for (let i = 0; i < 12; i++) cloche(1900 + Math.random() * 2600, t0 + 0.45 + Math.random() * 1.1, 0.05 + Math.random() * 0.05, 0.4);
    },

    // Petit son d'interface (ajout, suppression…).
    pop(aigu = 1) {
      if (!reglages.actif) return;
      contexte();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(520 * aigu, t);
      o.frequency.exponentialRampToValueAtTime(880 * aigu, t + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(maitre);
      o.start(t);
      o.stop(t + 0.15);
    },
  };

  function cloche(f, t, amp, duree) {
    [
      [1, 1],
      [2, 0.32],
      [3.01, 0.16],
      [4.17, 0.07],
    ].forEach(([rapport, a]) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * rapport;
      const g = ctx.createGain();
      const fin = t + duree / Math.sqrt(rapport);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * a, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, fin);
      o.connect(g);
      g.connect(maitre);
      g.connect(envoiReverb);
      o.start(t);
      o.stop(fin + 0.05);
    });
  }

  function cuivre(f, t, duree) {
    const filtre = ctx.createBiquadFilter();
    filtre.type = "lowpass";
    filtre.Q.value = 2;
    filtre.frequency.setValueAtTime(500, t);
    filtre.frequency.exponentialRampToValueAtTime(3200, t + 0.08);
    filtre.frequency.exponentialRampToValueAtTime(1100, t + duree);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.05);
    g.gain.setValueAtTime(0.07, t + duree * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    filtre.connect(g);
    g.connect(maitre);
    g.connect(envoiReverb);
    [1, 1.0045].forEach((desaccord) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * desaccord;
      o.connect(filtre);
      o.start(t);
      o.stop(t + duree + 0.05);
    });
  }

  window.Sons = Sons;
})();
