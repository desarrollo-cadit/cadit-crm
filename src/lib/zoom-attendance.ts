/**
 * Asistencia sugerida desde Zoom (constitución 1.9.0) — la parte PURA.
 *
 * Sin base, sin red, sin reloj: entra lo que Zoom informó (tramos crudos), la
 * ventana de la clase (`classInstant()`, nunca armada a mano), la lista del
 * grupo de ESA clase, lo aprendido y los umbrales; sale una sugerencia por
 * alumno. Se calcula al LEER y no se guarda: una marca en `attendance` vuelve
 * "tomada" la clase, así que lo único que escribe ahí es la confirmación de
 * una persona del equipo (`src/server/zoom/attendance-review.ts`).
 *
 * Reglas:
 * 1. Se excluye al anfitrión, al profesor, al equipo y a lo marcado "ignorar".
 *    La sala de espera no suma minutos.
 * 2. Una persona por llave: usuario de Zoom › registrante › correo › nombre
 *    normalizado (la más débil).
 * 3. Minutos = UNIÓN de tramos recortados a [inicio − 15, fin + 15] (teléfono
 *    y computadora a la vez no cuentan doble), redondeado hacia abajo.
 * 4. Coincidencia, SOLO contra la lista del grupo, gana la primera:
 *    a. correo igual a uno del alumno → alta;
 *    b. lo aprendido → alta con ≥ 2 confirmaciones y sin rechazos, si no
 *       media (un alias que apunta a alguien de otro grupo se ignora);
 *    c. nombre: tokens ⊆ tokens del alumno (≥ 2, o 1 único en el grupo), o
 *       parecido Jaro-Winkler ≥ 0.88 → una candidata = media, varias = baja
 *       (sin asignar), ninguna = sin identificar.
 *    d. Dos personas de Zoom del mismo alumno (dos dispositivos) → se unen.
 * 5. Presente si minutos ≥ max(piso, pct × duración); "tarde" solo si la
 *    organización lo enciende; si no, ausente con los minutos; quien no
 *    apareció, ausente "no apareció en Zoom".
 */

export type SegmentoZoom = {
  participantId: string;
  participantUserId: string | null;
  registrantId: string | null;
  name: string;
  email: string | null;
  joinTime: Date;
  leaveTime: Date;
  breakout: boolean;
  waitingRoom: boolean;
};

export type AlumnoDelGrupo = {
  enrollmentId: string;
  contactId: string;
  /** Nombre completo como lo tiene el CRM. */
  nombre: string;
  /** Correo principal y secundario (los que haya). */
  correos: string[];
};

export type TipoDeLlave = "correo" | "usuario_zoom" | "registrante" | "nombre";

export type AliasAprendido = {
  keyKind: TipoDeLlave;
  key: string;
  contactId: string | null;
  ignorar: boolean;
  confirmations: number;
  rejections: number;
  rejectedContactIds: string[];
};

export type Exclusiones = {
  /** Correo del aula, del profesor (y suplente) y del equipo. */
  correos: string[];
  /** Usuario de Zoom del aula (el anfitrión). */
  zoomUserIds: string[];
};

export type Umbrales = {
  /** % de la clase conectado para "presente". */
  minPct: number;
  /** Piso en minutos (gana el mayor). */
  minMinutes: number;
  /** Minutos tarde desde el inicio para sugerir "tarde"; null = nunca. */
  lateMinutes: number | null;
};

/** Decisión del dueño (2026-10-27): 50 % con piso de 20 minutos, sin "tarde". */
export const UMBRALES_DE_FABRICA: Umbrales = { minPct: 50, minMinutes: 20, lateMinutes: null };

export type Ventana = { inicio: Date; fin: Date };

export type Confianza = "alta" | "media" | "baja";
export type Coincidencia = "correo" | "aprendido" | "nombre";
export type EstadoSugerido = "presente" | "tarde" | "ausente";

