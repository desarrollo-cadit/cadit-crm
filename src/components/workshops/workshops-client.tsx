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
  aniosDisponibles,
  coincideAnio,
  leerFiltroDeAnio,
  type FiltroDeAnio,
} from "@/lib/academic-filters";
import { notify } from "@/lib/notify";
import {
  WORKSHOP_REGISTRATION_LABEL,
  type WorkshopAttendeeStatus,
  type WorkshopModality,
  type WorkshopRegistrationStatus,
} from "@/lib/workshops";
import { WorkshopEditionFields, type EditionPayload } from "./workshop-edition-form";
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

  function elegirAnio(raw: string) {
    const valor = leerFiltroDeAnio(raw);
    setAnio(valor);
    try {
      window.localStorage.setItem(CLAVE_ANIO, String(valor));
    } catch {
      // Sin almacenamiento el filtro vale para esta visita y nada más.
    }
  }

  const anios = useMemo(
    () => aniosDisponibles(editions, new Date().getFullYear()),
    [editions]
  );
  const visibles = editions.filter((e) => coincideAnio(e, anio));
  const proximos = visibles.filter((e) => !e.started);
  const realizados = visibles.filter((e) => e.started);

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
          <Label htmlFor="talleres-anio" className="sr-only">
            Año
          </Label>
          <Select
            id="talleres-anio"
            className="w-40"
            value={String(anio)}
            onChange={(e) => elegirAnio(e.target.value)}
          >
            <option value={TODOS_LOS_ANIOS}>Todos los años</option>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
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

      {proximos.length > 0 && <Lista titulo="Próximos" filas={proximos} />}
      {realizados.length > 0 && <Lista titulo="Realizados" filas={realizados} />}
      {editions.length > 0 && visibles.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay talleres en ese año.</p>
      )}
    </div>
  );
}

function Lista({ titulo, filas }: { titulo: string; filas: EditionRow[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{titulo}</h3>
      <ul className="divide-y rounded-md border">
        {filas.map((e) => (
          <li key={e.id}>
            <Link
              href={`/talleres/${e.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 font-medium">{e.displayName}</span>
              <span className="text-muted-foreground">
                {workshopDay(e.startDate)} · {horario(e.startTime, e.endTime)}
              </span>
              <span>{modalityLabel(e.modality)}</span>
              <span>{costLabel(e.cost, e.currency)}</span>
              <span>
                {e.occupied} inscripto{e.occupied === 1 ? "" : "s"}
                {e.capacity !== null ? ` de ${e.capacity}` : ""}
              </span>
              {e.registrationStatus && (
                <Badge variant={REGISTRATION_BADGE[e.registrationStatus]}>
                  {WORKSHOP_REGISTRATION_LABEL[e.registrationStatus]}
                </Badge>
              )}
            </Link>
          </li>
        ))}
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
    setBusy(false);
    if (!res?.ok) {
      notify.error(await leerError(res));
      return;
    }
    notify.success("Taller creado.");
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
