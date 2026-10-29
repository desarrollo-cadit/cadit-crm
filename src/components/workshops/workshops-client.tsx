"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Presentation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  TODOS_LOS_ANIOS,
  leerFiltroDeAnio,
  type FiltroDeAnio,
} from "@/lib/academic-filters";
import {
  contadoresDeTalleres,
  filtrarTalleres,
  seccionesDeTalleres,
} from "@/lib/workshop-filters";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  Buscador,
  Desplegable,
  EncabezadoDeSeccion,
  OpcionUnica,
  Resaltado,
  ResumenDeFiltros,
  SinCoincidencias,
  TarjetaDeFiltros,
  type FiltroActivo,
} from "@/components/listados/filtros";
import { AvatarDeCurso, TONO_DE_ESTADO } from "@/components/listados/curso-visual";
import {
  WORKSHOP_REGISTRATION_LABEL,
  type WorkshopAttendeeStatus,
  type WorkshopModality,
  type WorkshopRegistrationStatus,
} from "@/lib/workshops";
import { WorkshopEditionFields, type EditionPayload } from "./workshop-edition-form";
import { subirImagenDeTaller } from "./workshop-image-field";
import {
  REGISTRATION_BADGE,
  costLabel,
  horario,
  modalityLabel,
  workshopDay,
  type Currency,
} from "./workshop-format";

export type EditionRow = {
  id: string;
  courseId: string;
  displayName: string;
  courseName: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  started: boolean;
  modality: WorkshopModality | null;
  classroom: string | null;
  capacity: number | null;
  cost: number | null;
  currency: Currency;
  registrationStatus: WorkshopRegistrationStatus | null;
  counts: Record<WorkshopAttendeeStatus, number>;
  occupied: number;
  seatsLeft: number | null;
};

type CourseRow = { id: string; name: string; editions: number };

const CLAVE_ANIO = "talleres:anio";

function leerAnioGuardado(): FiltroDeAnio {
  try {
    return leerFiltroDeAnio(window.localStorage.getItem(CLAVE_ANIO));
  } catch {
    return TODOS_LOS_ANIOS;
  }
}

/**
 * 033 (US5, FR-001/FR-003) — La sección Talleres: los próximos arriba, los
 * realizados abajo, filtro por año (el mismo criterio de 032) y el alta de un
 * taller nuevo o de otra edición de uno existente.
 */
