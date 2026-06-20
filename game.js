/* =====================================================================
   GÉNESIS — La aparición y evolución de la vida sobre un PLANETA.

   La simulación es un autómata celular sobre una rejilla SIZE x SIZE que
   representa la superficie del planeta (mapeo equirectangular). Esa rejilla
   se dibuja en un canvas que se usa como TEXTURA de una esfera 3D, sobre la
   que se puede orbitar y hacer zoom.

   Cada celda guarda:
     - material: concentración de elementos esenciales (CHON...) de 0 a 1.
     - stage:    nivel evolutivo alcanzado (ver STAGES).

   Cada partida genera un planeta distinto con condiciones aleatorias
   (abundancia de elementos, aptitud para la vida, bombardeo cósmico) que
   lo hacen más fácil o más difícil.
   ===================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(() => {
  "use strict";

  // ---------------------------------------------------------------- Config
  const SIZE = 100;             // celdas por lado -> 100x100 = 10.000 celdas
  const CELLS = SIZE * SIZE;
  const MYR_PER_TICK = 1;       // millones de años por tick

  // Etapas evolutivas. El color modela la apariencia de cada celda.
  const STAGES = [
    { name: "Estéril",            color: [12, 17, 28]   }, // 0  roca / océano vacío
    { name: "Elementos (CHON)",   color: [40, 92, 120]  }, // 1  sopa con elementos
    { name: "Moléculas",          color: [46, 150, 120] }, // 2  compuestos orgánicos
    { name: "Vida unicelular",    color: [95, 211, 95]  }, // 3  primeras células
    { name: "Vida pluricelular",  color: [200, 232, 90] }, // 4  organismos complejos
    { name: "Vida compleja",      color: [244, 167, 66] }, // 5  ecosistemas avanzados
  ];

  // Probabilidad base de ascender de cada etapa a la siguiente, por tick.
  // La etapa 2->3 (abiogénesis: el salto a la VIDA) es deliberadamente rara.
  const BASE_RISE = [0.0030, 0.0100, 0.0040, 0.0055, 0.0026];
  const NEED_MAT  = [0.12,   0.20,   0.30,   0.30,   0.45]; // material mínimo
  const COST_MAT  = [0.04,   0.06,   0.10,   0.10,   0.12]; // material gastado
  // Probabilidad de colapso (retroceso) por etapa: la vida compleja es más
  // frágil y sufre crisis ecológicas, lo que mantiene un planeta diverso.
  const COLLAPSE  = [0,      0,      0,      0,      0.0030, 0.0080];

  const MAT_REGEN   = 0.006;   // material que genera el entorno por tick
  const BIO_REGEN   = 0.044;   // material que la vida cercana recicla/produce
  const MAT_CAP     = 1.0;     // tope de material por celda
  const DIFFUSE     = 0.06;    // fracción de material que se reparte a vecinas
  const UPKEEP      = 0.010;   // material que consume la vida por tick y etapa
  const NEIGHBOR_BOOST = 4.0;  // cuánto ayudan las vecinas vivas a ascender

  // ---------------------------------------------------------------- Estado
  let stage   = new Uint8Array(CELLS);
  let stageN  = new Uint8Array(CELLS);
  let mat     = new Float32Array(CELLS);
  let matN    = new Float32Array(CELLS);

  let years = 0;
  let running = false;
  let speed = 10;            // ticks por segundo
  let sliderEvents = 35;     // valor del control de cataclismos (0..100)
  let eventChance = 0.0035;  // probabilidad efectiva de cataclismo por tick
  let acc = 0;
  let lastTime = 0;

  const marks = [];          // efectos de impacto {x,y,r,life,maxLife,kind}
  const milestones = new Set();

  // Condiciones aleatorias del planeta actual.
  let planet = null;

  // -------------------------------------------------------------- Planeta
  const PLANET_PREFIX = ["Kepler", "Gliese", "Aether", "Thalassa", "Veridia",
    "Nyx", "Eos", "Cygnus", "Helios", "Aurora", "Erebus", "Tellus", "Zephyr",
    "Oran", "Próxima", "Vesta", "Kael", "Mira"];
  const PLANET_SUFFIX = ["b", "c", "d", "e", "Prime", "II", "III", "Minor", "Magna"];
  // Paletas de océano/roca para variar el aspecto de cada mundo.
  const OCEAN = [
    { dry: [10, 16, 30],  wet: [38, 70, 110]  }, // azul
    { dry: [10, 24, 26],  wet: [30, 100, 92]  }, // turquesa
    { dry: [20, 12, 30],  wet: [78, 48, 120]  }, // violeta
    { dry: [16, 20, 14],  wet: [55, 90, 48]   }, // verdoso
    { dry: [26, 14, 12],  wet: [120, 58, 42]  }, // rojizo / óxido
  ];

  function generatePlanet() {
    const richness    = 0.65 + Math.random() * 0.95; // 0.65 .. 1.60
    const riseMult    = 0.75 + Math.random() * 0.65; // 0.75 .. 1.40
    const bombardment = 0.40 + Math.random() * 1.40; // 0.40 .. 1.80
    const ocean = OCEAN[(Math.random() * OCEAN.length) | 0];

    const name = PLANET_PREFIX[(Math.random() * PLANET_PREFIX.length) | 0] +
      "-" + (100 + ((Math.random() * 899) | 0)) + " " +
      PLANET_SUFFIX[(Math.random() * PLANET_SUFFIX.length) | 0];

    // Puntuación de habitabilidad -> etiqueta de dificultad.
    const score = richness + riseMult - (bombardment - 1) * 0.6;
    let diff, diffClass;
    if (score >= 2.55)      { diff = "Paraíso fértil"; diffClass = "easy"; }
    else if (score >= 2.10) { diff = "Templado";       diffClass = "ok"; }
    else if (score >= 1.65) { diff = "Áspero";         diffClass = "hard"; }
    else                    { diff = "Hostil";         diffClass = "hostile"; }

    return { name, richness, riseMult, bombardment, ocean, diff, diffClass };
  }

  // ---------------------------------------------------------------- DOM
  const el = {
    clock: document.getElementById("clock"),
    toggle: document.getElementById("toggle"),
    reset: document.getElementById("reset"),
    speed: document.getElementById("speed"),
    speedVal: document.getElementById("speedVal"),
    events: document.getElementById("events"),
    eventsVal: document.getElementById("eventsVal"),
    meteor: document.getElementById("meteor"),
    volcano: document.getElementById("volcano"),
    legend: document.getElementById("legend"),
    log: document.getElementById("log"),
    hint: document.getElementById("hint"),
    fact: document.getElementById("fact"),
    factBody: document.getElementById("factBody"),
    stageWrap: document.querySelector(".stage-wrap"),
    scene: document.getElementById("scene"),
    planetName: document.getElementById("planetName"),
    planetDiff: document.getElementById("planetDiff"),
    planetDesc: document.getElementById("planetDesc"),
    planetStats: document.getElementById("planetStats"),
  };

  // -------------------------------------------------- Pinceladas de saber
  const FACT_BY_KEY = {
    m1: "La vida que conocemos se construye sobre todo con 4 elementos —Carbono, " +
        "Hidrógeno, Oxígeno y Nitrógeno (CHON)—, que forman el ~96 % de la masa de los seres vivos.",
    m2: "En 1953 el experimento de Miller-Urey demostró que con descargas eléctricas " +
        "sobre gases simples se forman aminoácidos, los ladrillos de las proteínas.",
    m3: "La abiogénesis es el paso de la materia inerte a la viva. Las primeras células " +
        "aparecieron hace unos 3.800 millones de años. ¡Todos descendemos de aquel inicio (LUCA)!",
    m4: "La vida pluricelular surgió varias veces de forma independiente y permitió que las " +
        "células se especializaran en tejidos y órganos.",
    m5: "Hace unos 540 millones de años, la «explosión cámbrica» multiplicó la diversidad " +
        "animal en apenas unos millones de años.",
  };
  const GENERAL_FACTS = [
    "Las cianobacterias inventaron la fotosíntesis y llenaron el aire de oxígeno: la «Gran " +
      "Oxidación», hace ~2.400 millones de años, cambió el planeta para siempre.",
    "Las células complejas (eucariotas) nacieron de una endosimbiosis: una célula englobó a " +
      "otra, dando origen a las mitocondrias y los cloroplastos.",
    "Meteoritos y cometas pudieron traer moléculas orgánicas a la Tierra: en el meteorito " +
      "Murchison se hallaron más de 80 aminoácidos distintos.",
    "La Tierra tiene ~4.540 millones de años; la vida apareció relativamente pronto, en sus " +
      "primeros ~700 millones de años.",
    "Ha habido 5 grandes extinciones masivas. Tras cada una, la vida se recuperó y se " +
      "diversificó en nuevas formas.",
    "El impacto de Chicxulub, hace 66 millones de años, extinguió a los dinosaurios no " +
      "avianos… y abrió paso a la era de los mamíferos.",
    "El vulcanismo destruye, pero también aporta minerales y gases esenciales: muchos " +
      "compuestos para la vida proceden del interior de la Tierra.",
    "La zona habitable es la distancia a la estrella donde puede haber agua líquida: ni tan " +
      "cerca que hierva, ni tan lejos que se congele.",
  ];
  let generalIdx = 0;
  let lastFactYear = 0;

  function showFact(text, flash = true) {
    el.factBody.textContent = text;
    if (flash) {
      el.fact.classList.remove("flash");
      void el.fact.offsetWidth;
      el.fact.classList.add("flash");
    }
  }

  function pulse(kind) {
    const cls = kind === "life" ? "pulse-life" : "pulse-evt";
    el.stageWrap.classList.add(cls);
    setTimeout(() => el.stageWrap.classList.remove(cls), 320);
  }

  // ============================================================ ESCENA 3D
  let renderer, scene, camera, controls, planetMesh, texture, atmosphere;
  const buf = document.createElement("canvas");
  buf.width = SIZE; buf.height = SIZE;
  const bctx = buf.getContext("2d");
  const img = bctx.createImageData(SIZE, SIZE);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function initScene() {
    const w = el.scene.clientWidth || 600;
    const h = el.scene.clientHeight || 600;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    el.scene.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03040a);

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, 0.4, 3.2);

    // Campo de estrellas.
    scene.add(makeStars());

    // Luz: una "estrella" (sol) y algo de ambiente para la cara nocturna.
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 3, 4);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x4060a0, 0.55));

    // Textura del planeta a partir del canvas de simulación.
    texture = new THREE.CanvasTexture(buf);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const geo = new THREE.SphereGeometry(1, 96, 64);
    const mat3d = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 0,
      emissive: 0xffffff,
      emissiveMap: texture,      // la vida brilla débilmente en la cara nocturna
      emissiveIntensity: 0.28,
    });
    planetMesh = new THREE.Mesh(geo, mat3d);
    scene.add(planetMesh);

    // Atmósfera: halo translúcido alrededor del planeta.
    atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 64, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4aa3ff, transparent: true, opacity: 0.12,
        side: THREE.BackSide, blending: THREE.AdditiveBlending,
      })
    );
    scene.add(atmosphere);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.9;
    controls.enablePan = false;
    controls.minDistance = 1.25;
    controls.maxDistance = 6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;

    window.addEventListener("resize", onResize);
    setupPicking();
    animate();
  }

  function makeStars() {
    const n = 1500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Puntos repartidos en una esfera grande alrededor de la escena.
      const r = 60 + Math.random() * 40;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true });
    return new THREE.Points(g, m);
  }

  function onResize() {
    const w = el.scene.clientWidth, h = el.scene.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // Click sobre el planeta -> impacto de meteorito en esa celda.
  function setupPicking() {
    let downX = 0, downY = 0;
    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
    dom.addEventListener("pointerup", (e) => {
      // Solo si fue un click, no un arrastre de cámara.
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const rect = dom.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(planetMesh)[0];
      if (!hit || !hit.uv) return;
      const x = Math.min(SIZE - 1, (hit.uv.x * SIZE) | 0);
      const y = Math.min(SIZE - 1, ((1 - hit.uv.y) * SIZE) | 0);
      strike("meteor", x, y);
    });
  }

  // Bucle de animación: siempre renderiza el 3D; la simulación solo avanza
  // cuando la partida está en marcha.
  function animate(now) {
    requestAnimationFrame(animate);
    controls.update();

    if (running) {
      if (!lastTime) lastTime = now;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      acc += dt * speed;
      let steps = 0;
      while (acc >= 1 && steps < 120) { step(); acc -= 1; steps++; }
      if (steps > 0) { updateClock(); updateLegend(); }
    }

    if (planet) drawTexture();
    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------- Init
  function reset() {
    running = false;
    years = 0;
    acc = 0;
    lastTime = 0;
    marks.length = 0;
    milestones.clear();
    generalIdx = 0;
    lastFactYear = 0;
    el.log.innerHTML = "";

    planet = generatePlanet();
    showPlanet();
    recomputeEvents();

    for (let i = 0; i < CELLS; i++) {
      stage[i] = 0;
      mat[i] = Math.random() * 0.18 * planet.richness; // sopa inicial
    }
    el.toggle.textContent = "▶ Iniciar";
    el.hint.classList.remove("hidden");
    showFact("Mundo «" + planet.name + "» generado. Pulsa «Iniciar» para encender su química " +
      "y ver si la vida logra abrirse camino.", false);
    updateClock();
    updateLegend();
  }

  function showPlanet() {
    el.planetName.textContent = planet.name;
    el.planetDiff.textContent = planet.diff;
    el.planetDiff.className = "planet-diff diff-" + planet.diffClass;
    el.planetDesc.textContent = describePlanet();
    const norm = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
    const bar = (label, frac, hint) =>
      `<li><span class="ps-label">${label}</span>
         <span class="ps-bar"><span class="ps-fill" style="width:${(frac * 100).toFixed(0)}%"></span></span>
         <span class="ps-hint">${hint}</span></li>`;
    el.planetStats.innerHTML =
      bar("Abundancia de elementos", norm(planet.richness, 0.65, 1.6),
          planet.richness > 1.2 ? "rica" : planet.richness < 0.85 ? "pobre" : "media") +
      bar("Aptitud para la vida", norm(planet.riseMult, 0.75, 1.4),
          planet.riseMult > 1.15 ? "alta" : planet.riseMult < 0.9 ? "baja" : "media") +
      bar("Bombardeo cósmico", norm(planet.bombardment, 0.4, 1.8),
          planet.bombardment > 1.3 ? "intenso" : planet.bombardment < 0.7 ? "leve" : "moderado");
  }

  function describePlanet() {
    const parts = [];
    parts.push(planet.richness > 1.2 ? "Mundo rico en elementos esenciales"
      : planet.richness < 0.85 ? "Mundo pobre en materiales" : "Mundo de recursos equilibrados");
    parts.push(planet.riseMult > 1.15 ? "con condiciones muy propicias para la vida"
      : planet.riseMult < 0.9 ? "con condiciones poco favorables" : "con condiciones moderadas");
    parts.push(planet.bombardment > 1.3 ? "y un cielo plagado de meteoritos."
      : planet.bombardment < 0.7 ? "y un firmamento tranquilo." : "y un bombardeo cósmico moderado.");
    return parts.join(" ") + " Dificultad: " + planet.diff + ".";
  }

  function recomputeEvents() {
    const base = (sliderEvents / 100) * 0.01;
    eventChance = base * (planet ? planet.bombardment : 1);
  }

  // ---------------------------------------------------------------- Step
  function step() {
    const regenBase = MAT_REGEN * planet.richness;
    const bio = BIO_REGEN * planet.richness;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const s = stage[i];
        let m = mat[i];

        // Vecindario de Moore. La longitud (x) da la vuelta al planeta;
        // la latitud (y) se detiene en los polos.
        let livingNeighbors = 0, maxNeighbor = 0, matInflow = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= SIZE) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = (x + dx + SIZE) % SIZE;   // envoltura horizontal
            const j = ny * SIZE + nx;
            const ns = stage[j];
            if (ns >= 3) livingNeighbors++;
            if (ns > maxNeighbor) maxNeighbor = ns;
            matInflow += mat[j];
          }
        }

        // Difusión de material.
        m += (matInflow / 8 - m) * DIFFUSE;
        // Química del entorno + productividad biológica.
        if (m < MAT_CAP) m += regenBase + bio * (livingNeighbors / 8);

        let ns = s;

        // Mantenimiento: la vida real consume material; sin él, decae.
        if (s >= 3) {
          m -= UPKEEP * s;
          if (m <= 0) { ns = s - 1; m = 0.05; }
        }
        // Colapso ecológico de las etapas altas.
        if (ns === s && COLLAPSE[s] && Math.random() < COLLAPSE[s]) ns = s - 1;

        // Ascenso evolutivo.
        if (ns === s && s < STAGES.length - 1 && m >= NEED_MAT[s]) {
          const support = livingNeighbors / 8;
          let p = BASE_RISE[s] * planet.riseMult * (0.3 + m) * (1 + NEIGHBOR_BOOST * support);
          if (maxNeighbor > s) p *= 1.6;
          if (Math.random() < p) { ns = s + 1; m -= COST_MAT[s]; if (m < 0) m = 0; }
        }

        stageN[i] = ns;
        matN[i] = m < 0 ? 0 : (m > MAT_CAP ? MAT_CAP : m);
      }
    }

    [stage, stageN] = [stageN, stage];
    [mat, matN] = [matN, mat];
    years += MYR_PER_TICK;

    if (Math.random() < eventChance) {
      strike(Math.random() < 0.5 ? "meteor" : "volcano");
    }
    for (let k = marks.length - 1; k >= 0; k--) {
      if (--marks[k].life <= 0) marks.splice(k, 1);
    }

    checkMilestones();
    if (years - lastFactYear >= 220) {
      lastFactYear = years;
      showFact(GENERAL_FACTS[generalIdx % GENERAL_FACTS.length]);
      generalIdx++;
    }
  }

  // ---------------------------------------------------------------- Eventos
  function strike(kind, cx, cy) {
    cx = cx ?? (Math.random() * SIZE) | 0;
    cy = cy ?? (Math.random() * SIZE) | 0;
    const r = kind === "meteor" ? 3 + ((Math.random() * 4) | 0)
                                : 2 + ((Math.random() * 3) | 0);
    const r2 = r * r;

    for (let dy = -r; dy <= r; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= SIZE) continue;
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const nx = (cx + dx + SIZE) % SIZE;
        const j = ny * SIZE + nx;
        stage[j] = 0;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        mat[j] = Math.min(MAT_CAP, 0.7 + (1 - d) * 0.3);
      }
    }

    marks.push({ x: cx, y: cy, r, life: 18, maxLife: 18, kind });
    logEvent(kind === "meteor"
      ? `☄ Un meteorito impacta y arrasa una región (radio ${r}).`
      : `🌋 Una erupción volcánica devasta y fertiliza el terreno (radio ${r}).`, "evt");
    pulse("evt");
  }

  // ---------------------------------------------------------------- Render
  function drawTexture() {
    const data = img.data;
    const dry = planet.ocean.dry, wet = planet.ocean.wet;
    for (let i = 0; i < CELLS; i++) {
      const s = stage[i];
      let r, g, b;
      if (s === 0) {
        // Estéril: del color seco al húmedo según el material acumulado.
        const t = mat[i];
        r = dry[0] + (wet[0] - dry[0]) * t;
        g = dry[1] + (wet[1] - dry[1]) * t;
        b = dry[2] + (wet[2] - dry[2]) * t;
      } else {
        const c = STAGES[s].color;
        r = c[0]; g = c[1]; b = c[2];
      }
      const p = i * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);

    // Efectos de impacto horneados en la propia superficie del planeta.
    if (marks.length) {
      bctx.save();
      bctx.globalCompositeOperation = "lighter";
      for (const mk of marks) {
        const t = mk.life / mk.maxLife;
        const R = mk.r * (1.5 - 0.5 * t);
        const grad = bctx.createRadialGradient(mk.x, mk.y, 0, mk.x, mk.y, R);
        if (mk.kind === "meteor") {
          grad.addColorStop(0, `rgba(255,255,220,${0.9 * t})`);
          grad.addColorStop(0.45, `rgba(255,170,70,${0.5 * t})`);
          grad.addColorStop(1, "rgba(255,120,40,0)");
        } else {
          grad.addColorStop(0, `rgba(255,230,120,${0.9 * t})`);
          grad.addColorStop(0.45, `rgba(255,80,30,${0.55 * t})`);
          grad.addColorStop(1, "rgba(160,20,10,0)");
        }
        bctx.fillStyle = grad;
        bctx.beginPath();
        bctx.arc(mk.x, mk.y, R, 0, Math.PI * 2);
        bctx.fill();
      }
      bctx.restore();
    }

    texture.needsUpdate = true;
  }

  // ---------------------------------------------------------------- Censo
  function census() {
    const counts = new Array(STAGES.length).fill(0);
    for (let i = 0; i < CELLS; i++) counts[stage[i]]++;
    return counts;
  }

  function updateLegend() {
    const counts = census();
    let html = "";
    for (let s = 0; s < STAGES.length; s++) {
      const c = STAGES[s].color;
      const pct = ((counts[s] / CELLS) * 100).toFixed(1);
      html += `<li>
        <span class="swatch" style="background:rgb(${c[0]},${c[1]},${c[2]})"></span>
        <span>${STAGES[s].name}</span>
        <span class="count">${counts[s]} · ${pct}%</span>
      </li>`;
    }
    el.legend.innerHTML = html;
  }

  // ---------------------------------------------------------------- Hitos
  function checkMilestones() {
    const counts = census();
    const announce = (key, cls, text) => {
      if (!milestones.has(key)) {
        milestones.add(key);
        logEvent(text, cls);
        if (FACT_BY_KEY[key]) showFact(FACT_BY_KEY[key]);
        pulse(cls === "evt" ? "evt" : "life");
      }
    };
    if (counts[1] > 0) announce("m1", "milestone", "✶ Aparecen los primeros elementos esenciales (CHON).");
    if (counts[2] > 0) announce("m2", "milestone", "✶ Se forman las primeras moléculas orgánicas.");
    if (counts[3] > 0) announce("m3", "milestone", "✶ ¡Abiogénesis! Surge la primera vida unicelular.");
    if (counts[4] > 0) announce("m4", "milestone", "✶ La vida se vuelve pluricelular.");
    if (counts[5] > 0) announce("m5", "milestone", "✶ Emergen ecosistemas de vida compleja.");
    if (counts[3] + counts[4] + counts[5] === 0 && milestones.has("m3")) {
      if (!milestones.has("ext-" + years)) {
        milestones.add("ext-" + years);
        milestones.delete("m3");
        logEvent("☠ La vida se ha extinguido por completo. El planeta espera otra oportunidad.", "evt");
      }
    }
  }

  // ---------------------------------------------------------------- Crónica
  function logEvent(text, cls = "") {
    const li = document.createElement("li");
    if (cls) li.className = cls;
    li.innerHTML = `<b>${formatYears(years)}</b> — ${text}`;
    el.log.prepend(li);
    while (el.log.children.length > 40) el.log.lastChild.remove();
  }

  function formatYears(y) {
    if (y >= 1000) return (y / 1000).toFixed(2) + " mil M";
    return y + " M";
  }
  function updateClock() {
    el.clock.textContent = years.toLocaleString("es-ES");
  }

  // ---------------------------------------------------------------- Control
  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    el.toggle.textContent = "⏸ Pausar";
    el.hint.classList.add("hidden");
  }
  function pause() {
    running = false;
    el.toggle.textContent = "▶ Reanudar";
  }

  el.toggle.addEventListener("click", () => running ? pause() : start());
  el.reset.addEventListener("click", reset);

  el.speed.addEventListener("input", () => {
    speed = +el.speed.value;
    el.speedVal.textContent = speed + " / s";
  });

  el.events.addEventListener("input", () => {
    sliderEvents = +el.events.value;
    el.eventsVal.textContent = sliderEvents === 0 ? "Ninguno"
      : sliderEvents < 30 ? "Baja" : sliderEvents < 70 ? "Media" : "Alta";
    recomputeEvents();
  });

  el.meteor.addEventListener("click", () => strike("meteor"));
  el.volcano.addEventListener("click", () => strike("volcano"));

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); running ? pause() : start(); }
  });

  // Arranque.
  initScene();
  reset();
})();
