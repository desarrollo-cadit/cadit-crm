import type { Capability } from "@/lib/capabilities";
import { DESTINOS_MENU } from "@/lib/nav";

/**
 * 027 — El registro de la guía del staff: **el compilador es quien la
 * mantiene**.
 *
 * `Capability` es la unión cerrada `(typeof CAPABILITIES)[number]`, y un
 * `Record` sobre una unión cerrada es exhaustivo por tipo: TypeScript exige
 * una entrada por cada miembro. Consecuencia directa, y razón de ser de la
 * fase:
 *
 * > **El día que alguien agregue una capacidad 18 a `CAPABILITIES` y no la
 * > describa acá, `pnpm typecheck` falla y `pnpm build` no sale.**
 *
 * No es disciplina, ni una convención, ni un `TODO` que alguien tiene que
 * recordar: es el compilador. La guía no se puede desactualizar respecto de la
 * lista de capacidades porque el código **no compila** desactualizado.
 *
 * Por eso el tipo se escribe así y no de otra forma: ni `Partial`, ni un
 * índice `[k: string]`, ni un `as` que lo relaje. Cualquiera de las tres
 * destruye la única garantía de la fase y la deja igual que un documento
 * escrito a mano.
 *
 * Lo que el compilador NO puede verificar —que el `donde` apunte a una ruta
 * que existe, y que ninguna descripción esté vacía— lo verifica
 * `tests/unit/guia.test.ts`. Entre los dos no queda margen.
 */
export type EntradaGuia = {
  /**
   * Qué se puede hacer, en el idioma de quien lee (FR-002).
   *
   * `certificados.emitir` se lee "emitir el certificado de un alumno que
   * aprobó", nunca "certificados.emitir": repetir la llave técnica es no
   * haber escrito nada.
   */
  que: string;
  /**
   * Dónde está. Dos formas, y la diferencia es deliberada (DV-003):
   *
   * - una RUTA (`/inbox`) cuando el destino está en el menú;
   * - una PROSA con flechas ("Académico → la cohorte → Evaluación") cuando el
   *   destino existe pero se llega desde otra pantalla. Justamente eso es lo
   *   que nadie encuentra; si la guía sólo repitiera el menú no agregaría
   *   nada.
   *
   * En la prosa el PRIMER tramo es un rótulo del menú, y de ahí sale la ruta
   * real: así el test puede comprobar que el camino arranca en algo que
   * existe.
   */
  donde: string;
};

/**
 * DV-004 — **Una sola fuente para el texto de cada capacidad.**
 *
 * Dos textos para la misma capacidad es exactamente el desfasaje que esta fase
 * existe para impedir. Hoy `src/components/settings/roles-client.tsx` mantiene
 * su propio `CAPABILITY_LABELS` (rótulos cortos, de cuando repartir permisos
 * era la única pantalla que los nombraba).
 *
 * PENDIENTE (fuera del alcance de la 027, a propósito: tocar la pantalla de
 * roles en este ciclo mezclaría dos cambios): que `/settings/roles` consuma
 * `GUIA_CAPACIDADES[c].que` en vez de su copia. Cuando eso pase, el `que` de
 * acá pasa a ser el único texto de cada capacidad en todo el producto.
 */
export const GUIA_CAPACIDADES: Record<Capability, EntradaGuia> = {
  // ── Académico ──────────────────────────────────────────────────────────
  "academico.ver": {
    que: "ver los cursos, las cohortes en marcha y el cronograma de clases",
    donde: "/academico",
  },
  "academico.editar": {
    que: "crear un curso o una cohorte, cambiarle las fechas y generar su cronograma de clases",
    donde: "/academico",
  },
  "asistencia.ver": {
    que: "ver quién vino a cada clase y cuánta asistencia lleva acumulada cada alumno",
    donde: "Académico → la cohorte → Asistencia",
  },
  "asistencia.editar": {
    que: "pasar lista de una clase, y corregir una lista que ya se había tomado",
    donde: "Académico → la cohorte → Asistencia",
  },
  "evaluacion.ver": {
    que: "ver las notas de cada alumno y si le alcanzan para aprobar",
    donde: "Académico → la cohorte → Evaluación",
  },
  "evaluacion.editar": {
    que: "crear las evaluaciones de una cohorte, copiarlas de otra cohorte y cargar las notas",
    donde: "Académico → la cohorte → Evaluación",
  },
  "certificados.emitir": {
    que: "emitir el certificado de un alumno que aprobó, imprimirlo y anularlo si se emitió por error",
    donde: "Académico → la cohorte → Evaluación",
  },

  // ── Comercial y financiero ─────────────────────────────────────────────
  "contactos.ver": {
    que: "buscar a un alumno y abrir su legajo: sus datos, sus cursadas y cómo viene",
    donde: "/contacts",
  },
  "contactos.editar": {
    que: "dar de alta a una persona, corregir sus datos de contacto y darla de baja",
    donde: "/contacts",
  },
  "inscripciones.ver": {
    que: "seguir a los interesados por el embudo, desde la primera consulta hasta que se anotan",
    donde: "/pipeline",
  },
  "inscripciones.editar": {
    que: "anotar a alguien en una cohorte, moverlo de etapa y acordar el precio de su cursada",
    donde: "/pipeline",
  },
  /**
   * 026 — El `donde` se movió de "Alumnos → el alumno → Estado de cuenta" a
   * la pantalla de Finanzas, que es el destino que el MENÚ declara para esta
   * capacidad desde que existe el cierre de período.
   *
   * Es lo único que la 026 tuvo que tocar de la guía, y es un texto: la
   * estructura no cambió. La derivación de la 027 (`CAPABILITIES` +
   * `NAV_GROUPS`) hizo el resto sola — el rol `administracion` aparece en la
   * guía sin una línea de trabajo extra.
   *
   * El estado de cuenta del legajo sigue gobernado por esta misma capacidad y
   * se sigue llegando por Alumnos; el `qué` lo dice, que es donde vive la
   * explicación. El `dónde` apunta a un solo lugar porque una indicación con
   * dos destinos no indica nada.
   */
  "cobranza.ver": {
    que: "ver el estado de cuenta de un alumno: sus cuotas, lo que pagó y lo que debe",
    donde: "Alumnos → el alumno → Estado de cuenta",
  },
  "cobranza.editar": {
    que: "armar el plan de cuotas de una cursada, registrar un pago y anular uno mal cargado",
    donde: "Alumnos → el alumno → Estado de cuenta",
  },

  // ── Conversaciones ─────────────────────────────────────────────────────
  "inbox.ver": {
    que: "leer las conversaciones de WhatsApp con alumnos e interesados",
    donde: "/inbox",
  },
  "inbox.responder": {
    que: "contestar un mensaje de WhatsApp, mandar un archivo y pasar la conversación a una persona",
    donde: "/inbox",
  },

  // ── Plataforma ─────────────────────────────────────────────────────────
  "configuracion.editar": {
    que: "conectar WhatsApp, cambiar la marca de la instancia, las plantillas y los formularios de captación",
    donde: "/settings",
  },
  "accesos.gestionar": {
    que: "dar de alta una cuenta del equipo, y darle acceso al portal a un alumno o a un profesor",
    donde: "Ajustes → Equipo",
  },
};

