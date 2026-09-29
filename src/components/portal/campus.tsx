import Link from "next/link";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

/**
 * Las piezas del portal del alumno (mundo "campus"): la tarjeta, el
 * encabezado con migas, los chips de estado, las métricas y el progreso clase
 * por clase. El dueño pidió un portal de estudio moderno, con Coderhouse como
 * referencia: superficies claras, tarjetas redondeadas, un solo color vivo
 * —el acento de la organización— para lo que se hace y lo que avanza.
 */

/**
 * La ÚNICA superficie del mundo campus: todo lo que se lee va en una tarjeta
 * igual, para que la pantalla se ordene por contenido y no por decoración.
 */
export function Tarjeta({
  className,
  as: Tag = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Tag
      className={cn("min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6", className)}
      {...props}
    />
  );
}

/**
 * El encabezado de cada pantalla: migas, título y una línea que dice para qué
 * sirve. Las migas van en TODAS las pantallas del alumno, también en el
 * inicio, para que la ubicación se lea siempre en el mismo lugar.
 */
export function EncabezadoDePagina({
  migas,
  titulo,
  descripcion,
  acciones,
}: {
  migas: readonly BreadcrumbItem[];
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Breadcrumb items={migas} className="text-sm" />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
          {descripcion && <p className="max-w-prose text-[15px] text-text-2">{descripcion}</p>}
        </div>
        {acciones}
      </div>
    </header>
  );
}

export function TituloDeSeccion({
  children,
  aside,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Tag className="text-lg font-semibold tracking-tight">{children}</Tag>
      {aside}
    </div>
  );
}

export type TonoDeChip = "ok" | "atencion" | "curso" | "neutro" | "aviso";

/**
 * El estado de algo, como chip redondeado. "neutro" lleva borde punteado: es
 * el estado de lo que todavía no tiene datos, y no se tiene que confundir con
 * uno que dice "todo bien" en gris.
 */
export function ChipDeEstado({
  children,
  tono,
  className,
}: {
  children: React.ReactNode;
  tono: TonoDeChip;
  className?: string;
}) {
  const estilo: Record<TonoDeChip, string> = {
    ok: "border-success-border bg-success-soft text-success",
    atencion: "border-danger-border bg-danger-soft text-danger",
    aviso: "border-warning-border bg-warning-soft text-warning",
    curso: "border-brand-soft bg-brand-tint text-brand-text",
    neutro: "border-dashed border-border-strong bg-transparent text-text-2",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        estilo[tono],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Una lectura: el nombre chico arriba, el valor grande y una nota abajo que
 * le da contexto. Un 50% sin el mínimo al lado no dice nada.
 */
export function Metrica({
  etiqueta,
  valor,
  nota,
  alerta = false,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  nota?: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-3">{etiqueta}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums tracking-tight",
          alerta ? "text-danger" : "text-foreground"
        )}
      >
        {valor}
      </p>
      {nota && <div className="mt-0.5 text-xs text-text-3">{nota}</div>}
    </div>
  );
}

export function GrillaDeMetricas({
  items,
  className,
}: {
  items: readonly {
    label: string;
    value: React.ReactNode;
    note?: React.ReactNode;
    alert?: boolean;
  }[];
  className?: string;
}) {
  return (
    <Tarjeta
      as="div"
      className={cn("grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]", className)}
    >
      {items.map((it) => (
        <Metrica key={it.label} etiqueta={it.label} valor={it.value} nota={it.note} alerta={it.alert} />
      ))}
    </Tarjeta>
  );
}

/**
 * Un enlace que se ve como botón: navega (es un `Link`), pero ocupa el lugar
 * de una acción. `primario` para la acción principal de la pantalla.
 */
export function EnlaceBoton({
  href,
  children,
  variante = "secundario",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variante?: "primario" | "secundario";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variante === "primario"
          ? "bg-primary text-primary-foreground hover:bg-brand-hover"
          : "border border-border-strong bg-card text-foreground hover:bg-accent",
        className
      )}
    >
      {children}
    </Link>
  );
}

/**
 * El estado de una clase, cuando se conoce la lista. `sin_registro` existe
 * por la misma regla que `sin_datos`: 0% porque nadie pasó lista no es 0%
 * porque no vino, así que no se dibuja ni lleno ni como falta.
 */
export type TramoEstado =
  | "asistio"
  | "falto"
  | "justificada"
  | "sin_registro"
  | "futura"
  | "cancelada";

/**
 * El estado de la clase en la posición `idx`. Sin lista, el progreso mide el
 * cronograma: lo dictado se dibuja lleno y lo que falta, por venir.
 */
