"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MessageSquareText, Settings2, Trophy, XCircle } from "lucide-react";
import type { CohortDto, StageDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StageManager } from "./stage-manager";

export type BoardEnrollment = {
  id: string;
  stageId: string;
  cohortId: string | null;
  position: number;
  lastActivityAt: string | null;
  /** 005 iteración 7 — curso del formulario por el que entró el lead. */
  interestCourseId: string | null;
  interestCourseName: string | null;
  contact: { id: string; name: string; phone: string | null };
  conversationId: string | null;
};

export function PipelineClient() {
  const [stages, setStages] = useState<StageDto[]>([]);
  const [leads, setLeads] = useState<BoardEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<BoardEnrollment | null>(null);
  const [managing, setManaging] = useState(false);
  const [cohorts, setCohorts] = useState<CohortDto[]>([]);
  // Iteración 6 (feedback en vivo: "poder filtrar en pipeline, por cohorte,
  // por sin asignar cohorte") — "unassigned" = comportamiento original (004,
  // sin param); "all" = todas; o un cohortId puntual.
  const [cohortFilter, setCohortFilter] = useState<string>("unassigned");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    const params =
      cohortFilter === "unassigned" ? "" : `?cohortId=${encodeURIComponent(cohortFilter)}`;
    const res = await fetch(`/api/pipeline/board${params}`).catch(() => null);
    if (!res?.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      stages: StageDto[];
      enrollments: BoardEnrollment[];
    };
    setStages(data.stages);
    setLeads(data.enrollments);
    setLoading(false);
  }, [cohortFilter]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/cohorts").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { cohorts: CohortDto[] };
      setCohorts(data.cohorts);
    })();
  }, []);

  function onDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const leadId = String(event.active.id);
    const overStage = event.over ? String(event.over.id) : null;
    if (!overStage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === overStage) return;

    const position = leads.filter((l) => l.stageId === overStage).length;
    // Optimista + persistencia
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stageId: overStage, position } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId: overStage, position }),
    }).catch(() => null);
    void refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="font-semibold">Pipeline</h2>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filtrar por cohorte"
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={cohortFilter}
            onChange={(e) => setCohortFilter(e.target.value)}
          >
            <option value="unassigned">Sin cohorte (lead general)</option>
            <option value="all">Todas las cohortes</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.courseName}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
            <Settings2 className="h-4 w-4" /> Gestionar etapas
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-4">
        {loading ? (
          <div className="flex h-full gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-full w-64 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <div className="flex h-full gap-3">
              {stages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  leads={leads
                    .filter((l) => l.stageId === stage.id)
                    .sort((a, b) => a.position - b.position)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeLead ? <LeadCard lead={activeLead} overlay /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {managing && (
        <StageManager
          stages={stages}
          onClose={() => setManaging(false)}
          onChanged={() => void refetch()}
        />
      )}
    </div>
  );
}

function StageColumn({ stage, leads }: { stage: StageDto; leads: BoardEnrollment[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-64 shrink-0 flex-col rounded-lg border bg-card",
        isOver && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {stage.kind === "won" && <Trophy className="h-3.5 w-3.5 text-primary" />}
          {stage.kind === "lost" && (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {stage.name}
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {leads.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {leads.map((lead) => (
          <DraggableLead key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

function DraggableLead({ lead }: { lead: BoardEnrollment }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-40")}
    >
      <LeadCard lead={lead} />
    </div>
  );
}

/**
 * 021 — Hace cuántos días que nadie toca este lead.
 *
 * Pura y exportada para poder probarla: es la regla que decide qué se pinta
 * como pendiente, y equivocarla es marcar de urgente a todo el tablero —
 * que es lo mismo que no marcar nada.
 *
 * `null` = nunca hubo actividad. Un lead recién creado no está "frío": está
 * sin empezar, y son dos cosas distintas.
 */
export function diasSinActividad(
  lastActivityAt: string | null,
  now: Date = new Date()
): number | null {
  if (!lastActivityAt) return null;
  const ms = now.getTime() - new Date(lastActivityAt).getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * A partir de acá el lead se pinta como pendiente.
 *
 * Catorce días y no siete: en una academia el ciclo de decisión es largo
 * —la gente consulta, lo piensa, pregunta en la casa— y marcar en rojo a
 * cualquiera que no contestó en una semana llenaría el tablero de alertas
 * que nadie mira.
 */
const DIAS_PARA_ENFRIARSE = 14;

function LeadCard({ lead, overlay = false }: { lead: BoardEnrollment; overlay?: boolean }) {
  const dias = diasSinActividad(lead.lastActivityAt);
  const frio = dias !== null && dias >= DIAS_PARA_ENFRIARSE;
  return (
    <div
      className={cn(
        "cursor-grab rounded-md border bg-card p-3 shadow-sm",
        overlay && "rotate-2 shadow-xl"
      )}
    >
      <div className="flex items-center gap-2.5">
        <ContactAvatar name={lead.contact.name} seed={lead.contact.id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lead.contact.name}</p>
          {lead.interestCourseName && (
            <p
              className="truncate text-[11px] font-medium text-primary"
              title={`Curso de interés: ${lead.interestCourseName}`}
            >
              {lead.interestCourseName}
            </p>
          )}
          {/*
            021 — Un lead que nadie toca hace dos semanas es plata que se
            está yendo, y antes se leía igual que uno de ayer. Ahora se dice
            en DÍAS —"hace 23 días" informa; una fecha hay que restarla
            mentalmente— y el que se enfrió se pinta como pendiente.
          */}
          <p
            className={cn(
              "text-[11px]",
              frio ? "font-medium text-warning" : "text-muted-foreground"
            )}
          >
            {dias === null
              ? "Sin actividad todavía"
              : dias === 0
                ? "Hoy"
                : dias === 1
                  ? "Ayer"
                  : `Hace ${dias} días`}
          </p>
        </div>
        {lead.conversationId && (
          <Link
            href={`/inbox?contact=${lead.contact.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Abrir conversación"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageSquareText className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
