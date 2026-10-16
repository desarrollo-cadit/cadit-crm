import { z } from "zod";

/**
 * 038 — El certificado con el diseño de la academia: contenido y diagramación, PUROS.
 *
 * Ninguna lectura de base ni de disco acá. `src/server/certificate-pdf.ts`
 * arma los hechos (congelados al emitir) y `src/lib/certificado-pdf.ts`
 * dibuja; este módulo decide QUÉ dice cada formato y DÓNDE va, para que la
 * regla se pruebe sin base y sin fuentes.
 *
 * Las medidas salen de los ejemplos entregados por el dueño
 * (`eBIM_diplomas_Noelia_Sosa.pdf`, `eBIM_diplomas_Luis_Gonzalez_Susperreguy.pdf`),
 * medidas sobre el PDF y no a ojo: coordenadas en puntos, origen abajo a la
 * izquierda, como las usa `pdf-lib`. Las plantillas traen lo fijo; lo de acá
 * es solo lo variable (FR-001).
 *
 * Medir texto exige la fuente, y la fuente es un archivo: por eso las
 * funciones de acomodo reciben un `Medidor` en vez de importarla. El PDF le
 * pasa el real; los tests, uno de mentira o el real, según lo que prueben.
 */

export const FORMATOS_DE_CERTIFICADO = ["especializacion", "modulo", "curso"] as const;
export type FormatoDeCertificado = (typeof FORMATOS_DE_CERTIFICADO)[number];

/**
 * 038 (FR-004, edge case "datos congelados") — Lo que se guarda en
 * `certificate.snapshot` al emitir.
 *
 * Es lo que hace falta para REGENERAR el mismo PDF meses después aunque
 * cambien el nombre del alumno, el del curso o el orden del programa: el
 * certificado ya está en manos de la persona, y el papel que descargue hoy
 * tiene que decir lo mismo que el que descargó ayer.
 */
export const certificadoSnapshotSchema = z.object({
  version: z.literal(1),
  formato: z.enum(FORMATOS_DE_CERTIFICADO),
  /** Nombre completo del contacto tal como estaba al emitir. */
  alumno: z.string(),
  /**
   * El nombre del CURSO. En el general y en el de módulo es el curso de la
   * ESPECIALIZACIÓN, nunca el nombre de la cohorte (FR-002).
   */
  curso: z.string(),
  cohorte: z.string().nullable(),
  /** Año de inicio de la cohorte de la especialización o del curso. */
  anio: z.number().int(),
  /** Solo en el de módulo. */
  modulo: z
    .object({ ordinal: z.number().int().positive().nullable(), nombre: z.string() })
    .nullable(),
  /** Solo en el general: los módulos del programa, en orden. */
  modulos: z.array(z.string()),
  /** La descripción del curso o del módulo (FR-012). */
  descripcion: z.string().nullable(),
});
export type CertificadoSnapshot = z.infer<typeof certificadoSnapshotSchema>;

/** Lee un snapshot guardado; `null` si no hay o no tiene la forma esperada. */
export function leerSnapshot(raw: unknown): CertificadoSnapshot | null {
  const r = certificadoSnapshotSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/* ============================================================
 * Números romanos (FR-003)
 * ============================================================ */

const ROMANOS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** 038 (FR-003) — 1 → "I", 4 → "IV", 12 → "XII". Fuera de 1..3999 no hay romano. */
export function aRomano(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) {
    throw new RangeError(`No hay número romano para ${n}`);
  }
  let resto = n;
  let salida = "";
  for (const [valor, letras] of ROMANOS) {
    while (resto >= valor) {
      salida += letras;
      resto -= valor;
    }
  }
  return salida;
}

/* ============================================================
 * El contenido
 * ============================================================ */

