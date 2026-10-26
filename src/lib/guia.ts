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
    que: "ver los cursos, los grupos en marcha, el cronograma de clases y quién tiene cada licencia",
    donde: "/academico",
  },
  "academico.editar": {
    que: "crear un curso o un grupo, cambiarle las fechas y generar su cronograma de clases; fijar a mano hasta cuándo un alumno ve las grabaciones y el material de un grupo (vencen solos un mes después del fin), y dar un curso offline a una persona o a toda una empresa con fecha de vencimiento (desde el curso offline o desde la empresa en /empresas)",
    donde: "/academico",
  },
  "asistencia.ver": {
    que: "ver quién vino a cada clase y cuánta asistencia lleva acumulada cada alumno",
    donde: "Académico → el grupo → Asistencia",
  },
  "asistencia.editar": {
    que: "pasar lista de una clase, y corregir una lista que ya se había tomado",
    donde: "Académico → el grupo → Asistencia",
  },
  "evaluacion.ver": {
    que: "ver las notas de cada alumno y si le alcanzan para aprobar",
    donde: "Académico → el grupo → Evaluación",
  },
  "evaluacion.editar": {
    que: "crear las evaluaciones de un grupo, copiarlas de otro grupo y cargar las notas",
    donde: "Académico → el grupo → Evaluación",
  },
  "correcciones.aprobar": {
    que: "revisar las correcciones que mandan los profesores y publicarlas o devolverlas con un comentario",
    donde: "/correcciones",
  },
  "licencias.gestionar": {
    que: "asignarle o quitarle una licencia de software a un alumno o a todo un grupo, cambiar el correo al que va la licencia y desasignarla desde Licencias. Por defecto la tienen Soporte y Dirección; sin ella las licencias se ven pero no se cambian",
    donde: "Académico → el grupo → Alumnos",
  },
  "cohortes.confirmar": {
    que: "confirmar que un grupo sale (o quitarle la confirmación): al confirmarlo le llega a Soporte la lista de alumnos con sus licencias, y a Administración los que todavía no tienen factura, 7 y 2 días antes del inicio",
    donde: "Académico → el grupo",
  },
  "certificados.emitir": {
    que: "emitir el certificado de un alumno que aprobó, imprimirlo y anularlo si se emitió por error",
    donde: "Académico → el grupo → Evaluación",
  },

  // ── Comercial y financiero ─────────────────────────────────────────────
  "contactos.ver": {
    que: "buscar a un alumno y abrir su legajo: sus datos, sus cursadas y cómo viene",
    donde: "/contacts",
  },
  "contactos.editar": {
    que: "dar de alta a una persona, corregir sus datos de contacto (incluida su empresa) y darla de baja",
    donde: "/contacts",
  },
  "contactos.unificar": {
    que: "unificar dos contactos que son la misma persona: todo lo del duplicado (inscripciones, conversaciones, portal, seguimiento) pasa al que queda y el duplicado se borra. No se puede deshacer, por eso siempre muestra antes qué va a pasar. Por defecto la tienen Dirección, Coordinación y Soporte",
    donde: "Contactos → el alumno → Unificar con…",
  },
  "inscripciones.ver": {
    que: "mirar el embudo de interesados y quiénes están anotados en cada grupo, sin cambiar nada",
    donde: "/pipeline",
  },
  /**
   * 040 (DV-001) — Lo que hasta 040 se hacía con `inscripciones.ver`: el texto
   * de esa capacidad pasó a decir "sin cambiar nada" porque ahora es cierto.
   */
  "inscripciones.seguimiento": {
    que: "mover a un interesado de etapa en el embudo, tildar el checklist de cada alumno y mandarle los términos o la bienvenida, de a uno o a todo el grupo",
    donde: "Académico → el grupo → Alumnos",
  },
  "inscripciones.editar": {
    que: "anotar a alguien en un grupo, moverlo de etapa, acordar el precio de su cursada e indicar quién la vendió; también cargar y archivar vendedores en Ajustes → Vendedores",
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
    que: "ver el cierre de un período —lo que se cobró y lo que se devengó, con su moneda—, las ventas de cada vendedor y el estado de cuenta de cada alumno",
    donde: "/finanzas",
  },
  "cobranza.editar": {
    que: "armar el plan de cuotas de una cursada, registrar un pago (le llega un aviso por correo a Administración) y anular uno mal cargado",
    donde: "Contactos → el alumno → Estado de cuenta",
  },
  /** 040 (DV-003) — Ventas y Administración cargan los datos de facturación. */
  "empresas.editar": {
    que: "dar de alta una empresa y completar sus datos de facturación: razón social, RUT, dirección fiscal, a quién se le manda la factura y si paga contado o a crédito",
    donde: "/empresas",
  },
  /**
   * 042 — Lo que Administración no podía hacer con `cobranza.ver`: anotar el
   * número de la factura que emitió, sin poder tocar ningún monto.
   */
  "facturacion.editar": {
    que: "anotar el número de factura de una venta y el número de recibo de un pago, y corregirlos; no permite cambiar montos, cuotas ni pagos",
    donde: "Facturación → la venta → Registrar factura",
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
    que: "conectar WhatsApp, conectar las cuentas de Zoom y vincular cada aula a su usuario de Zoom (Ajustes → Zoom), cambiar la marca de la instancia, las plantillas y los formularios de captación, y crear, renombrar o borrar los roles del equipo con lo que puede hacer cada uno",
    donde: "/settings",
  },
  "accesos.gestionar": {
    que: "dar de alta una cuenta del equipo, y darle acceso al portal a un alumno o a un profesor",
    donde: "Ajustes → Equipo",
  },
  "alumnos.auditoria": {
    que: "ver cuándo y desde qué dispositivo entró un alumno al portal, cómo avanza en los cursos offline y sus últimas interacciones con la academia",
    donde: "Contactos → el alumno → Administración",
  },
  // ── Agente de IA ───────────────────────────────────────────────────────
  "areas.configurar": {
    que: "decidir a qué casilla y con qué copias manda el asistente de WhatsApp las consultas de Ventas y Soporte, qué le contesta al cliente y en qué horario, encender o apagar esa derivación, y a qué casilla llegan los avisos internos de Administración (cada inscripción nueva para facturar, cada pago registrado, la morosidad de la semana los lunes y la facturación pendiente antes del inicio de cada grupo), y a quién le llega el aviso de cada nuevo interesado que deja sus datos en un formulario de la web o se anota a un taller (con vendedores en copia si querés)",
    donde: "/settings/areas",
  },
  // ── Grabaciones de Zoom (030) ──────────────────────────────────────────
  "grabaciones.ver": {
    que: "ver las grabaciones de Zoom de todas las aulas y copiar sus enlaces",
    donde: "/grabaciones",
  },
  "grabaciones.gestionar": {
    que: "sincronizar las grabaciones con Zoom y adjudicarlas a las clases",
    donde: "/grabaciones",
  },
  // 045 — Campañas de marketing por correo.
  "marketing.ver": {
    que: "ver las audiencias, las campañas, a quién se le enviaron y cómo les fue (enviados, bajas y clics). Muestra nombre y correo de muchas personas a la vez: por defecto la tienen Dirección, Coordinación y Ventas",
    donde: "/marketing",
  },
  "marketing.enviar": {
    que: "armar audiencias, redactar campañas, mandarte una prueba y enviarlas (hasta 500 personas, de a una) o cancelarlas. No hace falta aprobación de nadie: por defecto la tienen Dirección, Coordinación y Ventas",
    donde: "/marketing",
  },
  "marketing.configurar": {
    que: "elegir el buzón de marketing, el remitente y el pie de los correos y probar el buzón; también reactivar los correos de alguien que se dio de baja, que deshace una oposición expresa de esa persona (Ley 18.331). Por defecto solo la tiene Dirección",
    donde: "/settings/marketing",
  },
  // 046 US6 — Importar el historial de cursadas.
  "historial.importar": {
    que: "importar la planilla histórica de cursadas (2020–2024): asociar cursos y vendedores, ver la vista previa, aplicarla y deshacerla. Crea y completa contactos en bloque (nunca pisa un dato): por defecto solo la tiene Dirección",
    donde: "/settings/historial",
  },
  // 046 US8 — Reportes del inicio.
  "reportes.ver": {
    que: "ver la sección Reportes del inicio: cursos más cursados, alumnos por período, empresas, embudo de leads por origen, recompra y ventas por año y por vendedor. Los ingresos por curso aparecen solo si además tiene ver cobranza. Por defecto la tienen Dirección y Coordinación",
    donde: "/",
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
    // 030 — Las grabaciones son de la cursada: van con lo académico.
    // 031 — Las correcciones también.
    // 2026-10-26 — Y asignar licencias: son de la cursada del alumno.
    incluye: (c) =>
      /^(academico|asistencia|evaluacion|correcciones|certificados|grabaciones|cohortes|licencias)\./.test(
        c
      ),
  },
  {
    titulo: "Comercial y financiero",
    // 040 — `empresas.editar` va con lo comercial.
    // 045 — `marketing.*` también: convertir leads es trabajo comercial.
    incluye: (c) => /^(contactos|inscripciones|cobranza|empresas|facturacion|marketing)\./.test(c),
  },
  { titulo: "Conversaciones", incluye: (c) => c.startsWith("inbox.") },
  // 046 US6 — importar el historial es una operación de la plataforma.
  // 046 US8 — los reportes también van con la plataforma.
  { titulo: "Plataforma", incluye: (c) => /^(configuracion|accesos|alumnos|areas|historial|reportes)\./.test(c) },
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