/**
 * FR-006 — Los grupos son los de `CAPABILITIES`: Académico, Comercial y
 * financiero, Conversaciones, Plataforma. La misma división que ya usa
 * `/settings/roles`, para que quien reparte permisos y quien lee la guía estén
 * mirando el mismo mapa.
 *
 * Se resuelve por prefijo y no con un segundo `Record` exhaustivo: dos
 * registros que hay que mantener sincronizados son dos cosas que se pueden
 * desincronizar. El agujero del prefijo —una capacidad nueva con una familia
 * nueva que no cae en ningún grupo— lo tapa el test, que exige que cada
 * capacidad caiga en exactamente un grupo.
 */
export const GRUPOS_CAPACIDADES: readonly {
  titulo: string;
  incluye: (c: Capability) => boolean;
}[] = [
  {
    titulo: "Académico",
    incluye: (c) => /^(academico|asistencia|evaluacion|certificados)\./.test(c),
  },
  {
    titulo: "Comercial y financiero",
    incluye: (c) => /^(contactos|inscripciones|cobranza)\./.test(c),
  },
  { titulo: "Conversaciones", incluye: (c) => c.startsWith("inbox.") },
  { titulo: "Plataforma", incluye: (c) => /^(configuracion|accesos)\./.test(c) },
];

/**
 * Agrupa preservando el orden recibido, y **descarta los grupos vacíos**: un
 * encabezado con nada debajo parece un error de carga, igual que en el menú.
 */
export function agruparCapacidades(
  capacidades: readonly Capability[]
): { titulo: string; capacidades: Capability[] }[] {
  return GRUPOS_CAPACIDADES.map((g) => ({
    titulo: g.titulo,
    capacidades: capacidades.filter((c) => g.incluye(c)),
  })).filter((g) => g.capacidades.length > 0);
}

/**
 * La ruta real detrás de un `donde`, sea ruta o prosa.
 *
 * Devuelve `null` cuando la prosa arranca con un rótulo que el menú no tiene:
 * eso significa que alguien renombró un ítem —o inventó un camino— y el test
 * lo dice con nombre y apellido. Una guía que manda a una pantalla que no se
 * llama así es peor que no tener guía, porque se la cree.
 */
export function rutaDeDonde(donde: string): string | null {
  const texto = donde.trim();
  if (texto.startsWith("/")) return texto;
  const primero = texto.split("→")[0]!.trim();
  return DESTINOS_MENU.find((d) => d.label === primero)?.href ?? null;
}

/**
 * Cómo se muestra un `donde` en pantalla.
 *
 * Una ruta cruda (`/inbox`) no es una indicación: nadie navega escribiendo
 * URLs. Cuando el destino está en el menú se muestra el camino tal como se ve
 * en la barra —"CRM → Bandeja"—, DERIVADO de `NAV_GROUPS` (FR-004): si mañana
 * el ítem cambia de grupo o de rótulo, la guía lo dice sin que nadie la toque.
 */
export function caminoVisible(donde: string): string {
  const texto = donde.trim();
  if (!texto.startsWith("/")) return texto;
  const destino = DESTINOS_MENU.find((d) => d.href === texto);
  if (!destino) return texto;
  return destino.grupo ? `${destino.grupo} → ${destino.label}` : destino.label;
}