export type PersonaZoom = {
  /** `usuario_zoom:…`, `registrante:…`, `correo:…`, `nombre:…` o `anonimo:…`. */
  key: string;
  nombres: string[];
  email: string | null;
  participantUserId: string | null;
  registrantId: string | null;
  segmentos: SegmentoZoom[];
};

export type SugerenciaDeAlumno = {
  enrollmentId: string;
  contactId: string;
  nombre: string;
  sugerido: EstadoSugerido;
  minutos: number;
  primeraEntrada: Date | null;
  /** null = no se lo vio en Zoom. */
  confianza: "alta" | "media" | null;
  coincidencia: Coincidencia | null;
  /** Llaves de las personas de Zoom unidas a este alumno. */
  personas: string[];
  nombresZoom: string[];
  motivo: "conectado" | "poco_tiempo" | "no_aparecio";
  /** Personas de confianza BAJA que podrían ser este alumno. */
  posibles: string[];
};

export type PersonaSinIdentificar = {
  key: string;
  nombres: string[];
  email: string | null;
  minutos: number;
  primeraEntrada: Date | null;
  /** "baja" si hay varias candidatas en el grupo; null si ninguna. */
  confianza: "baja" | null;
  candidatos: { enrollmentId: string; contactId: string; nombre: string }[];
};

export type PersonaExcluida = {
  key: string;
  nombres: string[];
  minutos: number;
  motivo: "equipo" | "ignorado";
};

export type Sugerencia = {
  alumnos: SugerenciaDeAlumno[];
  sinIdentificar: PersonaSinIdentificar[];
  excluidas: PersonaExcluida[];
  /** Minutos que hacen falta para "presente" en esta clase. */
  umbralMinutos: number;
  duracionMinutos: number;
};

/* ============================================================
 * Nombres
 * ============================================================ */

const TITULOS = new Set([
  "arq", "ing", "lic", "dr", "dra", "prof", "profe", "sr", "sra", "srta", "mg", "mtr", "cr", "cra", "tec",
]);

/** Palabras de dispositivo que, solas, no dicen quién es. */
const DISPOSITIVOS = new Set([
  "iphone", "ipad", "galaxy", "android", "samsung", "celular", "cel", "movil", "telefono",
  "pc", "notebook", "laptop", "macbook", "mac", "tablet", "huawei", "motorola", "xiaomi", "redmi",
]);

/**
 * Minúsculas, sin tildes, sin emojis ni dígitos, sin lo que va entre
 * paréntesis, sin títulos ("Arq.", "Ing.") y sin el dispositivo ("iPhone de
 * Juan", "Juan's iPhone"). Puede quedar vacío ("iPad").
 */