export type CertificadoVista = {
  formato: FormatoDeCertificado;
  /** El nombre del curso en mayúsculas, como el diseño. */
  titulo: string;
  anio: string;
  alumno: string;
  frase: string;
  /** El general: los módulos en mayúsculas y en orden. Vacío en los otros. */
  modulos: string[];
  /** El de módulo: su nombre en mayúsculas. `null` en los otros. */
  nombreModulo: string | null;
  /** `null` cuando no hay: sin párrafo y sin hueco (US3, escenario 2). */
  descripcion: string | null;
  codigo: string;
  /** FR-006 — la dirección pública de verificación. */
  verificacion: string;
};

function limpio(texto: string): string {
  return texto.normalize("NFC").replace(/\s+/g, " ").trim();
}

function mayusculas(texto: string): string {
  return limpio(texto).toLocaleUpperCase("es");
}

/** La frase que va debajo del nombre, según el formato. */
export function fraseDelCertificado(
  formato: FormatoDeCertificado,
  ordinal: number | null = null
): string {
  if (formato === "especializacion") return "Ha completado exitosamente la totalidad del curso";
  if (formato === "curso") return "Ha completado exitosamente el curso";
  // Sin orden cargado no se inventa un número (028, `etiquetaDeModulo`).
  return ordinal === null
    ? "Ha completado exitosamente el módulo"
    : `Ha completado exitosamente el módulo ${aRomano(ordinal)}`;
}

/** 038 — De los hechos congelados al contenido de la hoja. */
export function armarCertificado(
  s: CertificadoSnapshot,
  opts: { codigo: string; baseUrl: string }
): CertificadoVista {
  const descripcion = s.formato === "especializacion" ? null : limpio(s.descripcion ?? "");
  return {
    formato: s.formato,
    titulo: mayusculas(s.curso),
    anio: String(s.anio),
    alumno: limpio(s.alumno),
    frase: fraseDelCertificado(s.formato, s.modulo?.ordinal ?? null),
    modulos: s.formato === "especializacion" ? s.modulos.map(mayusculas).filter(Boolean) : [],
    nombreModulo: s.formato === "modulo" && s.modulo ? mayusculas(s.modulo.nombre) : null,
    descripcion: descripcion ? descripcion : null,
    codigo: opts.codigo,
    verificacion: `${opts.baseUrl.replace(/\/+$/, "")}/verificar/${opts.codigo}`,
  };
}

/* ============================================================
 * La diagramación (medida sobre los ejemplos)
 * ============================================================ */

export const AZUL = { r: 63, g: 93, b: 170 } as const; // #3F5DAA, títulos, nombre y módulos
export const GRIS_TEXTO = { r: 65, g: 64, b: 66 } as const; // #414042, frase y descripción
export const GRIS_PIE = { r: 140, g: 140, b: 145 } as const; // código y verificación, discretos

export type Caja = {
  /** Centro horizontal del texto. */
  centro: number;
  ancho: number;
};

export type Diagrama = {
  pagina: { ancho: number; alto: number };
  titulo: Caja & { size: number; minSize: number; primeraLinea: number; interlineado: number };
  anio: { size: number; tracking: number; distancia: number };
  alumno: Caja & { y: number; size: number; minSize: number };
  frase: Caja & { y: number; size: number };
  /** Horizontal: el nombre del módulo, encima de la raya de la plantilla. */
  modulo: (Caja & { y: number; size: number; minSize: number }) | null;
  /** Horizontal: el párrafo, debajo de la raya; jamás llega a las firmas. */
  descripcion: CajaDeDescripcion | null;
  /** Vertical: la lista de módulos con su tilde. */
  lista: {
    primeraLinea: number;
    paso: number;
    size: number;
    /** Ninguna línea de base por debajo de esto: abajo empiezan las firmas. */
    piso: number;
    /** Hasta dónde puede subir la primera si hay más de cuatro. */
    techo: number;
    anchoTexto: number;
    /** Del centro de la tilde al comienzo del texto, a 21 pt. */
    sangria: number;
    /** Del renglón al centro de la tilde, a 21 pt. */
    alturaIcono: number;
    radioIcono: number;
  } | null;
  /** FR-006 — código y verificación, chiquitos, debajo del pie de la plantilla. */
  verificacion: { y: number; size: number; centro: number };
};

