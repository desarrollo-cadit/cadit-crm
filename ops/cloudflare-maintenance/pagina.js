import { GEIST, LOGO } from "./assets.js";

/**
 * La página "Estamos en obra": un edificio a medio levantar sobre la grilla de
 * plano de la marca (28/140 px), con la grúa subiendo la próxima viga.
 * Autocontenida: fuente, logo e ilustración van embebidos.
 */

/** Celosía en zigzag entre dos rieles (la de la torre y la de la pluma). */
function celosia(x1, y1, x2, y2, paso, vertical) {
  const puntos = [];
  if (vertical) {
    for (let y = y2, lado = 0; y >= y1; y -= paso, lado ^= 1) puntos.push(`${lado ? x2 : x1} ${y}`);
  } else {
    for (let x = x1, lado = 0; x <= x2; x += paso, lado ^= 1) puntos.push(`${x} ${lado ? y2 : y1}`);
  }
  return `M${puntos.join(" L")}`;
}

const VENTANAS = [
  // Planta 3 y 2: cuatro ventanas; planta baja: dos ventanas y la puerta.
  ...[214, 256].flatMap((techo) => [214, 262, 310, 358].map((x) => [x, techo + 10])),
  [214, 308],
  [358, 308],
]
  .map(([x, y]) => `<rect class="vidrio" x="${x}" y="${y}" width="28" height="22" rx="2"/>`)
  .join("");

const ILUSTRACION = `
<svg class="obra" viewBox="40 0 580 372" role="img" aria-label="Un edificio en construcción con una grúa subiendo una viga">
  <defs>
    <pattern id="rayas" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="12" class="raya"/>
    </pattern>
  </defs>

  <!-- Terreno -->
  <path class="suave" d="M40 340 H600"/>
  <path class="tenue" d="M60 348 l-8 8 M90 348 l-8 8 M120 348 l-8 8 M150 348 l-8 8 M180 348 l-8 8 M210 348 l-8 8 M240 348 l-8 8 M270 348 l-8 8 M300 348 l-8 8 M330 348 l-8 8 M360 348 l-8 8 M390 348 l-8 8 M420 348 l-8 8 M450 348 l-8 8 M480 348 l-8 8 M510 348 l-8 8 M540 348 l-8 8 M570 348 l-8 8"/>

  <!-- Cota de altura, a la manera de un plano -->
  <g class="cota">
    <path class="tenue" d="M176 130 H194 M176 340 H194"/>
    <path d="M168 130 V340 M163 135 l10 -10 M163 345 l10 -10"/>
    <text x="0" y="0" transform="translate(156 235) rotate(-90)">+15,00</text>
  </g>

  <!-- Lo construido -->
  <path class="trazo" d="M200 340 V214 H400 V340 M200 298 H400 M200 256 H400"/>
  ${VENTANAS}
  <path class="trazo" d="M286 340 V310 a14 14 0 0 1 28 0 V340"/>

  <!-- Lo que falta: en línea de construcción -->
  <path class="proyectado" d="M200 214 V130 H400 V214 M200 172 H400 M266 214 V130 M334 214 V130"/>

  <!-- Grúa torre -->
  <g class="grua">
    <path class="trazo" d="M462 340 V50 M478 340 V50"/>
    <path class="fino" d="${celosia(462, 50, 478, 340, 18, true)}"/>
    <path class="trazo" d="M462 50 L470 14 L478 50"/>
    <path class="trazo" d="M250 40 H540 M250 50 H540"/>
    <path class="fino" d="${celosia(250, 40, 540, 50, 14, false)}"/>
    <path class="fino" d="M470 14 L256 40 M470 14 L536 40"/>
    <rect class="lleno" x="508" y="50" width="28" height="18" rx="2"/>
    <rect class="cabina" x="480" y="52" width="18" height="16" rx="2"/>
    <rect class="lleno" x="292" y="50" width="16" height="6" rx="1"/>
  </g>

  <!-- La carga: se balancea colgada de la pluma -->
  <g class="carga">
    <path class="fino" d="M300 56 V84"/>
    <circle class="gancho" cx="300" cy="88" r="4"/>
    <path class="fino" d="M300 92 L262 106 M300 92 L338 106"/>
    <rect class="viga" x="250" y="106" width="100" height="10" rx="1.5"/>
    <path class="viga-borde" d="M254 111 H346"/>
  </g>

  <!-- Señalización de obra -->
  <g>
    <path class="cono" d="M101 336 L110 298 H114 L123 336 Z"/>
    <path class="cono-banda" d="M106 318 H118 L120 326 H104 Z"/>
    <rect class="cono" x="94" y="336" width="36" height="5" rx="1.5"/>
  </g>
  <g>
    <rect x="514" y="302" width="84" height="14" rx="2" fill="url(#rayas)" class="valla"/>
    <path class="trazo" d="M524 316 V340 M588 316 V340 M518 340 H530 M582 340 H594"/>
  </g>
</svg>`;