export function normalizarNombre(nombre: string): string {
  let s = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/'s\b/g, " ")
    .replace(/[^a-zñ\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const tokens = s
    .split(" ")
    .filter(Boolean)
    // "iphone de juan": se va el dispositivo y el "de" que lo une.
    .filter((t, i, arr) => !(t === "de" && i > 0 && DISPOSITIVOS.has(arr[i - 1]!)))
    .filter((t) => !DISPOSITIVOS.has(t) && !TITULOS.has(t));
  return tokens.join(" ").replace(/ñ/g, "n");
}

const tokensDe = (nombreNormalizado: string) =>
  nombreNormalizado.split(" ").filter((t) => t.length >= 2);

/** Jaro-Winkler clásico (prefijo hasta 4, p = 0.1). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const rango = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const ma = new Array<boolean>(a.length).fill(false);
  const mb = new Array<boolean>(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const desde = Math.max(0, i - rango);
    const hasta = Math.min(i + rango + 1, b.length);
    for (let j = desde; j < hasta; j++) {
      if (mb[j] || a[i] !== b[j]) continue;
      ma[i] = mb[j] = true;
      m++;
      break;
    }
  }
  if (m === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let prefijo = 0;
  while (prefijo < 4 && a[prefijo] && a[prefijo] === b[prefijo]) prefijo++;
  return jaro + prefijo * 0.1 * (1 - jaro);
}

/* ============================================================
 * Personas y minutos
 * ============================================================ */

/** La llave de agrupación de un tramo (la más fuerte que traiga). */
function llaveDeTramo(s: SegmentoZoom): string {
  if (s.participantUserId) return `usuario_zoom:${s.participantUserId}`;
  if (s.registrantId) return `registrante:${s.registrantId}`;
  const correo = s.email?.trim().toLowerCase();
  if (correo) return `correo:${correo}`;
  const nombre = normalizarNombre(s.name);
  if (nombre) return `nombre:${nombre}`;
  return `anonimo:${s.participantId}`;
}

export function agruparPersonas(segmentos: SegmentoZoom[]): PersonaZoom[] {
  const porLlave = new Map<string, PersonaZoom>();
  for (const s of segmentos) {
    const key = llaveDeTramo(s);
    let p = porLlave.get(key);
    if (!p) {
      p = { key, nombres: [], email: null, participantUserId: null, registrantId: null, segmentos: [] };
      porLlave.set(key, p);
    }
    p.segmentos.push(s);
    if (!p.nombres.includes(s.name)) p.nombres.push(s.name);
    p.email ??= s.email?.trim().toLowerCase() || null;
    p.participantUserId ??= s.participantUserId;
    p.registrantId ??= s.registrantId;
  }
  return [...porLlave.values()];
}

/** Todas las llaves que la persona trae: lo que se aprende al confirmar. */
export function llavesDePersona(p: PersonaZoom): { keyKind: TipoDeLlave; key: string }[] {
  const out: { keyKind: TipoDeLlave; key: string }[] = [];
  if (p.participantUserId) out.push({ keyKind: "usuario_zoom", key: p.participantUserId });
  if (p.registrantId) out.push({ keyKind: "registrante", key: p.registrantId });
  if (p.email) out.push({ keyKind: "correo", key: p.email });
  const nombres = [...new Set(p.nombres.map(normalizarNombre).filter(Boolean))].sort();
  for (const n of nombres) out.push({ keyKind: "nombre", key: n });
  return out;
}

const MARGEN_MS = 15 * 60_000;

/** Minutos conectado (unión de tramos dentro de la ventana ± 15 min). */
export function minutosConectado(
  segmentos: SegmentoZoom[],
  ventana: Ventana
): { minutos: number; primeraEntrada: Date | null } {
  const desde = ventana.inicio.getTime() - MARGEN_MS;
  const hasta = ventana.fin.getTime() + MARGEN_MS;
  const tramos = segmentos
    .filter((s) => !s.waitingRoom)
    .map((s) => [Math.max(desde, s.joinTime.getTime()), Math.min(hasta, s.leaveTime.getTime())] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let actual: [number, number] | null = null;
  for (const [a, b] of tramos) {
    if (actual && a <= actual[1]) actual[1] = Math.max(actual[1], b);
    else {
      if (actual) total += actual[1] - actual[0];
      actual = [a, b];
    }
  }
  if (actual) total += actual[1] - actual[0];
  return {
    minutos: Math.floor(total / 60_000),
    primeraEntrada: tramos[0] ? new Date(tramos[0][0]) : null,
  };
}

export function umbralPresente(duracionMin: number, u: Umbrales): number {
  return Math.max(u.minMinutes, Math.ceil((u.minPct / 100) * duracionMin));
}

/* ============================================================
 * Coincidencias
 * ============================================================ */

type Vinculo = { contactId: string; confianza: "alta" | "media"; coincidencia: Coincidencia };

const LLAVES_FUERTES: TipoDeLlave[] = ["usuario_zoom", "registrante", "correo", "nombre"];

function aliasesDe(p: PersonaZoom, indice: Map<string, AliasAprendido>): AliasAprendido[] {
  const llaves = llavesDePersona(p);
  const out: AliasAprendido[] = [];
  for (const tipo of LLAVES_FUERTES) {
    for (const l of llaves.filter((x) => x.keyKind === tipo)) {
      const a = indice.get(`${l.keyKind}:${l.key}`);
      if (a) out.push(a);
    }
  }
  return out;
}

const UMBRAL_PARECIDO = 0.88;
const PISO_POR_TOKEN = 0.85;

/** Candidatas del grupo por nombre: primero inclusión de tokens, después parecido. */
function candidatasPorNombre(
  p: PersonaZoom,
  alumnos: { alumno: AlumnoDelGrupo; tokens: string[] }[],
  rechazados: Set<string>
): AlumnoDelGrupo[] {
  const posibles = alumnos.filter((a) => !rechazados.has(a.alumno.contactId));
  const porInclusion = new Set<AlumnoDelGrupo>();
  const porParecido = new Set<AlumnoDelGrupo>();
  for (const nombre of p.nombres) {
    const tp = tokensDe(normalizarNombre(nombre));
    if (tp.length === 0) continue;
    for (const a of posibles) {
      const incluido = tp.every((t) => a.tokens.includes(t));
      // Un token suelto ("María") que tienen dos del grupo da dos candidatas:
      // eso es confianza baja y no se asigna.
      if (incluido) {
        porInclusion.add(a.alumno);
        continue;
      }
      if (tp.length >= 2) {
        const mejores = tp.map((t) => Math.max(0, ...a.tokens.map((s) => jaroWinkler(t, s))));
        const promedio = mejores.reduce((x, y) => x + y, 0) / mejores.length;
        if (mejores.every((v) => v >= PISO_POR_TOKEN) && promedio >= UMBRAL_PARECIDO) {
          porParecido.add(a.alumno);
        }
      }
    }
  }
  return [...(porInclusion.size > 0 ? porInclusion : porParecido)];
}

/* ============================================================
 * Sugerencia
 * ============================================================ */

export function armarSugerencia(input: {
  segmentos: SegmentoZoom[];
  ventana: Ventana;
  alumnos: AlumnoDelGrupo[];
  aliases: AliasAprendido[];
  exclusiones: Exclusiones;
  umbrales: Umbrales;
}): Sugerencia {
  const { ventana, umbrales } = input;
  const duracionMinutos = Math.max(
    0,
    Math.round((ventana.fin.getTime() - ventana.inicio.getTime()) / 60_000)
  );
  const umbralMinutos = umbralPresente(duracionMinutos, umbrales);

  const indice = new Map(input.aliases.map((a) => [`${a.keyKind}:${a.key}`, a]));
  const correosExcluidos = new Set(input.exclusiones.correos.map((c) => c.trim().toLowerCase()));
  const zoomExcluidos = new Set(input.exclusiones.zoomUserIds);

  const porContacto = new Map<string, AlumnoDelGrupo>();
  for (const a of input.alumnos) if (!porContacto.has(a.contactId)) porContacto.set(a.contactId, a);
  const porCorreo = new Map<string, AlumnoDelGrupo>();
  for (const a of input.alumnos)
    for (const c of a.correos) porCorreo.set(c.trim().toLowerCase(), a);
  const conTokens = input.alumnos.map((alumno) => ({
    alumno,
    tokens: tokensDe(normalizarNombre(alumno.nombre)),
  }));

  const vinculos = new Map<string, { persona: PersonaZoom; vinculo: Vinculo }[]>();
  const sinIdentificar: PersonaSinIdentificar[] = [];
  const excluidas: PersonaExcluida[] = [];
  const posibles = new Map<string, string[]>();

  for (const p of agruparPersonas(input.segmentos)) {
    const { minutos, primeraEntrada } = minutosConectado(p.segmentos, ventana);
    const propios = aliasesDe(p, indice);

    // 1. Exclusiones.
    const esEquipo =
      (p.email !== null && correosExcluidos.has(p.email)) ||
      (p.participantUserId !== null && zoomExcluidos.has(p.participantUserId));
    if (esEquipo || propios.some((a) => a.ignorar)) {
      excluidas.push({ key: p.key, nombres: p.nombres, minutos, motivo: esEquipo ? "equipo" : "ignorado" });
      continue;
    }

    // 4a. Correo del alumno.
    let vinculo: Vinculo | null = null;
    const delCorreo = p.email ? porCorreo.get(p.email) : undefined;
    if (delCorreo) vinculo = { contactId: delCorreo.contactId, confianza: "alta", coincidencia: "correo" };

    // 4b. Lo aprendido, solo si apunta a alguien de ESTE grupo.
    if (!vinculo) {
      const aprendido = propios.find((a) => a.contactId && porContacto.has(a.contactId));
      if (aprendido?.contactId) {
        vinculo = {
          contactId: aprendido.contactId,
          confianza: aprendido.confirmations >= 2 && aprendido.rejections === 0 ? "alta" : "media",
          coincidencia: "aprendido",
        };
      }
    }

    // 4c. El nombre, sin las personas que alguien ya dijo que no son.
    if (!vinculo) {
      const rechazados = new Set(propios.flatMap((a) => a.rejectedContactIds));
      const candidatas = candidatasPorNombre(p, conTokens, rechazados);
      if (candidatas.length === 1) {
        vinculo = { contactId: candidatas[0]!.contactId, confianza: "media", coincidencia: "nombre" };
      } else {
        sinIdentificar.push({
          key: p.key,
          nombres: p.nombres,
          email: p.email,
          minutos,
          primeraEntrada,
          confianza: candidatas.length > 1 ? "baja" : null,
          candidatos: candidatas.map((c) => ({ enrollmentId: c.enrollmentId, contactId: c.contactId, nombre: c.nombre })),
        });
        for (const c of candidatas) posibles.set(c.contactId, [...(posibles.get(c.contactId) ?? []), p.key]);
        continue;
      }
    }

    const lista = vinculos.get(vinculo.contactId) ?? [];
    lista.push({ persona: p, vinculo });
    vinculos.set(vinculo.contactId, lista);
  }

  // 4d + 5. Por alumno: se unen sus personas y se decide.
  const alumnos: SugerenciaDeAlumno[] = input.alumnos.map((a) => {
    const suyos = vinculos.get(a.contactId) ?? [];
    const base = {
      enrollmentId: a.enrollmentId,
      contactId: a.contactId,
      nombre: a.nombre,
      posibles: posibles.get(a.contactId) ?? [],
    };
    if (suyos.length === 0 || porContacto.get(a.contactId) !== a) {
      return {
        ...base,
        sugerido: "ausente" as const,
        minutos: 0,
        primeraEntrada: null,
        confianza: null,
        coincidencia: null,
        personas: [],
        nombresZoom: [],
        motivo: "no_aparecio" as const,
      };
    }
    const { minutos, primeraEntrada } = minutosConectado(
      suyos.flatMap((s) => s.persona.segmentos),
      ventana
    );
    const confianza = suyos.some((s) => s.vinculo.confianza === "media") ? "media" : "alta";
    const coincidencia = suyos.find((s) => s.vinculo.confianza === confianza)!.vinculo.coincidencia;
    let sugerido: EstadoSugerido = "ausente";
    if (minutos >= umbralMinutos) {
      const tarde =
        umbrales.lateMinutes !== null &&
        primeraEntrada !== null &&
        primeraEntrada.getTime() >= ventana.inicio.getTime() + umbrales.lateMinutes * 60_000;
      sugerido = tarde ? "tarde" : "presente";
    }
    return {
      ...base,
      sugerido,
      minutos,
      primeraEntrada,
      confianza,
      coincidencia,
      personas: suyos.map((s) => s.persona.key),
      nombresZoom: suyos.flatMap((s) => s.persona.nombres),
      motivo: sugerido === "ausente" ? ("poco_tiempo" as const) : ("conectado" as const),
    };
  });

  return { alumnos, sinIdentificar, excluidas, umbralMinutos, duracionMinutos };
}

/* ============================================================
 * Aprendizaje
 * ============================================================ */

export type OperacionDeAlias = {
  keyKind: TipoDeLlave;
  key: string;
  /** Último nombre visible con el que apareció. */
  label: string;
  contactId: string | null;
  ignorar: boolean;
  confirmations: number;
  rejections: number;
  rejectedContactIds: string[];
};

/**
 * Una asignación HECHA A MANO (elegir a la persona de una lista, o corregir
 * una sugerencia) vale por dos confirmaciones: alguien miró y eligió. Así la
 * próxima clase ya la sugiere con confianza alta. Confirmar algo que el
 * sistema propuso suma una.
 */
const PESO_DE_ASIGNACION_A_MANO = 2;

/**
 * Qué aprender al confirmar. Pura: recibe lo que había (`existentes`) y
 * devuelve el estado FINAL de cada alias que cambia.
 *
 * - `sugeridas`: persona → contacto que proponía la sugerencia.
 * - `finales`: persona → contacto que quedó (null = "no es esta persona").
 *   Una persona que no figura no se tocó y no aprende nada.
 * - `asignadasAMano`: personas que alguien eligió de una lista.
 * - `ignorar`: "Es del equipo o un dispositivo".
 */
export function planDeAprendizaje(input: {
  personas: PersonaZoom[];
  sugeridas: Record<string, string>;
  finales: Record<string, string | null>;
  asignadasAMano: string[];
  ignorar: string[];
  existentes: AliasAprendido[];
}): OperacionDeAlias[] {
  const existentes = new Map(input.existentes.map((a) => [`${a.keyKind}:${a.key}`, a]));
  const ops = new Map<string, OperacionDeAlias>();
  const aMano = new Set(input.asignadasAMano);
  const ignorar = new Set(input.ignorar);

  for (const p of input.personas) {
    const llaves = llavesDePersona(p);
    if (llaves.length === 0) continue;
    const label = p.nombres[0] ?? "";
    const sugerida = input.sugeridas[p.key] ?? null;

    for (const l of llaves) {
      const id = `${l.keyKind}:${l.key}`;
      const previo = existentes.get(id);
      const rechazadosPrevios = previo?.rejectedContactIds ?? [];

      if (ignorar.has(p.key)) {
        ops.set(id, {
          ...l,
          label,
          contactId: null,
          ignorar: true,
          confirmations: previo?.ignorar ? previo.confirmations + 1 : 1,
          rejections: 0,
          rejectedContactIds: rechazadosPrevios,
        });
        continue;
      }
      if (!(p.key in input.finales)) continue;
      const final = input.finales[p.key] ?? null;

      if (final === null) {
        // "No es esta persona": deja de apuntar y recuerda a quién NO es.
        const a = sugerida ?? previo?.contactId ?? null;
        if (!a && !previo) continue;
        ops.set(id, {
          ...l,
          label,
          contactId: null,
          ignorar: false,
          confirmations: 0,
          rejections: (previo?.rejections ?? 0) + 1,
          rejectedContactIds: a ? unir(rechazadosPrevios, [a]) : rechazadosPrevios,
        });
        continue;
      }

      const corregida = sugerida !== null && sugerida !== final;
      const mismoDestino = previo && !previo.ignorar && previo.contactId === final;
      const peso = aMano.has(p.key) ? PESO_DE_ASIGNACION_A_MANO : 1;
      ops.set(id, {
        ...l,
        label,
        contactId: final,
        ignorar: false,
        confirmations: mismoDestino ? previo.confirmations + peso : peso,
        rejections: mismoDestino ? previo.rejections : 0,
        rejectedContactIds: (corregida ? unir(rechazadosPrevios, [sugerida]) : rechazadosPrevios).filter(
          (c) => c !== final
        ),
      });
    }
  }
  return [...ops.values()];
}

function unir(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