/**
 * 038 — El párrafo de los horizontales. UNA sola caja para el de módulo y el
 * de curso, y es la misma con la que la carga del curso valida (FR-012): si
 * el dibujo y la validación usaran cajas distintas, un texto aceptado podría
 * salir pisando una firma.
 */
export type CajaDeDescripcion = Caja & {
  /** La primera línea, como en el ejemplo, cuando el párrafo entra así. */
  primeraLinea: number;
  /** Lo más arriba que puede empezar: debajo de la raya de la plantilla. */
  techo: number;
  /**
   * Ninguna letra por debajo de esto (línea de base menos el descendente):
   * es el tope de las firmas más un margen.
   */
  piso: number;
  size: number;
  minSize: number;
  /** Interlineados a probar, en múltiplos del tamaño: el del ejemplo y uno más apretado. */
  interlineados: readonly number[];
  maxLineas: number;
};

/**
 * 038 — Lo más alto que llega el trazo de las firmas de cada plantilla
 * horizontal, MEDIDO sobre el PDF del diseño (no a ojo): en la de
 * especialización, el trazo de la firma del Coordinador Docente sube hasta
 * y ≈ 159,5 pt; en la de curso, la del Director hasta y ≈ 141,5 pt. Si se
 * cambia una plantilla, hay que volver a medirlo.
 */
export const TOPE_DE_FIRMAS: Record<"modulo" | "curso", number> = {
  modulo: 159.5,
  curso: 141.5,
};

/** Aire entre la última letra del párrafo y el trazo más alto de una firma. */
export const MARGEN_SOBRE_FIRMAS = 4;

/** Descendente de Poppins (350/1000): lo que la "p" o la "q" bajan de la línea de base. */
export const DESCENDENTE_POPPINS = 0.35;

const CAJA_DESCRIPCION: CajaDeDescripcion = {
  centro: 841.89 / 2,
  ancho: 540,
  primeraLinea: 205.6,
  // La raya de la plantilla está en y ≈ 236,5: con 11 pt, la mayúscula
  // (0,7 em) queda 8 pt por debajo.
  techo: 220,
  piso: Math.max(TOPE_DE_FIRMAS.modulo, TOPE_DE_FIRMAS.curso) + MARGEN_SOBRE_FIRMAS,
  size: 11,
  minSize: 9,
  // 16 pt a 11 pt es el interlineado del ejemplo; 1,3 es el más apretado que
  // se sigue leyendo bien.
  interlineados: [16 / 11, 1.3],
  maxLineas: 4,
};

const VERTICAL = { ancho: 595.276, alto: 841.89 };
const HORIZONTAL = { ancho: 841.89, alto: 595.276 };

/**
 * El nombre en Parisienne: los ejemplos usaban otra manuscrita a 76 pt
 * (`MeowScript`), más angosta. A 62 pt Parisienne ocupa el mismo ancho que
 * el ejemplo para "Noelia Sosa Machado" y "Luis Gonalez Susperreguy".
 */
const NOMBRE_PT = 62;

const DIAGRAMA_VERTICAL: Diagrama = {
  pagina: VERTICAL,
  titulo: {
    centro: VERTICAL.ancho / 2,
    ancho: 500,
    size: 42.55,
    minSize: 24,
    primeraLinea: 711.6,
    interlineado: 40.7,
  },
  anio: { size: 23.29, tracking: 0.22, distancia: 34.4 },
  alumno: { centro: VERTICAL.ancho / 2, ancho: 555, y: 525.5, size: NOMBRE_PT, minSize: 26 },
  frase: { centro: VERTICAL.ancho / 2, ancho: 520, y: 445.1, size: 12.79 },
  modulo: null,
  descripcion: null,
  lista: {
    primeraLinea: 395.2,
    paso: 33.47,
    size: 21,
    piso: 292,
    techo: 412,
    anchoTexto: 400,
    sangria: 24.13,
    alturaIcono: 8.24,
    radioIcono: 11.47,
  },
  verificacion: { y: 8, size: 6, centro: VERTICAL.ancho / 2 },
};

