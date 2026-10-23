"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { etiquetaDeEntrada, type EstadoComercial } from "@/lib/recorrido-comercial";
import type {
  EntradaDeHistorialDto,
  RecorridoComercialDto,
  SugerenciaDto,
} from "@/server/recorrido-comercial";

/** Las fechas de un grupo son días (medianoche UTC): se muestran en UTC. */
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const VARIANTE: Record<EstadoComercial, "success" | "secondary" | "outline" | "warning"> = {
  aprobo: "success",
  en_curso: "outline",
  por_empezar: "secondary",
  curso_sin_aprobar: "warning",
};

/**
 * 046 (US1, US3; FR-004, FR-007) — Qué cursó de verdad esta persona y qué le
 * podría interesar después, arriba de la pestaña Seguimiento: quien atiende
 * lo ve sin salir de la pantalla (SC-001).
 *
 * Los datos los decide el servidor con la misma derivación que usan las
 * audiencias (`src/lib/recorrido-comercial.ts`); acá solo se dibujan.
 */
export function RecorridoComercialCard({ contactId }: { contactId: string }) {
  const [data, setData] = useState<RecorridoComercialDto | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const res = await fetch(`/api/contacts/${contactId}/recorrido-comercial`).catch(() => null);
      if (!vigente) return;
      if (!res?.ok) {
        setError(true);
        return;
      }
      setData((await res.json()) as RecorridoComercialDto);
    })();
    return () => {
      vigente = false;
    };
  }, [contactId]);

  if (error) {
    return <p className="text-sm text-muted-foreground">No se pudo cargar el historial de cursos.</p>;
  }
  if (!data) return <Skeleton className="h-28 w-full" />;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Cursos que hizo
          </CardTitle>
          <CardDescription>
            Solo cuenta lo que se dictó: un grupo que nunca salió no figura como cursado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.historial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no cursó nada con la academia.</p>
          ) : (
            <ul className="divide-y" aria-label="Historial de cursos">
              {data.historial.map((e) => (
                <EntradaItem key={e.courseId} entrada={e} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {/* US3-3 — sin sugerencias, la sección no aparece (sin texto vacío). */}
      {data.sugerencias.length > 0 ? <SugerenciasCard sugerencias={data.sugerencias} /> : null}
    </>
  );
}

/** 046 (US3, FR-007) — Los siguientes de lo que cursó, con su próximo grupo. */
function SugerenciasCard({ sugerencias }: { sugerencias: SugerenciaDto[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" aria-hidden />
          Le podría interesar
        </CardTitle>
        <CardDescription>
          Los cursos que la academia recomienda después de lo que cursó, sin los que ya hizo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" aria-label="Cursos sugeridos">
          {sugerencias.map((s) => (
            <li key={s.courseId} className="space-y-0.5 py-2 first:pt-0 last:pb-0">
              <p className="text-sm font-medium">{s.courseName}</p>
              <p className="text-xs text-muted-foreground">Porque cursó {s.porCursos.join(" y ")}</p>
              <p className="text-xs">
                {s.proximoGrupo ? (
                  <>
                    Próximo grupo: {s.proximoGrupo.name} · empieza el {dia(s.proximoGrupo.startDate)}
                  </>
                ) : (
                  <span className="text-muted-foreground">Sin grupo abierto por ahora</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function EntradaItem({ entrada: e }: { entrada: EntradaDeHistorialDto }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{e.courseName}</p>
        <p className="text-xs text-muted-foreground">
          Grupo {e.cohortName} · {dia(e.startDate)}
          {e.endDate ? ` al ${dia(e.endDate)}` : ""}
          {e.veces > 1 ? ` · lo cursó ${e.veces} veces` : ""}
        </p>
        {e.especializacion ? (
          <p className="text-xs text-muted-foreground">
            Especialización · {e.especializacion.modulosAprobados} de {e.especializacion.modulosTotal}{" "}
            {e.especializacion.modulosTotal === 1 ? "módulo aprobado" : "módulos aprobados"}
          </p>
        ) : null}
      </div>
      <Badge variant={VARIANTE[e.estado]}>{etiquetaDeEntrada(e)}</Badge>
    </li>
  );
}
