// L'application : les roues enregistrées, l'éditeur des parts, le tirage et les réglages.
(function () {
  "use strict";

  const CLE = "la-roue.donnees.v1";
  const PALETTE = [
    "#FF3D7F", "#FF8A3D", "#FFC93C", "#2ED47A", "#1FB5E9", "#4D6BFF", "#9B4DFF", "#E84DE0",
    "#FF5A5A", "#14C9B8", "#A3E048", "#FF7EB6", "#6C7BFF", "#F9A03F", "#3DDC97", "#C86BFA",
  ];
  const PROFILS = {
    rapide: { duree: 4.5, tours: 4 },
    normale: { duree: 8, tours: 6 },
    longue: { duree: 12.5, tours: 8 },
  };
  const PART_MAX = 100;

  const $ = (s) => document.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
  const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const echapper = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const total = (segments) => segments.reduce((t, s) => t + s.weight, 0);

  function lireNombre(texte) {
    const t = String(texte).replace(/[\s%  ]/g, "").replace(",", ".");
    if (t === "" || !/^\d*\.?\d*$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.min(PART_MAX, Math.max(0, Math.round(n * 100) / 100)) : null;
  }

  // ----- Données -----

  function nouvelleRoue(titre, choix) {
    return {
      id: uid(),
      titre,
      segments: choix.map(([label, weight], i) => ({ id: uid(), label, weight, color: PALETTE[i % PALETTE.length] })),
      historique: [],
    };
  }

  function donneesParDefaut() {
    const r = nouvelleRoue("On mange quoi ?", [
      ["Pizza", 25],
      ["Burger", 20],
      ["Sushi", 15],
      ["Tacos", 15],
      ["Salade", 10],
      ["Crêpes", 15],
    ]);
    return {
      version: 1,
      roues: [r],
      actuelle: r.id,
      reglages: { volume: 0.8, son: true, timbre: "plastique", duree: "normale", confettis: true, retirerGagnant: false, panneau: true },
    };
  }

  function charger() {
    try {
      const d = JSON.parse(localStorage.getItem(CLE));
      if (d && Array.isArray(d.roues) && d.roues.length) {
        d.reglages = { ...donneesParDefaut().reglages, ...d.reglages };
        if (!d.roues.some((r) => r.id === d.actuelle)) d.actuelle = d.roues[0].id;
        return d;
      }
    } catch {
      // Données illisibles : on repart de la roue d'exemple.
    }
    return donneesParDefaut();
  }

  let donnees = charger();
  let minuterie = null;
  const ecrire = () => {
    try {
      localStorage.setItem(CLE, JSON.stringify(donnees));
    } catch {
      // Stockage indisponible : l'application reste utilisable, sans mémoire.
    }
  };
  const sauver = () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(ecrire, 200);
  };
  addEventListener("beforeunload", ecrire);

  const roueActuelle = () => donnees.roues.find((r) => r.id === donnees.actuelle);
  const reglages = () => donnees.reglages;

  function couleurSuivante(segments) {
    const prises = new Set(segments.map((s) => s.color.toUpperCase()));
    const libre = PALETTE.find((c) => !prises.has(c));
    if (libre) return libre;
    const voisines = [segments[segments.length - 1]?.color, segments[0]?.color];
    return PALETTE.find((c, i) => i >= segments.length % PALETTE.length && !voisines.includes(c)) || PALETTE[0];
  }

  const partsEgales = (segments) =>
    segments.length > 0 && segments.every((s) => Math.abs(s.weight - segments[0].weight) <= 0.02) && Math.abs(total(segments) - 100) <= 0.05;

  function repartirEgal(segments) {
    if (!segments.length) return;
    const part = Math.floor((100 / segments.length) * 100) / 100;
    segments.forEach((s) => (s.weight = part));
    segments[segments.length - 1].weight = Math.round((100 - part * (segments.length - 1)) * 100) / 100;
  }

  function ajusterA100(segments) {
    const t = total(segments);
    if (t <= 0) return repartirEgal(segments);
    segments.forEach((s) => (s.weight = Math.round(((s.weight * 100) / t) * 100) / 100));
    const ecart = Math.round((100 - total(segments)) * 100) / 100;
    if (ecart) {
      const plusGrand = segments.reduce((a, b) => (b.weight > a.weight ? b : a));
      plusGrand.weight = Math.round((plusGrand.weight + ecart) * 100) / 100;
    }
  }

  // ----- Roue et sons -----

  const btnLancer = $("#btn-lancer");
  const roue = new Roue($("#roue"), {
    clic: (force, delai) => Sons.clic(force, delai),
    vitesse: (tours) => Sons.vitesse(tours),
    fin: finDuTirage,
    lancement: (options) => lancer(options),
  });

  function appliquerReglagesSon() {
    const r = reglages();
    Sons.regler({ volume: r.volume, actif: r.son, timbre: r.timbre });
    $("#btn-son use").setAttribute("href", r.son ? "#i-son" : "#i-muet");
    $("#btn-son").title = r.son ? "Couper le son (M)" : "Remettre le son (M)";
    $("#btn-son").classList.toggle("eteint", !r.son);
  }

  function rafraichirRoue() {
    const r = roueActuelle();
    roue.definirParts(r.segments);
    $("#titre-roue").textContent = r.titre.trim() || "Ma roue";
    $("#nom-roue-barre").textContent = r.titre.trim() || "Ma roue";
    btnLancer.disabled = roue.tourne || !r.segments.some((s) => s.weight > 0);
  }

  // ----- Tirage -----

  let gagnantEnAttente = null; // retiré à la fermeture du résultat si l'option est active

  function lancer(options = {}) {
    if (roue.tourne) return;
    fermerResultat();
    const part = roue.lancer({ ...PROFILS[reglages().duree], ...options });
    if (!part) {
      notifier("Ajoutez au moins un choix avec une part au-dessus de 0 %.");
      return;
    }
    Sons.elan(options.v0 ? Math.min(1, 0.4 + options.v0 / 2000) : 1);
    verrouiller(true);
    btnLancer.disabled = true;
    btnLancer.querySelector("span").textContent = "Ça tourne…";
    fermerMenus();
  }

  // Pendant la rotation, on ne touche ni aux parts ni à la roue choisie.
  function verrouiller(oui) {
    document.body.classList.toggle("tourne", oui);
    for (const sel of ["#page-parts", "#groupe-roue", ".selecteur"]) $(sel).inert = oui;
  }

  function finDuTirage(part) {
    verrouiller(false);
    btnLancer.querySelector("span").textContent = "Lancer la roue";
    const r = roueActuelle();
    btnLancer.disabled = !r.segments.some((s) => s.weight > 0);

    r.historique.unshift({ label: part.label, color: part.color, quand: Date.now() });
    if (r.historique.length > 300) r.historique.length = 300;
    sauver();
    rendreHistorique();

    Sons.victoire();
    if (reglages().confettis) Confettis.lancer(r.segments.map((s) => s.color));
    setTimeout(() => afficherResultat(part), 280);
  }

  function afficherResultat(part) {
    const nom = $("#res-nom");
    nom.textContent = part.label.trim() || "Sans nom";
    nom.style.setProperty("--c", part.color);
    $("#res-chance").textContent = `${fmt(part.chance * 100)} % de chances`;
    const auto = reglages().retirerGagnant;
    gagnantEnAttente = auto ? part.id : null;
    $("#res-note").hidden = !auto;
    $("#res-note").textContent = `« ${nom.textContent} » sera retiré de la roue.`;
    $("#res-retirer").hidden = auto || roueActuelle().segments.length < 2;
    $("#res-retirer").dataset.id = part.id;
    ouvrir("#modale-resultat");
    $("#res-relancer").focus();
  }

  function fermerResultat() {
    if ($("#modale-resultat").hidden) return;
    fermer("#modale-resultat");
    if (gagnantEnAttente) {
      retirerSegment(gagnantEnAttente, true);
      gagnantEnAttente = null;
    }
  }

  $("#res-fermer").addEventListener("click", fermerResultat);
  $("#res-relancer").addEventListener("click", () => {
    fermerResultat();
    lancer();
  });
  $("#res-retirer").addEventListener("click", (e) => {
    fermerResultat();
    retirerSegment(e.currentTarget.dataset.id);
  });
  btnLancer.addEventListener("click", () => lancer());

  // ----- Éditeur des parts -----

  const liste = $("#liste");

  function rendreParts() {
    const r = roueActuelle();
    $("#champ-titre").value = r.titre;
    $("#nb-choix").textContent = r.segments.length ? `(${r.segments.length})` : "";
    liste.innerHTML = r.segments
      .map(
        (s) => `
      <li class="part${s.weight > 0 ? "" : " nulle"}" data-id="${s.id}">
        <div class="barre-part"></div>
        <button class="pastille" style="--c:${s.color}" title="Changer la couleur" aria-label="Couleur"></button>
        <input class="nom" value="${echapper(s.label)}" maxlength="60" placeholder="Sans nom" aria-label="Nom du choix" />
        <label class="pourcent" title="Part de la roue (molette ou flèches ↑ ↓ pour ajuster)">
          <input class="valeur" inputmode="decimal" value="${fmt(s.weight)}" aria-label="Part en pourcentage" /><span>%</span>
        </label>
        <button class="suppr" title="Retirer ce choix" aria-label="Retirer"><svg class="ic"><use href="#i-fermer" /></svg></button>
      </li>`
      )
      .join("");
    if (!r.segments.length) {
      liste.innerHTML = `<li class="liste-vide">Aucun choix pour l'instant.<br />Ajoutez-en ci-dessous ou collez une liste.</li>`;
    }
    majParts();
  }

  // Met à jour les barres de proportion et le total sans reconstruire la liste (garde le focus).
  function majParts() {
    const r = roueActuelle();
    const t = total(r.segments);
    for (const s of r.segments) {
      const li = liste.querySelector(`[data-id="${s.id}"]`);
      if (!li) continue;
      const chance = t > 0 ? (s.weight / t) * 100 : 0;
      li.style.setProperty("--part", `${chance}%`);
      li.style.setProperty("--c", s.color);
      li.classList.toggle("nulle", !(s.weight > 0));
      li.querySelector(".pourcent").title =
        Math.abs(t - 100) > 0.005 && t > 0
          ? `Chance réelle : ${fmt(chance)} % (les parts sont réparties au prorata)`
          : "Part de la roue (molette ou flèches ↑ ↓ pour ajuster)";
    }

    const el = $("#total");
    const juste = Math.abs(t - 100) <= 0.005;
    el.className = "total " + (juste ? "ok" : r.segments.length ? "ecart" : "");
    if (!r.segments.length) {
      el.innerHTML = "";
    } else if (juste) {
      el.innerHTML = `<svg class="ic"><use href="#i-ok" /></svg><span>Total : <b>100 %</b></span>`;
    } else {
      el.innerHTML = `<span>Total : <b>${fmt(t)} %</b><small>${
        t > 0 ? "La roue répartit les parts au prorata." : "Toutes les parts sont à 0 %."
      }</small></span><button class="btn mini" id="btn-ajuster"><svg class="ic"><use href="#i-pourcent" /></svg>Ramener à 100 %</button>`;
      $("#btn-ajuster").addEventListener("click", () => {
        ajusterA100(r.segments);
        modifie(true);
      });
    }
    rafraichirRoue();
  }

  function modifie(reconstruire = false) {
    sauver();
    if (reconstruire) rendreParts();
    else majParts();
  }

  function segmentDe(el) {
    const li = el.closest(".part");
    return li && roueActuelle().segments.find((s) => s.id === li.dataset.id);
  }

  liste.addEventListener("input", (e) => {
    const s = segmentDe(e.target);
    if (!s) return;
    if (e.target.classList.contains("nom")) {
      s.label = e.target.value;
      modifie();
    } else if (e.target.classList.contains("valeur")) {
      const n = lireNombre(e.target.value);
      if (n != null) {
        s.weight = n;
        modifie();
      }
    }
  });

  liste.addEventListener("focusout", (e) => {
    const s = segmentDe(e.target);
    if (s && e.target.classList.contains("valeur")) e.target.value = fmt(s.weight);
  });

  function pousserPart(input, pas) {
    const s = segmentDe(input);
    if (!s) return;
    s.weight = Math.min(PART_MAX, Math.max(0, Math.round((s.weight + pas) * 100) / 100));
    input.value = fmt(s.weight);
    modifie();
  }

  liste.addEventListener("keydown", (e) => {
    if (e.target.classList.contains("valeur") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      pousserPart(e.target, (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 5 : 1));
    } else if (e.key === "Enter" && e.target.matches("input")) {
      e.target.blur();
    }
  });

  liste.addEventListener(
    "wheel",
    (e) => {
      if (!e.target.classList.contains("valeur") || document.activeElement !== e.target) return;
      e.preventDefault();
      pousserPart(e.target, (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1));
    },
    { passive: false }
  );

  liste.addEventListener("click", (e) => {
    const s = segmentDe(e.target);
    if (!s) return;
    if (e.target.closest(".suppr")) retirerSegment(s.id);
    else if (e.target.closest(".pastille")) ouvrirPalette(e.target.closest(".pastille"), s);
  });

  function ajouterChoix(labels, parts = []) {
    const r = roueActuelle();
    const egal = r.segments.length === 0 || partsEgales(r.segments);
    labels.forEach((label, i) => {
      r.segments.push({ id: uid(), label, weight: parts[i] ?? 10, color: couleurSuivante(r.segments) });
    });
    if (egal && parts.every((p) => p == null)) repartirEgal(r.segments);
    modifie(true);
  }

  function retirerSegment(id, silencieux = false) {
    const r = roueActuelle();
    const i = r.segments.findIndex((s) => s.id === id);
    if (i < 0) return;
    const egal = partsEgales(r.segments);
    const [s] = r.segments.splice(i, 1);
    if (egal) repartirEgal(r.segments);
    modifie(true);
    Sons.pop(0.8);
    if (!silencieux) notifier(`« ${s.label.trim() || "Sans nom"} » retiré de la roue.`);
  }

  $("#form-ajout").addEventListener("submit", (e) => {
    e.preventDefault();
    const champ = $("#champ-ajout");
    const label = champ.value.trim();
    if (!label) return champ.focus();
    ajouterChoix([label]);
    Sons.pop();
    champ.value = "";
    champ.focus();
    liste.lastElementChild?.scrollIntoView({ block: "nearest" });
  });

  $("#champ-titre").addEventListener("input", (e) => {
    roueActuelle().titre = e.target.value;
    sauver();
    rafraichirRoue();
  });

  $("#btn-egal").addEventListener("click", () => {
    repartirEgal(roueActuelle().segments);
    modifie(true);
  });

  $("#btn-melanger").addEventListener("click", () => {
    const segs = roueActuelle().segments;
    for (let i = segs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [segs[i], segs[j]] = [segs[j], segs[i]];
    }
    modifie(true);
    Sons.pop(1.2);
  });

  // ----- Coller une liste -----

  $("#btn-lot").addEventListener("click", () => {
    $("#champ-lot").value = "";
    $("#lot-remplacer").checked = false;
    ouvrir("#modale-lot");
    $("#champ-lot").focus();
  });
  $("#lot-annuler").addEventListener("click", () => fermer("#modale-lot"));
  $("#form-lot").addEventListener("submit", (e) => {
    e.preventDefault();
    const labels = [];
    const parts = [];
    for (const ligne of $("#champ-lot").value.split(/\r?\n/)) {
      const propre = ligne.trim();
      if (!propre) continue;
      const m = propre.match(/^(.*?)\s*[;:\t|]\s*(\d+(?:[.,]\d+)?)\s*%?$/) || propre.match(/^(.*?\S)\s+(\d+(?:[.,]\d+)?)\s*%$/);
      labels.push((m ? m[1] : propre).slice(0, 60));
      parts.push(m ? lireNombre(m[2]) : null);
    }
    if (!labels.length) return $("#champ-lot").focus();
    if ($("#lot-remplacer").checked) roueActuelle().segments = [];
    const avecParts = parts.some((p) => p != null);
    ajouterChoix(labels, avecParts ? parts.map((p) => p ?? 10) : []);
    fermer("#modale-lot");
    notifier(`${labels.length} choix ajouté${labels.length > 1 ? "s" : ""}.`);
  });

  // ----- Palette de couleurs -----

  const palette = $("#palette");
  const couleurLibre = $("#couleur-libre");
  let segmentPalette = null;

  function ouvrirPalette(bouton, segment) {
    segmentPalette = segment;
    palette.innerHTML =
      PALETTE.map((c) => `<button style="--c:${c}" data-c="${c}" class="${c === segment.color.toUpperCase() ? "choisie" : ""}" title="${c}"></button>`).join("") +
      `<button class="libre" data-libre title="Autre couleur…"><svg class="ic"><use href="#i-plus" /></svg></button>`;
    palette.hidden = false;
    const b = bouton.getBoundingClientRect();
    const p = palette.getBoundingClientRect();
    palette.style.left = Math.min(innerWidth - p.width - 8, Math.max(8, b.left - 8)) + "px";
    palette.style.top = (b.bottom + p.height + 8 > innerHeight ? b.top - p.height - 6 : b.bottom + 6) + "px";
    couleurLibre.style.left = palette.style.left;
    couleurLibre.style.top = palette.style.top;
  }

  function changerCouleur(c) {
    if (!segmentPalette) return;
    segmentPalette.color = c.toUpperCase();
    const li = liste.querySelector(`[data-id="${segmentPalette.id}"] .pastille`);
    if (li) li.style.setProperty("--c", segmentPalette.color);
    modifie();
  }

  palette.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.libre != null) {
      couleurLibre.value = segmentPalette.color.toLowerCase();
      couleurLibre.click();
    } else {
      changerCouleur(b.dataset.c);
    }
    palette.hidden = true;
  });
  couleurLibre.addEventListener("input", () => changerCouleur(couleurLibre.value));

  // ----- Plusieurs roues -----

  const menu = $("#menu-roues");

  function rendreMenu() {
    menu.innerHTML =
      `<p class="menu-titre">Mes roues</p>` +
      donnees.roues
        .map(
          (r) => `<button role="menuitem" data-id="${r.id}" class="${r.id === donnees.actuelle ? "actuelle" : ""}">
            <span class="puces">${r.segments.slice(0, 5).map((s) => `<i style="--c:${s.color}"></i>`).join("")}</span>
            <span class="nom">${echapper(r.titre.trim() || "Ma roue")}</span>
            <span class="detail">${r.segments.length} choix</span>
          </button>`
        )
        .join("") +
      `<button role="menuitem" data-nouvelle class="nouvelle"><svg class="ic"><use href="#i-plus" /></svg>Nouvelle roue</button>`;
  }

  function fermerMenus() {
    menu.hidden = true;
    $("#btn-roues").setAttribute("aria-expanded", "false");
    palette.hidden = true;
  }

  $("#btn-roues").addEventListener("click", (e) => {
    e.stopPropagation();
    if (roue.tourne) return;
    const ouvert = menu.hidden;
    fermerMenus();
    if (ouvert) {
      rendreMenu();
      menu.hidden = false;
      $("#btn-roues").setAttribute("aria-expanded", "true");
    }
  });

  menu.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.nouvelle != null) {
      const r = nouvelleRoue("Nouvelle roue", [
        ["Choix 1", 25],
        ["Choix 2", 25],
        ["Choix 3", 25],
        ["Choix 4", 25],
      ]);
      donnees.roues.push(r);
      changerDeRoue(r.id);
      montrerPage("parts");
      $("#champ-titre").select();
    } else {
      changerDeRoue(b.dataset.id);
    }
    fermerMenus();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#menu-roues, #btn-roues")) menu.hidden = true;
    if (!e.target.closest("#palette, .pastille")) palette.hidden = true;
  });

  function changerDeRoue(id) {
    donnees.actuelle = id;
    gagnantEnAttente = null;
    sauver();
    rendreParts();
    rendreHistorique();
  }

  $("#btn-dupliquer").addEventListener("click", () => {
    const src = roueActuelle();
    const copie = JSON.parse(JSON.stringify(src));
    copie.id = uid();
    copie.titre = `${src.titre.trim() || "Ma roue"} (copie)`;
    copie.segments.forEach((s) => (s.id = uid()));
    copie.historique = [];
    donnees.roues.splice(donnees.roues.indexOf(src) + 1, 0, copie);
    changerDeRoue(copie.id);
    notifier("Roue dupliquée.");
  });

  $("#btn-supprimer-roue").addEventListener("click", async () => {
    const r = roueActuelle();
    const ok = await confirmer(`Supprimer la roue « ${r.titre.trim() || "Ma roue"} » et son historique ?`);
    if (!ok) return;
    donnees.roues = donnees.roues.filter((x) => x.id !== r.id);
    if (!donnees.roues.length) donnees.roues.push(donneesParDefaut().roues[0]);
    changerDeRoue(donnees.roues[0].id);
    notifier("Roue supprimée.");
  });

  $("#btn-exporter").addEventListener("click", () => {
    const r = roueActuelle();
    const contenu = {
      format: "la-roue",
      version: 1,
      titre: r.titre,
      segments: r.segments.map(({ label, weight, color }) => ({ label, weight, color })),
    };
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" }));
    lien.download = `${(r.titre.trim() || "Ma roue").replace(/[\\/:*?"<>|]+/g, "-")}.json`;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
  });

  $("#btn-importer").addEventListener("click", () => $("#fichier-import").click());
  $("#fichier-import").addEventListener("change", async (e) => {
    const fichier = e.target.files[0];
    e.target.value = "";
    if (!fichier) return;
    try {
      const d = JSON.parse(await fichier.text());
      if (d.format !== "la-roue" || !Array.isArray(d.segments)) throw new Error("format");
      const r = {
        id: uid(),
        titre: String(d.titre || "Roue importée").slice(0, 80),
        segments: d.segments.slice(0, 500).map((s, i) => ({
          id: uid(),
          label: String(s.label ?? "").slice(0, 60),
          weight: lireNombre(s.weight) ?? 0,
          color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color.toUpperCase() : PALETTE[i % PALETTE.length],
        })),
        historique: [],
      };
      donnees.roues.push(r);
      changerDeRoue(r.id);
      montrerPage("parts");
      notifier(`Roue « ${r.titre} » importée.`);
    } catch {
      notifier("Ce fichier n'est pas une roue exportée depuis La Roue.");
    }
  });

  // ----- Historique -----

  function rendreHistorique() {
    const r = roueActuelle();
    const h = r.historique;
    $("#compteur-historique").textContent = h.length ? h.length : "";
    $("#btn-vider-historique").hidden = !h.length;

    if (!h.length) {
      $("#stats").innerHTML = "";
      $("#historique").innerHTML = `<li class="liste-vide">Aucun tirage pour l'instant.<br />Les résultats de cette roue s'afficheront ici.</li>`;
      return;
    }

    const comptes = new Map();
    for (const e of h) {
      const c = comptes.get(e.label) || { label: e.label, color: e.color, n: 0 };
      c.n++;
      comptes.set(e.label, c);
    }
    const tries = [...comptes.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    const max = tries[0].n;
    $("#stats").innerHTML =
      `<p class="etiquette">Les plus tirés · ${h.length} tirage${h.length > 1 ? "s" : ""}</p>` +
      tries
        .map(
          (c) => `<div class="stat" style="--c:${c.color}; --l:${(c.n / max) * 100}%">
            <span class="nom">${echapper(c.label.trim() || "Sans nom")}</span><span class="jauge"><i></i></span><b>${c.n}</b>
          </div>`
        )
        .join("");

    const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
    const aujourdhui = new Date().toDateString();
    $("#historique").innerHTML = h
      .slice(0, 100)
      .map((e, i) => {
        const d = new Date(e.quand);
        const quand = d.toDateString() === aujourdhui ? heure.format(d) : `${jour.format(d)} · ${heure.format(d)}`;
        return `<li style="--c:${e.color}"><span class="num">${h.length - i}</span><i></i><span class="nom">${echapper(
          e.label.trim() || "Sans nom"
        )}</span><time>${quand}</time></li>`;
      })
      .join("");
  }

  $("#btn-vider-historique").addEventListener("click", async () => {
    if (!(await confirmer("Effacer l'historique des tirages de cette roue ?", "Effacer"))) return;
    roueActuelle().historique = [];
    sauver();
    rendreHistorique();
  });

  // ----- Onglets, réglages, barre du haut -----

  function montrerPage(nom) {
    document.querySelectorAll(".onglet").forEach((o) => o.classList.toggle("actif", o.dataset.page === nom));
    document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== `page-${nom}`));
  }
  document.querySelectorAll(".onglet").forEach((o) => o.addEventListener("click", () => montrerPage(o.dataset.page)));

  function segmente(id, cle) {
    const el = $(id);
    const maj = () => el.querySelectorAll("button").forEach((b) => b.classList.toggle("actif", b.dataset.valeur === reglages()[cle]));
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      reglages()[cle] = b.dataset.valeur;
      sauver();
      maj();
      appliquerReglagesSon();
      if (cle === "timbre") essaiSon();
    });
    maj();
  }

  function essaiSon() {
    [0, 0.085, 0.18, 0.29, 0.42, 0.6, 0.86].forEach((d, i) => Sons.clic(1 - i * 0.07, d));
  }

  function bascule(id, cle, apres) {
    const el = $(id);
    el.checked = !!reglages()[cle];
    el.addEventListener("change", () => {
      reglages()[cle] = el.checked;
      sauver();
      if (apres) apres();
    });
  }

  bascule("#opt-son", "son", appliquerReglagesSon);
  bascule("#opt-confettis", "confettis");
  bascule("#opt-retirer", "retirerGagnant");
  segmente("#opt-timbre", "timbre");
  segmente("#opt-duree", "duree");
  $("#btn-tester-son").addEventListener("click", essaiSon);

  const volume = $("#opt-volume");
  volume.value = Math.round(reglages().volume * 100);
  volume.style.setProperty("--v", volume.value + "%");
  volume.addEventListener("input", () => {
    reglages().volume = volume.value / 100;
    volume.style.setProperty("--v", volume.value + "%");
    sauver();
    appliquerReglagesSon();
  });
  volume.addEventListener("change", () => Sons.clic(0.9));

  function basculerSon() {
    reglages().son = !reglages().son;
    $("#opt-son").checked = reglages().son;
    sauver();
    appliquerReglagesSon();
  }
  $("#btn-son").addEventListener("click", basculerSon);

  function basculerPanneau(force) {
    reglages().panneau = force ?? !reglages().panneau;
    document.body.classList.toggle("sans-panneau", !reglages().panneau);
    $("#btn-panneau").title = reglages().panneau ? "Masquer le panneau (P)" : "Afficher le panneau (P)";
    sauver();
  }
  $("#btn-panneau").addEventListener("click", () => basculerPanneau());

  $("#btn-plein-ecran").addEventListener("click", () => {
    if (window.bureau) window.bureau.pleinEcran();
    else if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  if (window.bureau) {
    window.bureau.surPleinEcran((actif) => document.body.classList.toggle("plein-ecran", actif));
    window.bureau.version().then((v) => ($("#version").textContent = "v" + v));
  }

  // ----- Fenêtres modales et notifications -----

  function ouvrir(sel) {
    $(sel).hidden = false;
    requestAnimationFrame(() => $(sel).classList.add("visible"));
  }
  function fermer(sel) {
    const el = $(sel);
    el.classList.remove("visible");
    el.hidden = true;
  }
  const modaleOuverte = () => [...document.querySelectorAll(".voile")].find((v) => !v.hidden);

  document.querySelectorAll(".voile").forEach((v) =>
    v.addEventListener("mousedown", (e) => {
      if (e.target !== v) return;
      if (v.id === "modale-resultat") fermerResultat();
      else if (v.id === "modale-confirmer") $("#confirmer-non").click();
      else fermer("#" + v.id);
    })
  );

  function confirmer(texte, bouton = "Supprimer") {
    return new Promise((resoudre) => {
      $("#confirmer-texte").textContent = texte;
      $("#confirmer-oui").textContent = bouton;
      ouvrir("#modale-confirmer");
      $("#confirmer-non").focus();
      const fin = (ok) => {
        fermer("#modale-confirmer");
        $("#confirmer-oui").onclick = $("#confirmer-non").onclick = null;
        resoudre(ok);
      };
      $("#confirmer-oui").onclick = () => fin(true);
      $("#confirmer-non").onclick = () => fin(false);
    });
  }

  function notifier(texte) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = texte;
    $("#toasts").appendChild(t);
    requestAnimationFrame(() => t.classList.add("visible"));
    setTimeout(() => {
      t.classList.remove("visible");
      setTimeout(() => t.remove(), 300);
    }, 2600);
  }

  // ----- Clavier -----

  document.addEventListener("keydown", (e) => {
    const modale = modaleOuverte();
    if (e.key === "Escape") {
      if (modale) {
        if (modale.id === "modale-resultat") fermerResultat();
        else if (modale.id === "modale-confirmer") $("#confirmer-non").click();
        else fermer("#" + modale.id);
      }
      fermerMenus();
      return;
    }
    const saisie = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
    if (saisie || e.ctrlKey || e.altKey || e.metaKey) return;
    if (modale && modale.id !== "modale-resultat") return;

    if (e.code === "Space" || (e.key === "Enter" && !e.target.closest("button"))) {
      e.preventDefault();
      if (modale) fermerResultat();
      lancer();
    } else if (e.key === "m" || e.key === "M") {
      basculerSon();
    } else if (e.key === "p" || e.key === "P") {
      basculerPanneau();
    }
  });

  // ----- Démarrage -----

  appliquerReglagesSon();
  basculerPanneau(reglages().panneau);
  rendreParts();
  rendreHistorique();
  montrerPage("parts");
})();