const DIAGRAMA_HORIZONTAL: Diagrama = {
  pagina: HORIZONTAL,
  titulo: {
    centro: HORIZONTAL.ancho / 2,
    ancho: 560,
    size: 38.68,
    minSize: 22,
    primeraLinea: 478.5,
    interlineado: 37,
  },
  anio: { size: 21.18, tracking: 0.22, distancia: 31.3 },
  alumno: { centro: HORIZONTAL.ancho / 2, ancho: 690, y: 326, size: NOMBRE_PT, minSize: 26 },
  frase: { centro: HORIZONTAL.ancho / 2, ancho: 600, y: 283.6, size: 12.79 },
  modulo: { centro: HORIZONTAL.ancho / 2, ancho: 620, y: 254.1, size: 21, minSize: 12 },
  descripcion: CAJA_DESCRIPCION,
  lista: null,
  verificacion: { y: 10, size: 6, centro: HORIZONTAL.ancho / 2 },
};

/**
 * El curso común no tiene nombre de módulo: la frase baja al medio del
 * espacio que queda entre el nombre y la raya, para que no quede un hueco
 * colgando encima de la raya.
 */
const DIAGRAMA_CURSO: Diagrama = {
  ...DIAGRAMA_HORIZONTAL,
  frase: { ...DIAGRAMA_HORIZONTAL.frase, y: 262 },
  modulo: null,
};

export function diagramaDe(formato: FormatoDeCertificado): Diagrama {
  if (formato === "especializacion") return DIAGRAMA_VERTICAL;
  return formato === "modulo" ? DIAGRAMA_HORIZONTAL : DIAGRAMA_CURSO;
}

/** Cada formato, su plantilla (FR-001). */
export const PLANTILLA_DE: Record<FormatoDeCertificado, string> = {
  especializacion: "especializacion-vertical.pdf",
  modulo: "especializacion-horizontal.pdf",
  curso: "curso-horizontal.pdf",
};

/* ============================================================
 * Acomodo del texto (FR-005)
 * ============================================================ */

/** Ancho de `texto` a `size` puntos, con la fuente que corresponda. */
export type Medidor = (texto: string, size: number) => number;

/** Redondeo hacia abajo a décimas: un tamaño que "casi entra" no entra. */
function piso(n: number): number {
  return Math.floor(n * 10) / 10;
}

/**
 * El tamaño más grande, hasta `size`, con el que `texto` entra en `ancho`.
 *
 * Nunca corta ni deja salir el nombre: si ni a `minSize` entra, se sigue
 * achicando — un nombre chico es feo, uno que se sale de la hoja es un
 * certificado mal hecho.
 */
export function achicarParaEntrar(
  texto: string,
  medir: Medidor,
  opts: { size: number; ancho: number }
): number {
  const w = medir(texto, opts.size);
  if (w <= opts.ancho) return opts.size;
  return piso((opts.size * opts.ancho) / w);
}

/**
 * El título en una línea si entra; si no, en DOS líneas equilibradas, como
 * el ejemplo ("ESPECIALIZACIÓN / EN PROYECTOS BIM" y no "ESPECIALIZACIÓN EN /
 * PROYECTOS BIM"): de todos los cortes posibles, el que deja la línea más
 * larga más corta. Si ni así entra, se achica.
 */
export function partirTitulo(
  texto: string,
  medir: Medidor,
  opts: { size: number; ancho: number; minSize: number }
): { lineas: string[]; size: number } {
  const t = limpio(texto);
  if (medir(t, opts.size) <= opts.ancho) return { lineas: [t], size: opts.size };

  const palabras = t.split(" ");
  if (palabras.length === 1) {
    return { lineas: [t], size: achicarParaEntrar(t, medir, opts) };
  }

  let mejor: { lineas: string[]; ancho: number } | null = null;
  for (let i = 1; i < palabras.length; i++) {
    const lineas = [palabras.slice(0, i).join(" "), palabras.slice(i).join(" ")];
    const ancho = Math.max(...lineas.map((l) => medir(l, opts.size)));
    if (!mejor || ancho < mejor.ancho) mejor = { lineas, ancho };
  }
  const elegido = mejor!;
  const size =
    elegido.ancho <= opts.ancho ? opts.size : piso((opts.size * opts.ancho) / elegido.ancho);
  return { lineas: elegido.lineas, size };
}

