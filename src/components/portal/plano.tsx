import { cn } from "@/lib/utils";

/**
 * La lámina: el objeto central del mundo del alumno. Azul de Prusia con la
 * retícula de la copia heliográfica, en los dos temas. Las marcas de las
 * esquinas son las de registro de una lámina impresa: dicen "esto es una
 * hoja" sin agregar un borde más.
 */
export function Lamina({
  className,
  children,
  as: Tag = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Tag
      className={cn(
        "lamina relative overflow-hidden rounded-lg shadow-sm ring-1 ring-sheet-line",
        className
      )}
      {...props}
    >
      <MarcasDeRegistro />
      <div className="relative">{children}</div>
    </Tag>
  );
}

function MarcasDeRegistro() {
  const marca = "pointer-events-none absolute h-3 w-3 border-sheet-ink-3";
  return (
    <>
      <span aria-hidden className={cn(marca, "left-2 top-2 border-l border-t")} />
      <span aria-hidden className={cn(marca, "right-2 top-2 border-r border-t")} />
      <span aria-hidden className={cn(marca, "bottom-2 left-2 border-b border-l")} />
      <span aria-hidden className={cn(marca, "bottom-2 right-2 border-b border-r")} />
    </>
  );
}

/**
 * El estado de una clase dentro de la cadena, cuando se conoce la lista.
 * `sin_registro` existe por la misma regla que `sin_datos`: 0% porque nadie
 * pasó lista no es 0% porque no vino, así que no se dibuja ni lleno ni roto.
 */
export type TramoEstado =
  | "asistio"
  | "falto"
  | "justificada"
  | "sin_registro"
  | "futura"
  | "cancelada";

/**
 * Cada cuántas clases se escribe el número: todas hasta 16, de a dos hasta
 * 32, de a cinco más allá. Más números no entran a lo ancho de un celular.
 */
function pasoDeRotulo(total: number): number {
  return total <= 16 ? 1 : total <= 32 ? 2 : 5;
}

/**
 * Si la clase `n` lleva su número debajo. La primera, la última y la que sigue
 * siempre; el resto según el paso. Un múltiplo pegado al último número se
 * omite, porque "35 36" se pisan.
 */
export function debeRotular(n: number, total: number, next: number | null = null): boolean {
  const paso = pasoDeRotulo(total);
  if (n === 1 || n === total || n === next) return true;
  return n % paso === 0 && (paso === 1 || total - n >= paso / 2);
}

/**
 * El estado de la clase en la posición `idx`. Sin lista, la cadena mide el
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

/**
 * La cadena de cotas: el avance de una cursada dibujado como se acota un
 * plano. Cada clase es un tramo entre dos trazos de cota. Lo dictado es línea
 * llena; lo que falta, línea de trazos (en dibujo técnico, lo que todavía no
 * se ve); la clase que sigue va en rojo de revisión con su marca.
 *
 * Sin `states`, la cadena mide el CRONOGRAMA (clases dictadas), no la
 * asistencia: es lo único que el inicio sabe. Con `states` —el detalle de la
 * cursada, que tiene la lista clase por clase— cada tramo dice qué pasó: lleno
 * si viniste, cortado en rojo con una cruz si faltaste, punteado si nadie
 * tomó lista. `minPct` marca con una cota el mínimo de asistencia.
 *
 * No es una barra de porcentaje a propósito: "7 de 12" se lee contando, y un
 * alumno cuenta clases, no porcentajes.
 */
