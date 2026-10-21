import { z } from "zod";
import { normalizePhoneInput } from "@/lib/phone";

/**
 * La pestaña «Seguimiento» del contacto — reglas puras (sin base, sin red).
 *
 * Un lead que entra por un formulario público no tenía desde dónde seguirse:
 * el mensaje se pisaba en `contact.notes` y nadie sabía quién lo había
 * llamado. La pestaña junta en UNA línea de tiempo lo que mandó (cada envío
 * de formulario), las notas del equipo y cada vez que alguien le escribió.
 */

/* ------------------------------------------------------------------ enlaces */

/**
 * `https://wa.me/<dígitos>` para abrir WhatsApp (app o Web) con esa persona.
 *
 * wa.me pide el número internacional SOLO en dígitos, sin "+" ni ceros
 * delante. El teléfono guardado ya suele estar normalizado (598…), pero los
 * contactos viejos o cargados a mano pueden traer "098 574 165": se pasa por
 * la MISMA normalización que la captación pública. Un contacto `bsuid:` (Meta
 * no mandó el número) no tiene teléfono y no tiene enlace.
 */
export function enlaceDeWhatsApp(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw || /[a-z]/i.test(raw)) return null;
  const digitos = normalizePhoneInput(raw);
  if (!digitos || !/^[1-9]\d{7,14}$/.test(digitos)) return null;
  return `https://wa.me/${digitos}`;
}

const correoSchema = z.string().trim().email();

/** `mailto:` con la dirección del contacto; `null` si no tiene (o no es un correo). */
export function enlaceDeCorreo(email: string | null | undefined): string | null {
  const parsed = correoSchema.safeParse(email ?? "");
  if (!parsed.success) return null;
  const [local, dominio] = [
    parsed.data.slice(0, parsed.data.lastIndexOf("@")),
    parsed.data.slice(parsed.data.lastIndexOf("@") + 1),
  ];
  return `mailto:${encodeURIComponent(local)}@${dominio}`;
}

/**
 * De dónde vino un formulario, dicho para una persona. El `source` guarda el
 * prefijo interno `formulario:` (lo usan el badge del sidebar y la tabla de
 * contactos), que no se muestra. La página de un curso usa el nombre del
 * curso como origen, y repetirlo junto al título no dice nada.
 */
export function origenDelFormulario(source: string, interes: string | null): string {
  if (!source.startsWith("formulario:")) return source;
  const nombre = source.slice("formulario:".length).trim();
  if (nombre.startsWith("Taller ")) return "Inscripción al taller desde el sitio";
  if (interes && nombre === interes) return "Página del curso en el sitio";
  return `Formulario «${nombre}»`;
}

/* ---------------------------------------------------------- línea de tiempo */

export const TIPOS_DE_ACTIVIDAD = ["nota", "contacto_email", "contacto_whatsapp"] as const;
export type TipoDeActividad = (typeof TIPOS_DE_ACTIVIDAD)[number];

/** Un envío de formulario público, tal como llegó (append-only). */
export type EnvioDeFormularioDto = {
  id: string;
  /** Cuándo llegó (ISO). */
  at: string;
  /** El `source` de la captación ("formulario:<nombre>"). */
  source: string;
  interestKind: "curso" | "taller" | "general";
  interestName: string | null;
  cohortName: string | null;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  company: string | null;
  /** Solo talleres: "anotado" o el motivo del rechazo. */
  result: string | null;
};

/** Una nota o un contacto registrado por alguien del equipo. */
export type ActividadDto = {
  id: string;
  at: string;
  kind: TipoDeActividad;
  body: string | null;
  /** `null` si la cuenta ya no existe. */
  authorName: string | null;
};

export type EntradaDeSeguimiento =
  | ({ tipo: "formulario" } & EnvioDeFormularioDto)
  | ({ tipo: TipoDeActividad } & ActividadDto);

/**
 * Una sola línea, lo más nuevo arriba. A igual instante la actividad va
 * primero: es la respuesta del equipo a lo que llegó, nunca al revés.
 */
export function armarLineaDeTiempo(
  envios: EnvioDeFormularioDto[],
  actividades: ActividadDto[]
): EntradaDeSeguimiento[] {
  const todas: { orden: number; entrada: EntradaDeSeguimiento }[] = [
    ...actividades.map((a) => ({ orden: 0, entrada: { tipo: a.kind, ...a } as EntradaDeSeguimiento })),
    ...envios.map((e) => ({ orden: 1, entrada: { tipo: "formulario" as const, ...e } })),
  ];
  return todas
    .sort((a, b) => {
      const t = Date.parse(b.entrada.at) - Date.parse(a.entrada.at);
      if (t !== 0) return t;
      if (a.orden !== b.orden) return a.orden - b.orden;
      return b.entrada.id.localeCompare(a.entrada.id);
    })
    .map((x) => x.entrada);
}

/* ------------------------------------------------------------ pestaña inicial */

export type PestanaDelContacto = "record" | "seguimiento" | "admin";

/** `?tab=` acepta el nombre visible, sin acentos. */
const PEDIDAS: Record<string, PestanaDelContacto> = {
  seguimiento: "seguimiento",
  legajo: "record",
  administracion: "admin",
};

/**
 * Qué pestaña abre el contacto. Un lead —nadie lo inscribió en un grupo
 * (mismo criterio que los cursos del legajo: sin talleres, sin la tarjeta del
 * embudo)— abre en Seguimiento, porque el legajo de un lead está vacío. Un
 * alumno sigue abriendo en el Legajo. `?tab=` manda, salvo que pida una
 * pestaña que esta persona no puede ver.
 */
export function pestanaInicialDelContacto(opts: {
  tieneCursos: boolean;
  pedida: string | null;
  puedeAuditar: boolean;
}): PestanaDelContacto {
  const pedida = opts.pedida ? PEDIDAS[opts.pedida] : undefined;
  if (pedida && (pedida !== "admin" || opts.puedeAuditar)) return pedida;
  return opts.tieneCursos ? "record" : "seguimiento";
}

/* -------------------------------------------------------------- el POST */

export const seguimientoBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("nota"), body: z.string().trim().min(1).max(4000) }),
  z.object({ kind: z.literal("contacto_email") }),
  z.object({ kind: z.literal("contacto_whatsapp") }),
]);
export type SeguimientoBody = z.infer<typeof seguimientoBodySchema>;
