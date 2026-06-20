/* =====================================================================
   GÉNESIS — Autómata celular sobre la aparición y evolución de la vida.

   El tablero es una rejilla de SIZE x SIZE celdas. Cada celda guarda:
     - material: concentración de elementos esenciales (CHON...) de 0 a 1.
     - stage:    nivel evolutivo alcanzado (ver STAGES).

   En cada "tick" (= 1 millón de años) las celdas pueden:
     - acumular material del entorno (química lenta),
     - difundir material a las vecinas,
     - ascender de etapa con cierta probabilidad, MÁS fácil si tienen
       vecinas vivas (la vida abre camino),
     - decaer si se quedan sin material (la vida necesita recursos).

   Eventos (meteoritos / volcanes) arrasan la vida en una zona pequeña
   pero la siembran de material, facilitando un nuevo comienzo.
   ===================================================================== */

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
  // El índice i es la probabilidad de pasar de la etapa i a la i+1.
  // La etapa 2->3 (abiogénesis: el salto a la VIDA) es deliberadamente rara.
  const BASE_RISE = [0.0030, 0.0100, 0.0040, 0.0055, 0.0026];
  // Material mínimo necesario para intentar cada ascenso.
  const NEED_MAT  = [0.12,   0.20,   0.30,   0.30,   0.45];
  // Material consumido al ascender a cada etapa.
  const COST_MAT  = [0.04,   0.06,   0.10,   0.10,   0.12];
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
  // Doble búfer con arrays tipados para rendimiento.
  let stage   = new Uint8Array(CELLS);
  let stageN  = new Uint8Array(CELLS);
  let mat     = new Float32Array(CELLS);
  let matN    = new Float32Array(CELLS);

  let years = 0;
  let running = false;
  let speed = 10;          // ticks por segundo
  let eventChance = 0.0035; // probabilidad de cataclismo por tick
  let acc = 0;
  let lastTime = 0;

  // Marcadores visuales de impacto (se desvanecen).
  const marks = []; // {x, y, r, life, kind}

  // Hitos ya anunciados en la crónica (para no repetir).
  const milestones = new Set();

  // ---------------------------------------------------------------- DOM
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Canvas interno de 100x100 que luego escalamos al tamaño visible.
  const buf = document.createElement("canvas");
  buf.width = SIZE; buf.height = SIZE;
  const bctx = buf.getContext("2d");
  const img = bctx.createImageData(SIZE, SIZE);

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
  };

  // -------------------------------------------------- Pinceladas de saber
  // Hechos científicos reales asociados a cada hito evolutivo.
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
  // Hechos generales que van rotando mientras juegas.
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
    "El ADN de cualquier ser vivo usa el mismo código genético: una pista poderosa de que " +
      "toda la vida comparte un origen común.",
  ];
  let generalIdx = 0;
  let lastFactYear = 0;

  function showFact(text, flash = true) {
    el.factBody.textContent = text;
    if (flash) {
      el.fact.classList.remove("flash");
      void el.fact.offsetWidth; // reinicia la animación
      el.fact.classList.add("flash");
    }
  }

  // -------------------------------------------------- Pulso visual del tablero
  function pulse(kind) {
    const cls = kind === "life" ? "pulse-life" : "pulse-evt";
    el.stageWrap.classList.add(cls);
    setTimeout(() => el.stageWrap.classList.remove(cls), 320);
  }

  // ---------------------------------------------------------------- Init
  function reset() {
    running = false;
    years = 0;
    acc = 0;
    marks.length = 0;
    milestones.clear();
    generalIdx = 0;
    lastFactYear = 0;
    el.log.innerHTML = "";
    showFact("Pulsa «Iniciar» y observa cómo, a partir de simples elementos químicos, " +
      "puede emerger y evolucionar la vida. Irás aprendiendo sobre el camino.", false);

    for (let i = 0; i < CELLS; i++) {
      stage[i] = 0;
      // Sopa primordial inicial: material disperso y aleatorio.
      mat[i] = Math.random() * 0.18;
    }
    el.toggle.textContent = "▶ Iniciar";
    el.hint.classList.remove("hidden");
    updateClock();
    render();
    updateLegend();
  }

  // ---------------------------------------------------------------- Step
  function step() {
    // Recorremos toda la rejilla calculando el siguiente estado en el búfer N.
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const s = stage[i];
        let m = mat[i];

        // --- Vecindario de Moore (8 vecinas, bordes "muertos") ---
        let livingNeighbors = 0; // vecinas con vida real (stage >= 3)
        let maxNeighbor = 0;     // etapa máxima alrededor
        let matInflow = 0;       // material que llega por difusión

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= SIZE) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= SIZE) continue;
            const j = ny * SIZE + nx;
            const ns = stage[j];
            if (ns >= 3) livingNeighbors++;
            if (ns > maxNeighbor) maxNeighbor = ns;
            matInflow += mat[j];
          }
        }

        // --- Difusión de material: tiende a igualarse con las vecinas ---
        const avgNeighbor = matInflow / 8;
        m += (avgNeighbor - m) * DIFFUSE;

        // --- Química del entorno + productividad biológica ---
        // El entorno genera material lentamente y la vida cercana lo
        // recicla/produce (fotosíntesis, nutrientes): la vida enriquece
        // su propio entorno, abriendo camino a etapas superiores.
        if (m < MAT_CAP) m += MAT_REGEN + BIO_REGEN * (livingNeighbors / 8);

        let ns = s;

        // --- Mantenimiento: la vida real consume material; sin él, decae ---
        if (s >= 3) {
          m -= UPKEEP * s;
          if (m <= 0) {
            ns = s - 1;          // retrocede una etapa (declive)
            m = 0.05;            // queda algo de materia tras la muerte
          }
        }

        // --- Colapso ecológico: las etapas altas pueden retroceder ---
        if (ns === s && COLLAPSE[s] && Math.random() < COLLAPSE[s]) {
          ns = s - 1;
        }

        // --- Ascenso evolutivo ---
        if (ns === s && s < STAGES.length - 1 && m >= NEED_MAT[s]) {
          const support = livingNeighbors / 8;          // 0..1
          // La vida cercana facilita enormemente el siguiente paso.
          let p = BASE_RISE[s] * (0.3 + m) * (1 + NEIGHBOR_BOOST * support);
          // Un vecino más avanzado tira de la celda hacia arriba.
          if (maxNeighbor > s) p *= 1.6;
          if (Math.random() < p) {
            ns = s + 1;
            m -= COST_MAT[s];
            if (m < 0) m = 0;
          }
        }

        stageN[i] = ns;
        matN[i] = m < 0 ? 0 : (m > MAT_CAP ? MAT_CAP : m);
      }
    }

    // Intercambio de búferes.
    [stage, stageN] = [stageN, stage];
    [mat, matN] = [matN, mat];

    years += MYR_PER_TICK;

    // --- Posible cataclismo aleatorio ---
    if (Math.random() < eventChance) {
      strike(Math.random() < 0.5 ? "meteor" : "volcano");
    }

    // Envejecer marcadores de impacto.
    for (let k = marks.length - 1; k >= 0; k--) {
      if (--marks[k].life <= 0) marks.splice(k, 1);
    }

    checkMilestones();

    // Cada cierto tiempo, una nueva pincelada de conocimiento general.
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
        const nx = cx + dx;
        if (nx < 0 || nx >= SIZE) continue;
        const j = ny * SIZE + nx;
        // Arrasa la vida...
        stage[j] = 0;
        // ...pero enriquece el suelo de materiales (más en el centro).
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        mat[j] = Math.min(MAT_CAP, 0.7 + (1 - d) * 0.3);
      }
    }

    marks.push({ x: cx, y: cy, r, life: 18, maxLife: 18, kind });
    logEvent(kind === "meteor"
      ? `☄ Un meteorito impacta y arrasa una región (radio ${r}).`
      : `🌋 Una erupción volcánica devasta y fertiliza el terreno (radio ${r}).`, "evt");
    pulse("evt");
    if (!running) render();
  }

  // ---------------------------------------------------------------- Render
  function render() {
    const data = img.data;
    for (let i = 0; i < CELLS; i++) {
      const s = stage[i];
      let r, g, b;
      if (s === 0) {
        // Las celdas estériles se aclaran cuanto más material acumulan
        // (la sopa primordial se "ve" antes de que surja la vida).
        const t = mat[i];
        r = 12 + t * 28;
        g = 17 + t * 48;
        b = 28 + t * 62;
      } else {
        const c = STAGES[s].color;
        r = c[0]; g = c[1]; b = c[2];
      }
      const p = i * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);

    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);

    // Efectos visuales de impactos recientes (destello + resplandor + onda).
    const scale = canvas.width / SIZE;
    for (const mk of marks) {
      const t = mk.life / mk.maxLife;          // 1 -> 0 al desvanecerse
      const cxp = (mk.x + 0.5) * scale;
      const cyp = (mk.y + 0.5) * scale;
      const meteor = mk.kind === "meteor";

      // Resplandor radial relleno (fuego del meteorito / lava del volcán).
      const glowR = mk.r * scale * (1.6 - 0.6 * t); // se expande al apagarse
      const grad = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, glowR);
      if (meteor) {
        grad.addColorStop(0, `rgba(255,255,220,${0.85 * t})`);
        grad.addColorStop(0.4, `rgba(255,180,80,${0.55 * t})`);
        grad.addColorStop(1, `rgba(255,120,40,0)`);
      } else {
        grad.addColorStop(0, `rgba(255,230,120,${0.8 * t})`);
        grad.addColorStop(0.4, `rgba(255,90,30,${0.6 * t})`);
        grad.addColorStop(1, `rgba(160,20,10,0)`);
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cxp, cyp, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Onda expansiva (anillo que crece y se desvanece).
      ctx.beginPath();
      ctx.arc(cxp, cyp, mk.r * scale * (1 + (1 - t) * 1.2), 0, Math.PI * 2);
      ctx.strokeStyle = meteor
        ? `rgba(255,225,160,${t})`
        : `rgba(255,120,60,${t})`;
      ctx.lineWidth = 2.5 * t + 0.5;
      ctx.stroke();
    }
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
      // Extinción total tras haber existido vida: permite re-anunciar el regreso.
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

  // ---------------------------------------------------------------- Tiempo
  function formatYears(y) {
    if (y >= 1000) return (y / 1000).toFixed(2) + " mil M";
    return y + " M";
  }
  function updateClock() {
    el.clock.textContent = years.toLocaleString("es-ES");
  }

  // ---------------------------------------------------------------- Bucle
  function loop(now) {
    if (!running) return;
    if (!lastTime) lastTime = now;
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    acc += dt * speed;
    let steps = 0;
    while (acc >= 1 && steps < 120) { // límite para no bloquear si hay lag
      step();
      acc -= 1;
      steps++;
    }
    if (steps > 0) {
      render();
      updateClock();
      updateLegend();
    }
    requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    el.toggle.textContent = "⏸ Pausar";
    el.hint.classList.add("hidden");
    requestAnimationFrame(loop);
  }
  function pause() {
    running = false;
    el.toggle.textContent = "▶ Reanudar";
  }

  // ---------------------------------------------------------------- UI
  el.toggle.addEventListener("click", () => running ? pause() : start());
  el.reset.addEventListener("click", reset);

  el.speed.addEventListener("input", () => {
    speed = +el.speed.value;
    el.speedVal.textContent = speed + " / s";
  });

  el.events.addEventListener("input", () => {
    const v = +el.events.value;
    eventChance = (v / 100) * 0.01; // 0 .. 1% por tick
    el.eventsVal.textContent = v === 0 ? "Ninguno" : v < 30 ? "Baja" : v < 70 ? "Media" : "Alta";
  });

  el.meteor.addEventListener("click", () => strike("meteor"));
  el.volcano.addEventListener("click", () => strike("volcano"));

  // Click en el tablero -> impacto de meteorito en ese punto.
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * SIZE) | 0;
    const y = ((e.clientY - rect.top) / rect.height * SIZE) | 0;
    strike("meteor", x, y);
  });

  // Atajo: barra espaciadora para iniciar/pausar.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); running ? pause() : start(); }
  });

  // Arranque.
  reset();
})();