/** Parte un párrafo en líneas de a lo sumo `ancho` (una palabra sola nunca se parte). */
export function partirParrafo(
  texto: string,
  medir: Medidor,
  size: number,
  ancho: number
): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of limpio(texto).split(" ").filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (!actual || medir(prueba, size) <= ancho) {
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export type DescripcionAcomodada = {
  lineas: string[];
  size: number;
  /** Línea de base de la primera línea. */
  primeraLinea: number;
  /** De línea de base a línea de base, en puntos. */
  interlineado: number;
  /** `false` = ni al tamaño mínimo entra en la caja del diseño. */
  entra: boolean;
};

/** La línea de base más baja de un bloque. */
export function ultimaLineaDeBase(a: Pick<DescripcionAcomodada, "lineas" | "primeraLinea" | "interlineado">): number {
  return a.primeraLinea - a.interlineado * Math.max(0, a.lineas.length - 1);
}

/**
 * Dónde empieza un bloque de `n` líneas para no bajar del `piso`: en la línea
 * del ejemplo si alcanza y, si no, más arriba, hasta el `techo`. `null` = ni
 * subiéndolo hasta el techo queda por encima de las firmas.
 */
function inicioDelBloque(
  n: number,
  size: number,
  interlineado: number,
  caja: CajaDeDescripcion
): number | null {
  const necesario = caja.piso + DESCENDENTE_POPPINS * size + interlineado * (n - 1);
  const inicio = Math.max(caja.primeraLinea, necesario);
  return inicio <= caja.techo + 1e-9 ? inicio : null;
}

/**
 * La descripción dentro de su caja, sin tocar NUNCA las firmas.
 *
 * Primero el tamaño y el interlineado del ejemplo; si no entra, se aprieta el
 * interlineado, el bloque sube hacia la raya y la letra baja de a medio punto
 * hasta `minSize`. Si ni así entra, se cortan las líneas que sobran con "…"
 * —igual por encima de las firmas—, pero eso no debería pasar nunca: la carga
 * del curso lo rechaza con la MISMA caja (`descripcionEntraEnCertificado`,
 * US3 escenario 3).
 */
export function acomodarDescripcion(
  texto: string,
  medir: Medidor,
  caja: CajaDeDescripcion
): DescripcionAcomodada {
  for (let size = caja.size; size >= caja.minSize - 1e-9; size -= 0.5) {
    const lineas = partirParrafo(texto, medir, size, caja.ancho);
    if (lineas.length > caja.maxLineas) continue;
    for (const factor of caja.interlineados) {
      const interlineado = factor * size;
      const inicio = inicioDelBloque(lineas.length, size, interlineado, caja);
      if (inicio !== null) {
        return { lineas, size, primeraLinea: inicio, interlineado, entra: true };
      }
    }
  }

  // No entra: al mínimo, lo más apretado, y solo las líneas que caben arriba de las firmas.
  const size = caja.minSize;
  const interlineado = Math.min(...caja.interlineados) * size;
  let cuantas = caja.maxLineas;
  while (cuantas > 1 && inicioDelBloque(cuantas, size, interlineado, caja) === null) cuantas--;
  const inicio = inicioDelBloque(cuantas, size, interlineado, caja) ?? caja.techo;
  const lineas = partirParrafo(texto, medir, size, caja.ancho).slice(0, cuantas);
  const ultima = lineas.length - 1;
  let cola = lineas[ultima] ?? "";
  while (cola && medir(`${cola}…`, size) > caja.ancho) {
    cola = cola.replace(/\s*\S+$/, "");
  }
  lineas[ultima] = `${cola}…`;
  return { lineas, size, primeraLinea: inicio, interlineado, entra: false };
}

/**
 * 038 (FR-012) — El largo máximo de la descripción, en caracteres.
 *
 * Sale de la caja del diseño: 4 líneas de 540 pt a 9 pt de Poppins son unos
 * 110 caracteres por línea con texto corriente. 400 deja margen para palabras
 * largas. Igual el servidor mide de verdad (`descripcionEntraEnCertificado`):
 * el largo es la primera barrera, la medida es la que decide.
 */
export const MAX_DESCRIPCION_CERTIFICADO = 400;

/**
 * El lugar de cada módulo en la lista del general.
 *
 * Hasta cuatro, exactamente como el ejemplo. Con más, la lista sube hasta el
 * `techo` y se aprieta hasta el `piso` —nunca pisa las firmas—, y la letra
 * baja en proporción al paso.
 */
export function distribuirModulos(
  cantidad: number,
  lista: NonNullable<Diagrama["lista"]>
): { baselines: number[]; size: number } {
  if (cantidad <= 0) return { baselines: [], size: lista.size };
  const ultimaNatural = lista.primeraLinea - lista.paso * (cantidad - 1);
  if (ultimaNatural >= lista.piso) {
    return {
      baselines: Array.from({ length: cantidad }, (_, i) => lista.primeraLinea - lista.paso * i),
      size: lista.size,
    };
  }
  const paso = (lista.techo - lista.piso) / (cantidad - 1);
  const size = piso(Math.min(lista.size, (paso * lista.size) / lista.paso));
  return {
    baselines: Array.from({ length: cantidad }, (_, i) => lista.techo - paso * i),
    size,
  };
}

/* ============================================================
 * Nombre del archivo (FR-015)
 * ============================================================ */

/** "Certificado - Ana Pérez - Revit.pdf", seguro para `Content-Disposition`. */
export function nombreDeArchivoCertificado(
  alumno: string,
  curso: string
): { ascii: string; utf8: string } {
  const base = `Certificado - ${alumno} - ${curso}`
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150)
    .trim();
  return {
    ascii: `${base.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}.pdf`,
    utf8: encodeURIComponent(`${base}.pdf`),
  };
}

