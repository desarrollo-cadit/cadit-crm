import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import type { Caja, GuiaProps, Paso } from "./tipos";

const { fontFamily } = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin", "latin-ext"] });

export const FPS = 30;
export const SEG_INTRO = 2.2;
export const SEG_CIERRE = 1.8;

/* Marca: la misma barra navy del panel; el resaltado, el naranja de los demos. */
const NAVY = "#001b5e";
const AZUL = "#5b7cff";
const NARANJA = "#ff8a00";

/* Geometría del lienzo 1920×1080 y de la ventana que muestra la app. */
const LW = 1920;
const LH = 1080;
const VW = 1584; // ancho del video en pantalla
const BARRA = 40;
const SRC_ANCHO = 1440;
const S0 = VW / SRC_ANCHO; // 1.1
const VH = Math.round(900 * S0); // 990
const VENTANA_X = (LW - VW) / 2;
const VENTANA_Y = (LH - (VH + BARRA)) / 2;

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const centro = (c: Caja) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

type Camara = { z: number; tx: number; ty: number };

function zoomAutomatico(c: Caja): number {
  const zx = (VW * 0.6) / (c.w * S0);
  const zy = (VH * 0.46) / (c.h * S0);
  const z = Math.min(zx, zy);
  // Una zona que ya ocupa media pantalla no se agranda: se ve entera.
  if (c.w * c.h > 1440 * 900 * 0.4) return 1;
  return clamp(z, 1.15, 1.7);
}

function camaraDe(paso: Paso | undefined): Camara {
  if (!paso?.caja) return { z: 1, tx: 0, ty: 0 };
  const z = paso.zoom ?? zoomAutomatico(paso.caja);
  const { x, y } = centro(paso.caja);
  // El objetivo queda arriba del centro: abajo va el subtítulo.
  const tx = clamp(VW / 2 - x * S0 * z, VW - VW * z, 0);
  const ty = clamp(VH * 0.4 - y * S0 * z, VH - VH * z, 0);
  return { z, tx, ty };
}

const suave = Easing.bezier(0.65, 0, 0.25, 1);

/** Estado de la cámara en el segundo `t` (interpola desde el paso anterior). */
function camaraEn(t: number, pasos: Paso[]): { cam: Camara; indice: number } {
  let indice = -1;
  for (let i = 0; i < pasos.length; i++) if (t >= pasos[i]!.t0) indice = i;
  if (indice < 0) return { cam: camaraDe(undefined), indice };
  const actual = camaraDe(pasos[indice]);
  const previa = camaraDe(pasos[indice - 1]);
  const p = suave(clamp((t - pasos[indice]!.t0) / 0.8, 0, 1));
  return {
    cam: {
      z: previa.z + (actual.z - previa.z) * p,
      tx: previa.tx + (actual.tx - previa.tx) * p,
      ty: previa.ty + (actual.ty - previa.ty) * p,
    },
    indice,
  };
}

/** Posición (px de la grabación) del cursor en el segundo `t`. */
function cursorEn(t: number, pasos: Paso[]): { x: number; y: number; visible: boolean; clic: number } {
  const conCaja = pasos.filter((p) => p.caja);
  if (!conCaja.length) return { x: 0, y: 0, visible: false, clic: -1 };
  let destino = conCaja[0]!;
  let origen = { x: 80, y: 120 };
  for (const p of conCaja) {
    if (t >= p.t0) {
      const i = conCaja.indexOf(p);
      destino = p;
      origen = i > 0 ? centro(conCaja[i - 1]!.caja!) : origen;
    }
  }
  const d = centro(destino.caja!);
  const p = suave(clamp((t - destino.t0) / 0.9, 0, 1));
  const llegada = destino.t0 + 0.9;
  return {
    x: origen.x + (d.x - origen.x) * p,
    y: origen.y + (d.y - origen.y) * p,
    visible: t >= conCaja[0]!.t0 - 0.2,
    clic: destino.accion === "clic" ? t - llegada : -1,
  };
}

/* ------------------------------------------------------------------ Piezas */

const Fondo: React.FC = () => {
  const frame = useCurrentFrame();
  const a = Math.sin(frame / 90) * 60;
  return (
    <AbsoluteFill
      style={{
        background: NAVY,
        backgroundImage: `radial-gradient(circle at ${78 + a / 20}% 12%, rgba(91,124,255,.42), transparent 46%),
          radial-gradient(circle at 8% 96%, rgba(0,140,255,.26), transparent 42%)`,
      }}
    />
  );
};

