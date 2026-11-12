/** Rectángulo en píxeles de la grabación original (1440×900). */
export type Caja = { x: number; y: number; w: number; h: number };

export type Paso = {
  /** Segundos desde el inicio de la grabación cruda. */
  t0: number;
  t1: number;
  /** Subtítulo del paso: una idea, español formal. */
  texto: string;
  /** Zona que se explica. Sin caja, la cámara queda en plano general. */
  caja?: Caja | null;
  /** Zoom manual; si falta se calcula por el tamaño de la caja. */
  zoom?: number | null;
  /** "clic" dibuja el cursor llegando y el pulso del clic. */
  accion?: "clic" | "ver" | "escribir" | null;
};

export type GuiaProps = {
  id: string;
  titulo: string;
  /** Sección de la guía ("Comercial", "Portal del alumno"…). */
  grupo: string;
  /** Para quién es: "Dirección · Coordinación". */
  para: string;
  /** Pantalla que se recorre, para la barra de la ventana ("Contactos"). */
  pantalla: string;
  /** Ruta bajo public/ del video crudo (`raw/<id>.webm`). */
  fuente: string;
  /** Segundos iniciales de la grabación cruda que se descartan (carga de la página). */
  recorteInicio: number;
  /** Duración útil (ya sin el recorte) en segundos. */
  duracion: number;
  ancho: number;
  alto: number;
  pasos: Paso[];
};