/* ============================================================
 * Cuándo se puede emitir (FR-008)
 * ============================================================ */

/**
 * 038 (FR-008) — ¿Ya terminó? La misma regla que `computeCohortStatus`
 * ("finalizada" = ya pasó la fecha de fin), para que la planilla y la emisión
 * no discutan sobre si una cohorte terminó.
 *
 * Sin fecha de fin no hay manera de afirmar que terminó: `null`, que quien
 * llama traduce en "cargá la fecha de fin". Decir que sí sería emitir un
 * certificado de un curso que capaz sigue.
 */
export function cursadaTermino(endDate: Date | null | undefined, now: Date): boolean | null {
  if (!endDate) return null;
  return now > endDate;
}

/**
 * El fin de una especialización: el de su camada, o —si no se cargó— el del
 * último módulo. Un módulo sin fecha no cuenta; si ninguno tiene, no hay fin.
 */
export function finDeEspecializacion(
  endDate: Date | null | undefined,
  finesDeModulos: readonly (Date | null | undefined)[]
): Date | null {
  if (endDate) return endDate;
  const fines = finesDeModulos.filter((d): d is Date => d instanceof Date);
  if (fines.length === 0) return null;
  return new Date(Math.max(...fines.map((d) => d.getTime())));
}

/** "20/11/2026": las fechas de cohorte son días, guardados a medianoche UTC. */
export function fechaCorta(d: Date): string {
  const [y, m, dia] = d.toISOString().slice(0, 10).split("-");
  return `${dia}/${m}/${y}`;
}

/** El año del certificado: el de INICIO de la cohorte (edge case "Año"). */
export function anioDeInicio(startDate: Date): number {
  return startDate.getUTCFullYear();
}
