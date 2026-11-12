import React from "react";
import { Composition } from "remotion";
import { FPS, FRAMES_INTRO, Guia, IntroSolo, duracionTotalFrames } from "./Guia";
import type { GuiaProps } from "./tipos";

/** Datos de muestra para el Studio; el render real recibe el timeline de cada video. */
const MUESTRA: GuiaProps = {
  id: "muestra",
  titulo: "Contactos: buscar y filtrar",
  grupo: "Comercial",
  para: "Dirección · Coordinación",
  pantalla: "Contactos",
  fuente: "raw/muestra.webm",
  recorteInicio: 0,
  duracion: 20,
  ancho: 1440,
  alto: 900,
  pasos: [
    { t0: 1, t1: 6, texto: "Cada pestaña filtra por tipo de contacto", caja: { x: 300, y: 120, w: 500, h: 50 }, accion: "ver" },
    { t0: 6, t1: 12, texto: "Busque por nombre, correo o teléfono", caja: { x: 300, y: 200, w: 420, h: 44 }, accion: "clic" },
  ],
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="Guia"
      component={Guia}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={duracionTotalFrames(MUESTRA)}
      defaultProps={MUESTRA}
      calculateMetadata={({ props }) => ({ durationInFrames: duracionTotalFrames(props) })}
    />
    <Composition
      id="IntroGuia"
      component={IntroSolo}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FRAMES_INTRO}
      defaultProps={MUESTRA}
    />
  </>
);