export function CadenaDeCotas({
  total,
  done,
  next,
  states,
  minPct,
  tone = "lamina",
  className,
}: {
  total: number;
  done: number;
  /** Número de la clase que sigue, si hay una en agenda. */
  next?: number | null;
  states?: TramoEstado[];
  minPct?: number | null;
  tone?: "lamina" | "hoja";
  className?: string;
}) {
  if (total <= 0) return null;
  const hechas = Math.min(Math.max(done, 0), total);
  const lamina = tone === "lamina";

  const c = lamina
    ? { hecho: "bg-sheet-ink", falta: "border-sheet-ink-3", rojo: "text-revision-sheet", rojoFondo: "bg-revision-sheet", rojoBorde: "border-revision-sheet", texto: "text-sheet-ink", tick: "bg-sheet-ink-3" }
    : { hecho: "bg-brand", falta: "border-border-strong", rojo: "text-revision", rojoFondo: "bg-revision", rojoBorde: "border-revision", texto: "text-text-2", tick: "bg-text-4" };

  const etiqueta = resumenDeCadena({ total, hechas, next, states });

  return (
    <div role="img" aria-label={etiqueta} className={cn("relative w-full", className)}>
      {minPct != null && minPct > 0 && minPct < 100 && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-5 bottom-4 z-10 flex flex-col items-center"
          style={{ left: `${minPct}%`, transform: "translateX(-50%)" }}
        >
          <span className={cn("font-display text-xs font-semibold uppercase tracking-[0.12em]", c.texto)}>
            mín. {minPct}%
          </span>
          <span className={cn("w-px flex-1", lamina ? "bg-sheet-ink" : "bg-foreground")} />
        </div>
      )}
      <div className="flex">
        {Array.from({ length: total }, (_, idx) => {
          const n = idx + 1;
          const estado = estadoDeTramo(idx, states, hechas);
          const esSiguiente = next === n;
          const rotular = debeRotular(n, total, next ?? null);
          return (
            <div key={n} className="relative min-w-0 flex-1">
              <div className="flex h-3 items-end justify-center">
                {esSiguiente && (
                  <svg viewBox="0 0 10 7" className={cn("h-[7px] w-2.5", c.rojo)} aria-hidden>
                    <path d="M0 0h10L5 7z" fill="currentColor" />
                  </svg>
                )}
                {estado === "falto" && (
                  <svg viewBox="0 0 10 10" className={cn("h-2.5 w-2.5", c.rojo)} aria-hidden>
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <div className="relative h-4">
                <span aria-hidden className={cn("absolute left-0 top-0.5 h-3 w-px", c.tick)} />
                {n === total && <span aria-hidden className={cn("absolute right-0 top-0.5 h-3 w-px", c.tick)} />}
                {estado === "asistio" ? (
                  <span
                    aria-hidden
                    style={{ "--i": idx } as React.CSSProperties}
                    className={cn("cota-tramo absolute inset-x-0 top-[7px] h-0.5", c.hecho)}
                  />
                ) : estado === "falto" ? (
                  <span aria-hidden className={cn("absolute inset-x-[30%] top-[7px] h-0.5", c.rojoFondo)} />
                ) : estado === "justificada" ? (
                  // Registrada pero justificada: punteado en tinta, no en gris.
                  <span aria-hidden className={cn("absolute inset-x-0 top-[7px] border-t-2 border-dotted", lamina ? "border-sheet-ink" : "border-brand")} />
                ) : estado === "sin_registro" ? (
                  <span aria-hidden className={cn("absolute inset-x-0 top-[7px] border-t-2 border-dotted", c.falta)} />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 top-[7px] border-t-2",
                      esSiguiente ? c.rojoBorde : cn(c.falta, "border-dashed"),
                      estado === "cancelada" && "opacity-40"
                    )}
                  />
                )}
              </div>
              <p
                aria-hidden
                className={cn(
                  "h-4 text-center font-display text-[13px] font-semibold leading-4 tabular-nums",
                  esSiguiente || estado === "falto" ? c.rojo : c.texto
                )}
              >
                {rotular ? n : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * El rótulo: el cajetín de una lámina, con su grilla de líneas finas. Cada
 * celda es una lectura con su nombre en versalitas chicas encima y el valor
 * debajo. Sirve en la lámina (tinta blanca) y en la hoja (tinta azul).
 */
export function Rotulo({
  items,
  tone = "lamina",
  className,
}: {
  items: { label: string; value: React.ReactNode; note?: React.ReactNode; alert?: boolean }[];
  tone?: "lamina" | "hoja";
  className?: string;
}) {
  const lamina = tone === "lamina";
  return (
    <dl
      className={cn(
        "grid grid-cols-2 border-l border-t sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]",
        lamina ? "border-sheet-line" : "border-border-strong",
        className
      )}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={cn("min-w-0 border-b border-r px-3 py-2.5", lamina ? "border-sheet-line" : "border-border-strong")}
        >
          <dt
            className={cn(
              "font-display text-xs font-semibold uppercase tracking-[0.14em]",
              lamina ? "text-sheet-ink-3" : "text-text-3"
            )}
          >
            {it.label}
          </dt>
          <dd
            className={cn(
              "mt-0.5 font-display font-semibold tabular-nums",
              // Un número se lee grande; una frase ("Lunes y miércoles…") no.
              typeof it.value === "string" && it.value.length > 14 ? "text-base leading-5" : "text-xl leading-6",
              it.alert ? (lamina ? "text-revision-sheet" : "text-revision") : lamina ? "text-sheet-ink" : "text-foreground"
            )}
          >
            {it.value}
          </dd>
          {it.note && (
            <dd className={cn("mt-0.5 text-xs", lamina ? "text-sheet-ink-2" : "text-text-3")}>
              {it.note}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * El sello: el estado de una cursada apoyado con tinta sobre la hoja, apenas
 * torcido. Es notación, no color de fondo: el color dice de quién es la hoja,
 * el sello dice cómo está.
 */
export function Sello({
  children,
  tone,
  flat = false,
  className,
}: {
  children: React.ReactNode;
  tone: "ok" | "revision" | "curso" | "neutro" | "lamina" | "lamina-revision";
  /** Derecho y sin doble línea: para celdas de tabla, donde el renglón manda. */
  flat?: boolean;
  className?: string;
}) {
  const color = {
    ok: "text-success",
    revision: "text-revision",
    curso: "text-brand-text",
    neutro: "text-text-3",
    lamina: "text-sheet-ink",
    "lamina-revision": "text-revision-sheet",
  }[tone];
  return (
    <span
      className={cn(
        flat
          ? "inline-flex shrink-0 items-center rounded-sm border border-current px-2 py-px font-display text-xs font-bold uppercase tracking-[0.16em]"
          : "sello inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 font-display text-xs font-bold uppercase tracking-[0.16em]",
        tone === "neutro" && "border-dashed",
        color,
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * El título de una sección de la hoja: condensado en mayúsculas y seguido de
 * una línea fina hasta el borde, como el título de una vista en una lámina.
 */
export function TituloDeVista({
  children,
  aside,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex items-center gap-3">
      <Tag className="shrink-0 font-display text-base font-semibold uppercase tracking-[0.12em] text-foreground">
        {children}
      </Tag>
      <span aria-hidden className="h-px flex-1 bg-border-strong" />
      {aside}
    </div>
  );
}