const Cursor: React.FC<{ x: number; y: number; clic: number; cam: Camara }> = ({ x, y, clic, cam }) => {
  const px = x * S0 * cam.z + cam.tx;
  const py = y * S0 * cam.z + cam.ty;
  const pulso = clic >= 0 && clic < 0.6 ? clic / 0.6 : -1;
  return (
    <div style={{ position: "absolute", left: px, top: py, pointerEvents: "none" }}>
      {pulso >= 0 && (
        <div
          style={{
            position: "absolute",
            left: -30,
            top: -30,
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: `4px solid ${NARANJA}`,
            transform: `scale(${0.3 + pulso * 1.4})`,
            opacity: 1 - pulso,
          }}
        />
      )}
      <svg width="38" height="38" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 3px 5px rgba(0,0,0,.4))" }}>
        <path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke={NAVY} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const Resaltado: React.FC<{ paso: Paso; t: number; cam: Camara }> = ({ paso, t, cam }) => {
  // Los hooks van antes de cualquier return condicional (orden de hooks).
  const { fps } = useVideoConfig();
  if (!paso.caja) return null;
  const entra = spring({ frame: Math.max(0, (t - paso.t0 - 0.35) * fps), fps, config: { damping: 16, stiffness: 140 } });
  const sale = interpolate(t, [paso.t1 - 0.25, paso.t1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const latido = 1 + Math.sin(t * 5) * 0.012;
  const m = 8;
  const { x: x0, y: y0, w: w0, h: h0 } = paso.caja;
  // Un resaltado nunca es más fino que una línea cómoda: una caja de 16 px de alto
  // (una línea de texto) se ve como un trazo y no como una zona señalada.
  const w = Math.max(w0, 56);
  const h = Math.max(h0, 34);
  const x = x0 - (w - w0) / 2;
  const y = y0 - (h - h0) / 2;
  return (
    <div
      style={{
        position: "absolute",
        left: (x - m) * S0 * cam.z + cam.tx,
        top: (y - m) * S0 * cam.z + cam.ty,
        width: (w + 2 * m) * S0 * cam.z,
        height: (h + 2 * m) * S0 * cam.z,
        border: `5px solid ${NARANJA}`,
        borderRadius: 16,
        boxShadow: `0 0 0 ${10 * entra}px rgba(255,138,0,.22), 0 0 40px rgba(255,138,0,.45)`,
        opacity: entra * sale,
        transform: `scale(${(0.94 + 0.06 * entra) * latido})`,
        pointerEvents: "none",
      }}
    />
  );
};

const Subtitulo: React.FC<{ paso: Paso; indice: number; total: number; t: number }> = ({ paso, indice, total, t }) => {
  const { fps } = useVideoConfig();
  const entra = spring({ frame: Math.max(0, (t - paso.t0) * fps), fps, config: { damping: 15, stiffness: 120 } });
  const sale = interpolate(t, [paso.t1 - 0.2, paso.t1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: VENTANA_Y + 34,
        display: "flex",
        justifyContent: "center",
        opacity: entra * sale,
        transform: `translateY(${(1 - entra) * 40}px) scale(${0.96 + 0.04 * entra})`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          maxWidth: 1480,
          padding: "20px 38px 20px 22px",
          borderRadius: 26,
          background: "rgba(0,27,94,.94)",
          boxShadow: "0 18px 50px rgba(0,10,40,.5)",
          border: "1px solid rgba(159,180,255,.35)",
        }}
      >
        <div
          style={{
            flex: "none",
            width: 64,
            height: 64,
            borderRadius: 18,
            background: AZUL,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 30,
            fontWeight: 800,
          }}
        >
          {indice + 1}
        </div>
        <div style={{ color: "#fff", fontSize: 44, lineHeight: 1.18, fontWeight: 700, letterSpacing: "-0.01em" }}>{paso.texto}</div>
        <div style={{ flex: "none", color: "#9fb4ff", fontSize: 22, fontWeight: 600 }}>
          {indice + 1}/{total}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ Escena: app */

const Escena: React.FC<{ props: GuiaProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { cam, indice } = camaraEn(t, props.pasos);
  const cur = cursorEn(t, props.pasos);
  const entra = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
  const paso = indice >= 0 ? props.pasos[indice] : undefined;

  return (
    <AbsoluteFill style={{ transform: `scale(${0.94 + 0.06 * entra})`, opacity: entra }}>
      <div
        style={{
          position: "absolute",
          left: VENTANA_X,
          top: VENTANA_Y,
          width: VW,
          height: VH + BARRA,
          borderRadius: 22,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 40px 90px rgba(0,8,36,.6), 0 0 0 1px rgba(255,255,255,.12)",
        }}
      >
        <div style={{ height: BARRA, background: "#eef1f8", display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
          ))}
          <div
            style={{
              marginLeft: 18,
              padding: "4px 18px",
              borderRadius: 8,
              background: "#fff",
              color: "#44507a",
              fontSize: 17,
              fontWeight: 600,
            }}
          >
            CadIT · {props.pantalla}
          </div>
        </div>
        <div style={{ position: "relative", width: VW, height: VH, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: VW, height: VH, transformOrigin: "0 0", transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})` }}>
            <OffthreadVideo src={staticFile(props.fuente)} trimBefore={Math.round(props.recorteInicio * FPS)} style={{ width: VW, height: VH, display: "block" }} />
          </div>
          {paso && <Resaltado paso={paso} t={t} cam={cam} />}
          {cur.visible && <Cursor x={cur.x} y={cur.y} clic={cur.clic} cam={cam} />}
        </div>
      </div>
      {paso && <Subtitulo paso={paso} indice={indice} total={props.pasos.length} t={t} />}
      <div style={{ position: "absolute", left: 0, top: 0, height: 8, width: `${(t / props.duracion) * 100}%`, background: `linear-gradient(90deg, ${AZUL}, ${NARANJA})` }} />
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------- Intro y cierre */

/**
 * El logo ORIGINAL de CAD IT (`public/logo-cadit-completo.webp`, el mismo que
 * usa la app). Está dibujado para fondo claro: va siempre sobre su plato
 * blanco, como en la barra y en el acceso. Nunca se redibuja ni se recolorea.
 */
const Marca: React.FC<{ alto?: number }> = ({ alto = 84 }) => (
  <div
    style={{
      display: "inline-flex",
      background: "#fff",
      borderRadius: alto * 0.2,
      padding: `${alto * 0.06}px ${alto * 0.16}px`,
      boxShadow: "0 12px 40px rgba(0,8,36,.35)",
    }}
  >
    <Img src={staticFile("marca/logo-cadit-completo.webp")} style={{ height: alto, width: "auto", display: "block" }} />
  </div>
);

const Intro: React.FC<{ props: GuiaProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palabras = props.titulo.split(" ");
  const chip = spring({ frame, fps, config: { damping: 14 } });
  const linea = spring({ frame: frame - 14, fps, config: { damping: 20 } });
  const salida = interpolate(frame, [SEG_INTRO * fps - 8, SEG_INTRO * fps], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ padding: "0 150px", justifyContent: "center", opacity: salida }}>
      <div style={{ position: "absolute", top: 70, left: 150 }}>
        <Marca />
      </div>
      <div
        style={{
          alignSelf: "flex-start",
          padding: "10px 24px",
          borderRadius: 999,
          background: "rgba(91,124,255,.28)",
          border: "1px solid rgba(159,180,255,.5)",
          color: "#cfd9ff",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          transform: `translateX(${(1 - chip) * -80}px)`,
          opacity: chip,
          marginBottom: 34,
        }}
      >
        {/* Solo la sección: los roles se editan desde el panel, así que una lista de roles pegada
            dentro del video quedaría vieja. Quién ve cada video lo decide la guía, con los permisos reales. */}
        {props.grupo}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 22px", maxWidth: 1500 }}>
        {palabras.map((w, i) => {
          const s = spring({ frame: frame - 6 - i * 3, fps, config: { damping: 13, stiffness: 140 } });
          return (
            <span key={i} style={{ display: "inline-block", color: "#fff", fontSize: 108, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.03em", opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>
              {w}
            </span>
          );
        })}
      </div>
      <div style={{ width: 150 * linea, height: 7, borderRadius: 4, background: AZUL, marginTop: 44 }} />
    </AbsoluteFill>
  );
};

const Cierre: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36, opacity: s, transform: `scale(${0.9 + 0.1 * s})` }}>
      <Marca alto={170} />
      <div style={{ color: "#d5defc", fontSize: 44, fontWeight: 600, textAlign: "center", maxWidth: 1100, lineHeight: 1.3 }}>
        Encuentre el resto de los tutoriales en la Guía del panel
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------- Composición */

export const duracionTotalFrames = (p: GuiaProps) => Math.round((SEG_INTRO + p.duracion + SEG_CIERRE) * FPS);

/** Solo la intro: sirve para reemplazar la de un video ya renderizado sin volver a hacerlo entero. */
export const FRAMES_INTRO = Math.round(SEG_INTRO * FPS);
export const IntroSolo: React.FC<GuiaProps> = (props) => (
  <AbsoluteFill style={{ fontFamily }}>
    <Fondo />
    <Intro props={props} />
  </AbsoluteFill>
);

export const Guia: React.FC<GuiaProps> = (props) => {
  const fIntro = Math.round(SEG_INTRO * FPS);
  const fMain = Math.round(props.duracion * FPS);
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Fondo />
      <Sequence durationInFrames={fIntro}>
        <Intro props={props} />
      </Sequence>
      <Sequence from={fIntro} durationInFrames={fMain}>
        <Escena props={props} />
      </Sequence>
      <Sequence from={fIntro + fMain}>
        <Cierre />
      </Sequence>
    </AbsoluteFill>
  );
};