export const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>En mantenimiento · CadIT</title>
<style>
  @font-face {
    font-family: "Geist";
    font-weight: 100 900;
    font-display: swap;
    src: url(data:font/woff2;base64,${GEIST}) format("woff2");
  }
  :root {
    --bg: #f3f6fc;
    --grilla: rgba(10, 77, 255, 0.06);
    --grilla-fuerte: rgba(10, 77, 255, 0.11);
    --tinta: #001b5e;
    --texto: #3a4767;
    --linea: #001b5e;
    --linea-suave: rgba(0, 27, 94, 0.32);
    --azul: #0a4dff;
    --azul-hover: #003ad6;
    --sobre-azul: #ffffff;
    --vidrio: #dbe5ff;
    --naranja: #f26b0f;
    --placa: #ffffff;
    --sombra: 0 1px 2px rgba(0, 27, 94, 0.08), 0 8px 24px -12px rgba(0, 27, 94, 0.25);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #000f2e;
      --grilla: rgba(120, 160, 255, 0.06);
      --grilla-fuerte: rgba(120, 160, 255, 0.11);
      --tinta: #ffffff;
      --texto: #b9c6e6;
      --linea: #d4e0ff;
      --linea-suave: rgba(212, 224, 255, 0.35);
      --azul: #2f66ff;
      --azul-hover: #4f7dff;
      --sobre-azul: #ffffff;
      --vidrio: rgba(47, 102, 255, 0.28);
      --naranja: #ff8a3d;
      --placa: #ffffff;
      --sombra: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -12px rgba(0, 0, 0, 0.7);
    }
  }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  ::selection { background: var(--azul); color: var(--sobre-azul); }
  body {
    margin: 0;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg);
    background-image:
      linear-gradient(var(--grilla-fuerte) 1px, transparent 1px),
      linear-gradient(90deg, var(--grilla-fuerte) 1px, transparent 1px),
      linear-gradient(var(--grilla) 1px, transparent 1px),
      linear-gradient(90deg, var(--grilla) 1px, transparent 1px);
    background-size: 140px 140px, 140px 140px, 28px 28px, 28px 28px;
    background-position: -1px -1px;
    color: var(--texto);
    font-family: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 16px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }

  header { padding: 24px clamp(16px, 5vw, 56px); }
  .placa {
    display: inline-flex;
    padding: 10px 16px;
    background: var(--placa);
    border-radius: 12px;
    box-shadow: var(--sombra);
  }
  .placa img { display: block; height: 44px; width: auto; }

  main {
    flex: 1;
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 16px clamp(16px, 5vw, 56px) 56px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    align-items: center;
    align-content: center;
    gap: clamp(24px, 5vw, 72px);
  }

  h1 {
    margin: 0 0 20px;
    color: var(--tinta);
    font-size: clamp(2.5rem, 6vw, 4.25rem);
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }
  h1 span { color: var(--azul); }
  .bajada { margin: 0 0 32px; max-width: 38ch; font-size: 1.125rem; text-wrap: pretty; }

  .acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
  button {
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    min-height: 44px;
    padding: 0 22px;
    border: 0;
    border-radius: 10px;
    background: var(--azul);
    color: var(--sobre-azul);
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 27, 94, 0.2), 0 6px 16px -8px var(--azul);
    transition: background-color 160ms ease-out, transform 160ms ease-out;
  }
  button:hover { background: var(--azul-hover); }
  button:active { transform: translateY(1px); }
  button:focus-visible { outline: 2px solid var(--azul); outline-offset: 3px; }
  .estado { display: inline-flex; align-items: center; gap: 10px; font-size: 0.9375rem; font-variant-numeric: tabular-nums; }
  .punto { width: 8px; height: 8px; border-radius: 50%; background: var(--naranja); flex: none; animation: latido 2s ease-out infinite; }

  .lamina { position: relative; }
  .obra { display: block; width: 100%; height: auto; overflow: visible; }
  .obra path, .obra rect, .obra circle { vector-effect: non-scaling-stroke; }
  .trazo { fill: none; stroke: var(--linea); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .fino { fill: none; stroke: var(--linea); stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .suave { fill: none; stroke: var(--linea); stroke-width: 2; stroke-linecap: round; }
  .tenue { fill: none; stroke: var(--linea-suave); stroke-width: 1; stroke-linecap: round; }
  .proyectado { fill: none; stroke: var(--azul); stroke-width: 1.5; stroke-dasharray: 6 6; animation: trazar 1.4s linear infinite; }
  .vidrio { fill: var(--vidrio); stroke: var(--linea); stroke-width: 1.25; }
  .lleno { fill: var(--linea); }
  .cabina { fill: var(--vidrio); stroke: var(--linea); stroke-width: 1.25; }
  .gancho { fill: none; stroke: var(--naranja); stroke-width: 2.25; }
  .viga { fill: var(--azul); }
  .viga-borde { stroke: var(--sobre-azul); stroke-opacity: 0.45; stroke-width: 1; }
  .cono { fill: var(--naranja); }
  .cono-banda { fill: var(--bg); }
  .raya { fill: var(--azul); }
  .valla { stroke: var(--linea); stroke-width: 1.25; }
  .cota path { fill: none; stroke: var(--linea-suave); stroke-width: 1.25; stroke-linecap: round; }
  .cota text { fill: var(--texto); font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-anchor: middle; }
  .carga { transform-origin: 300px 56px; animation: balanceo 5.5s cubic-bezier(0.45, 0, 0.55, 1) infinite; }

  @keyframes balanceo { 0%, 100% { transform: rotate(-2.2deg); } 50% { transform: rotate(2.2deg); } }
  @keyframes trazar { to { stroke-dashoffset: -12; } }
  @keyframes latido {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--naranja) 55%, transparent); }
    100% { box-shadow: 0 0 0 10px transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    .carga, .proyectado, .punto { animation: none; }
  }

  @media (max-width: 820px) {
    main { grid-template-columns: 1fr; padding-top: 0; gap: 24px; }
    .lamina { order: -1; max-width: 520px; width: 100%; margin: 0 auto; }
    .bajada { font-size: 1.0625rem; margin-bottom: 28px; }
  }
</style>
</head>
<body>
<header>
  <span class="placa"><img src="data:image/webp;base64,${LOGO}" alt="CadIT" width="110" height="44"></span>
</header>
<main>
  <section>
    <h1>Estamos <span>en obra.</span></h1>
    <p class="bajada">Estamos haciendo mantenimiento en la plataforma. Volvé a intentar en unos minutos.</p>
    <div class="acciones">
      <button type="button" onclick="location.reload()">Reintentar ahora</button>
      <span class="estado"><span class="punto" aria-hidden="true"></span><span>Reintentamos solos en <span id="segundos">60</span> s</span></span>
    </div>
  </section>
  <div class="lamina">${ILUSTRACION}</div>
</main>
<script>
  (function () {
    var s = 60, el = document.getElementById("segundos");
    setInterval(function () {
      s = Math.max(0, s - 1);
      el.textContent = s;
      if (s === 0) location.reload();
    }, 1000);
  })();
</script>
</body>
</html>`;