export function WorkshopsClient({ canEdit }: { canEdit: boolean }) {
  const [editions, setEditions] = useState<EditionRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [anio, setAnio] = useState<FiltroDeAnio>(TODOS_LOS_ANIOS);
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState<null | "nuevo" | "edicion">(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/talleres").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { editions: EditionRow[]; courses: CourseRow[] };
      setEditions(data.editions);
      setCourses(data.courses);
      setError(false);
    } else {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setAnio(leerAnioGuardado());
    void refetch();
  }, [refetch]);

  function elegirAnio(valor: FiltroDeAnio) {
    setAnio(valor);
    try {
      window.localStorage.setItem(CLAVE_ANIO, String(valor));
    } catch {
      // Sin almacenamiento el filtro vale para esta visita y nada más.
    }
  }

  /**
   * 2026-10-29 — Como la pestaña Grupos de Académico: buscador y año en UNA
   * tarjeta, resumen "Mostrando N de M" con etiquetas quitables. La lógica es
   * de `src/lib/workshop-filters.ts` (pura, con tests).
   */
  const anioActual = new Date().getFullYear();
  const visibles = filtrarTalleres(editions, { busqueda, anio }, textosDeTaller);
  const { proximos, realizados } = seccionesDeTalleres(visibles);
  const contadores = useMemo(
    () => contadoresDeTalleres(editions, busqueda, textosDeTaller, anioActual),
    [editions, busqueda, anioActual]
  );
  const etiquetaDeAnio = (a: FiltroDeAnio) =>
    a === TODOS_LOS_ANIOS ? "Todos" : a === anioActual ? "Este año" : String(a);

  const filtrosActivos: FiltroActivo[] = [
    ...(busqueda.trim()
      ? [{ clave: "q", etiqueta: `“${busqueda.trim()}”`, quitar: () => setBusqueda("") }]
      : []),
    ...(anio !== TODOS_LOS_ANIOS
      ? [{ clave: "anio", etiqueta: `Año: ${etiquetaDeAnio(anio)}`, quitar: () => elegirAnio(TODOS_LOS_ANIOS) }]
      : []),
  ];
  function limpiarFiltros() {
    setBusqueda("");
    elegirAnio(TODOS_LOS_ANIOS);
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Presentation className="h-5 w-5" />
            Talleres
          </h2>
          <p className="text-sm text-muted-foreground">
            Quién se anotó, quién confirmó, quién pagó y quién vino, en un solo lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <Button size="sm" onClick={() => setCreando("nuevo")}>
                <Plus className="h-4 w-4" />
                Nuevo taller
              </Button>
              {courses.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setCreando("edicion")}>
                  Otra edición
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {creando === "nuevo" && (
        <NuevoTaller
          onDone={() => {
            setCreando(null);
            void refetch();
          }}
          onCancel={() => setCreando(null)}
        />
      )}
      {creando === "edicion" && (
        <OtraEdicion
          courses={courses}
          onDone={() => {
            setCreando(null);
            void refetch();
          }}
          onCancel={() => setCreando(null)}
        />
      )}

      {error && (
        <p className="text-sm text-destructive">
          No pudimos cargar los talleres. Probá de nuevo en unos minutos.
        </p>
      )}

      {!error && editions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay talleres. Creá el primero con «Nuevo taller».
        </p>
      )}

      {!error && editions.length > 0 && (
        <TarjetaDeFiltros
          pie={
            <ResumenDeFiltros
              mostrando={visibles.length}
              total={editions.length}
              sustantivo={{ uno: "taller", varios: "talleres" }}
              activos={filtrosActivos}
              onLimpiar={limpiarFiltros}
            />
          }
        >
          <Buscador
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar taller por nombre, día, modalidad o costo…"
          />
          {/* 033 — año: el mismo criterio de 032; se recuerda por navegador. */}
          <Desplegable etiqueta="Año" valor={etiquetaDeAnio(anio)} activo={anio !== TODOS_LOS_ANIOS}>
            {(cerrar) => (
              <>
                <OpcionUnica
                  elegida={anio === TODOS_LOS_ANIOS}
                  cantidad={contadores.todosLosAnios}
                  onElegir={() => {
                    elegirAnio(TODOS_LOS_ANIOS);
                    cerrar();
                  }}
                >
                  Todos los años
                </OpcionUnica>
                {contadores.anios.map(({ anio: a, count }) => (
                  <OpcionUnica
                    key={a}
                    elegida={anio === a}
                    cantidad={count}
                    onElegir={() => {
                      elegirAnio(a);
                      cerrar();
                    }}
                  >
                    {a === anioActual ? `Este año (${a})` : a}
                  </OpcionUnica>
                ))}
              </>
            )}
          </Desplegable>
        </TarjetaDeFiltros>
      )}

      {editions.length > 0 && visibles.length === 0 ? (
        <SinCoincidencias
          mensaje="Ningún taller coincide con la búsqueda y los filtros."
          onLimpiar={limpiarFiltros}
        />
      ) : (
        <div className="space-y-5">
          {proximos.length > 0 && (
            <Lista id="talleres-proximos" titulo="Próximos" tono="planificada" filas={proximos} busqueda={busqueda} />
          )}
          {realizados.length > 0 && (
            <Lista id="talleres-realizados" titulo="Realizados" tono="finalizada" filas={realizados} busqueda={busqueda} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lo que la fila MUESTRA, que es lo que se busca: nombre, curso, día,
 * horario, modalidad, costo e inscripción. El formato es el de la fila.
 */
function textosDeTaller(e: EditionRow): string[] {
  return [
    e.displayName,
    e.courseName,
    workshopDay(e.startDate),
    horario(e.startTime, e.endTime),
    modalityLabel(e.modality),
    costLabel(e.cost, e.currency),
    ...(e.registrationStatus ? [WORKSHOP_REGISTRATION_LABEL[e.registrationStatus]] : []),
  ];
}

/** "8 de 20 inscriptos"; lleno, en el tono de advertencia. Sin cupo, solo la cantidad. */
function CupoDeTaller({ inscriptos, cupo }: { inscriptos: number; cupo: number | null }) {
  if (cupo === null || cupo <= 0) {
    return (
      <span className="text-[12.5px] text-text-2">
        {inscriptos} {inscriptos === 1 ? "inscripto" : "inscriptos"}
      </span>
    );
  }
  const completo = inscriptos >= cupo;
  return (
    <span className={cn("text-[12.5px] tabular-nums", completo ? "font-medium text-warning" : "text-text-2")}>
      {inscriptos} de {cupo}
      {completo ? " · completo" : " inscriptos"}
    </span>
  );
}

/**
 * 2026-10-29 — Una sección como las de estado de Académico: título en el
 * tono (próximos = planificado, realizados = finalizado), pastilla con la
 * cantidad y filas en grilla: avatar del curso | nombre + día y horario |
 * modalidad y costo | cupo | inscripción. En pantallas angostas quedan
 * avatar, nombre e inscripción.
 */
function Lista({
  id,
  titulo,
  tono,
  filas,
  busqueda,
}: {
  id: string;
  titulo: string;
  tono: "planificada" | "finalizada";
  filas: EditionRow[];
  busqueda: string;
}) {
  const colores = TONO_DE_ESTADO[tono];
  return (
    <section aria-labelledby={id}>
      <EncabezadoDeSeccion
        id={id}
        titulo={titulo}
        cantidad={filas.length}
        claseTexto={colores.texto}
        clasePastilla={colores.pastilla}
      />
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {filas.map((e) => {
          const nombreDelCurso =
            e.courseName && !e.displayName.toLowerCase().includes(e.courseName.toLowerCase())
              ? e.courseName
              : null;
          return (
            <li key={e.id}>
              <Link
                href={`/talleres/${e.id}`}
                className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-x-3.5 px-4 py-[11px] transition-colors hover:bg-subtle md:grid-cols-[38px_minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
              >
                <AvatarDeCurso courseId={e.courseId} nombre={e.courseName} apagado={e.started} />
                <div className="min-w-0">
                  <p className="truncate font-medium leading-snug">
                    <Resaltado texto={e.displayName} busqueda={busqueda} />
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {nombreDelCurso && (
                      <>
                        <Resaltado texto={nombreDelCurso} busqueda={busqueda} />
                        {" · "}
                      </>
                    )}
                    <Resaltado texto={workshopDay(e.startDate)} busqueda={busqueda} />
                    {" · "}
                    <Resaltado texto={horario(e.startTime, e.endTime)} busqueda={busqueda} />
                  </p>
                </div>
                <div className="hidden min-w-0 truncate text-[13px] text-text-2 md:block">
                  <Resaltado texto={modalityLabel(e.modality)} busqueda={busqueda} />
                  {" · "}
                  <Resaltado texto={costLabel(e.cost, e.currency)} busqueda={busqueda} />
                </div>
                <div className="hidden md:block">
                  <CupoDeTaller inscriptos={e.occupied} cupo={e.capacity} />
                </div>
                <div className="flex items-center justify-end">
                  {e.registrationStatus && (
                    <Badge variant={REGISTRATION_BADGE[e.registrationStatus]}>
                      {WORKSHOP_REGISTRATION_LABEL[e.registrationStatus]}
                    </Badge>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function leerError(res: Response | null): Promise<string> {
  if (!res) return "No pudimos conectar con el servidor.";
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? "No se pudo guardar.";
}

function NuevoTaller({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [courseName, setCourseName] = useState("");
  const [description, setDescription] = useState("");
  const [imagen, setImagen] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function guardar(edition: EditionPayload) {
    setBusy(true);
    const res = await fetch("/api/talleres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseName,
        description: description.trim() || null,
        edition,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      notify.error(await leerError(res));
      return;
    }
    // La imagen va DESPUÉS de crear el taller: recién ahí hay curso.
    const { courseId } = (await res.json()) as { courseId: string };
    const errorDeImagen = imagen ? await subirImagenDeTaller(courseId, imagen) : null;
    setBusy(false);
    if (errorDeImagen) {
      notify.error(`El taller se creó, pero la imagen no: ${errorDeImagen}`);
    } else {
      notify.success("Taller creado.");
    }
    onDone();
  }

  return (
    <div className="rounded-md border p-4">
      <h3 className="mb-3 text-sm font-semibold">Nuevo taller</h3>
      <WorkshopEditionFields submitLabel="Crear taller" busy={busy} onSubmit={guardar} onCancel={onCancel}>
        <div className="space-y-1">
          <Label htmlFor="taller-nombre">Nombre del taller</Label>
          <Input
            id="taller-nombre"
            required
            maxLength={120}
            value={courseName}
            placeholder="Introducción a Revit"
            onChange={(e) => setCourseName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="taller-descripcion">Descripción (sale en la web)</Label>
          <Textarea
            id="taller-descripcion"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="taller-imagen-nueva">Imagen (sale en la web, opcional)</Label>
          <Input
            id="taller-imagen-nueva"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setImagen(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">JPG, PNG o WebP, hasta 5 MB.</p>
        </div>
      </WorkshopEditionFields>
    </div>
  );
}

function OtraEdicion({
  courses,
  onDone,
  onCancel,
}: {
  courses: CourseRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function guardar(edition: EditionPayload) {
    setBusy(true);
    const res = await fetch("/api/talleres/ediciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, edition }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error(await leerError(res));
      return;
    }
    notify.success("Edición creada.");
    onDone();
  }

  return (
    <div className="rounded-md border p-4">
      <h3 className="mb-3 text-sm font-semibold">Otra edición de un taller</h3>
      <WorkshopEditionFields
        submitLabel="Crear edición"
        busy={busy}
        onSubmit={guardar}
        onCancel={onCancel}
      >
        <div className="space-y-1">
          <Label htmlFor="taller-curso">Taller</Label>
          <Select id="taller-curso" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.editions} edición{c.editions === 1 ? "" : "es"})
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Los inscriptos de una edición no pasan a la otra.
          </p>
        </div>
      </WorkshopEditionFields>
    </div>
  );
}