export function estadoDeTramo(
  idx: number,
  states: readonly TramoEstado[] | undefined,
  hechas: number
): TramoEstado {
  return states?.[idx] ?? (idx + 1 <= hechas ? "asistio" : "futura");
}

const FRASE_DE_ESTADO: Record<TramoEstado, (n: number) => string> = {
  asistio: (n) => `asististe a ${n}`,
  falto: (n) => `faltaste a ${n}`,
  justificada: (n) => `${n} ${n === 1 ? "justificada" : "justificadas"}`,
  cancelada: (n) => `${n} ${n === 1 ? "cancelada" : "canceladas"}`,
  sin_registro: (n) => `${n} sin registrar`,
  futura: (n) => `${n} por dictar`,
};

/**
 * Lo que anuncia un lector de pantalla. Con lista, cada clase queda contada
 * en algún estado, así que los números suman el total que se anuncia.
 */
export function resumenDeCadena({
  total,
  hechas,
  next = null,
  states,
}: {
  total: number;
  hechas: number;
  next?: number | null;
  states?: readonly TramoEstado[];
}): string {
  if (!states) {
    return `Clase ${hechas} de ${total}${next ? `; la siguiente es la ${next}` : ""}`;
  }
  const partes = (Object.keys(FRASE_DE_ESTADO) as TramoEstado[])
    .map((e) => [e, states.filter((x) => x === e).length] as const)
    .filter(([, n]) => n > 0)
    .map(([e, n]) => FRASE_DE_ESTADO[e](n));
  return `De ${total} clases: ${partes.join(", ")}`;
}

const COLOR_DE_TRAMO: Record<TramoEstado, string> = {
  asistio: "bg-brand",
  falto: "bg-danger",
  justificada: "bg-warning",
  sin_registro: "border border-dashed border-border-strong bg-transparent",
  futura: "bg-border",
  cancelada: "bg-border opacity-50",
};

/**
 * El progreso de un curso como una fila de segmentos, uno por clase. Sin
 * `states` mide el cronograma (clases dictadas); con `states` cada segmento
 * dice qué pasó en esa clase. La clase que sigue lleva un borde del acento.
 * `minPct` marca dónde tiene que llegar la asistencia.
 *
 * No es una barra de porcentaje a propósito: un alumno cuenta clases, no
 * porcentajes, y una barra lisa escondería una falta en el medio.
 */
export function ProgresoDeClases({
  total,
  done,
  next,
  states,
  minPct,
  className,
}: {
  total: number;
  done: number;
  next?: number | null;
  states?: TramoEstado[];
  minPct?: number | null;
  className?: string;
}) {
  if (total <= 0) return null;
  const hechas = Math.min(Math.max(done, 0), total);
  return (
    <div
      role="img"
      aria-label={resumenDeCadena({ total, hechas, next, states })}
      className={cn("relative pt-1", className)}
    >
      <div className={cn("flex", total > 24 ? "gap-0.5" : "gap-1")}>
        {Array.from({ length: total }, (_, idx) => {
          const estado = estadoDeTramo(idx, states, hechas);
          const esSiguiente = next === idx + 1;
          return (
            <span
              key={idx}
              aria-hidden
              style={{ "--i": idx } as React.CSSProperties}
              className={cn(
                "h-2.5 min-w-0 flex-1 rounded-full",
                estado === "asistio" && "progreso-tramo",
                COLOR_DE_TRAMO[estado],
                esSiguiente && "ring-2 ring-brand ring-offset-1 ring-offset-card"
              )}
            />
          );
        })}
      </div>
      {minPct != null && minPct > 0 && minPct < 100 && (
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-5 top-0 flex flex-col items-center"
          style={{ left: `${minPct}%`, transform: "translateX(-50%)" }}
        >
          <span className="w-0.5 flex-1 rounded-full bg-foreground" />
          <span className="text-[11px] font-semibold text-text-2">mín. {minPct}%</span>
        </div>
      )}
    </div>
  );
}

/** Las referencias de colores del progreso, para quien no las deduce. */
export function LeyendaDeProgreso({ estados }: { estados: readonly TramoEstado[] }) {
  const nombres: Record<TramoEstado, string> = {
    asistio: "Presente",
    falto: "Ausente",
    justificada: "Justificada",
    sin_registro: "Sin registro",
    futura: "Por dictar",
    cancelada: "Cancelada",
  };
  const presentes = (Object.keys(nombres) as TramoEstado[]).filter((e) => estados.includes(e));
  if (presentes.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-3">
      {presentes.map((e) => (
        <li key={e} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2 w-3.5 rounded-full", COLOR_DE_TRAMO[e])} />
          {nombres[e]}
        </li>
      ))}
    </ul>
  );
}
