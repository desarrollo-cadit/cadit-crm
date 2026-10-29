"use client";

import { COURSE_KIND_LABEL, type CourseKind } from "@/lib/course-kind";
import { Segmentado } from "@/components/listados/filtros";
import { TONO_DE_ESTADO, type EstadoDeGrupo } from "@/components/listados/curso-visual";
import { cn } from "@/lib/utils";

/**
 * 2026-10-26 — Lo PROPIO de la barra y las listas de Académico: la etiqueta
 * de tipo de curso y el segmentado de estado de los grupos. Las piezas
 * genéricas (buscador, desplegables, resumen, resaltado) viven en
 * `src/components/listados/filtros.tsx`, y el avatar y el tono de cada estado
 * en `src/components/listados/curso-visual.tsx`, compartidos con los demás
 * listados desde 2026-10-29. Sin lógica de filtrado: eso vive en
 * `src/lib/academic-filters.ts`, puro y con tests.
 */

/* ------------------------------------------------------------ Tipo */

/** Curso / Módulo / Taller, cada uno con un par distinto de la paleta. */
const COLOR_DE_TIPO: Record<CourseKind, string> = {
  curso: "bg-cohort-1 text-cohort-1-fg",
  modulo: "bg-cohort-4 text-cohort-4-fg",
  taller: "bg-cohort-8 text-cohort-8-fg",
};

export function EtiquetaDeTipo({ kind }: { kind: CourseKind }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-px text-[11px] font-medium",
        COLOR_DE_TIPO[kind]
      )}
    >
      {COURSE_KIND_LABEL[kind]}
    </span>
  );
}

/* ------------------------------------------------------------ Segmentado de estado */

const TODOS = "todos" as const;

/**
 * Estado como control segmentado, con selección MÚLTIPLE (`nextStatusFilter`):
 * el caso diario es "planificados + en curso" sin el archivo de finalizados,
 * y un segmentado de una sola opción lo perdería. "Todos" se ve encendido
 * cuando están los tres.
 */
export function SegmentadoDeEstado({
  orden,
  etiquetas,
  value,
  total,
  conteos,
  onTodos,
  onAlternar,
}: {
  orden: readonly EstadoDeGrupo[];
  etiquetas: Record<EstadoDeGrupo, string>;
  value: ReadonlySet<EstadoDeGrupo>;
  total: number;
  conteos: Record<EstadoDeGrupo, number>;
  onTodos: () => void;
  onAlternar: (estado: EstadoDeGrupo) => void;
}) {
  const todos = value.size === orden.length;
  return (
    <Segmentado<EstadoDeGrupo | typeof TODOS>
      etiqueta="Estado"
      opciones={[
        { clave: TODOS, etiqueta: "Todos", cantidad: total },
        ...orden.map((e) => ({
          clave: e,
          etiqueta: etiquetas[e],
          cantidad: conteos[e],
          punto: TONO_DE_ESTADO[e].punto,
          tono: TONO_DE_ESTADO[e].activo,
        })),
      ]}
      encendida={(clave) => (clave === TODOS ? todos : !todos && value.has(clave))}
      onElegir={(clave) => (clave === TODOS ? onTodos() : onAlternar(clave))}
    />
  );
}
