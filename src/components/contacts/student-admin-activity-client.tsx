"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  LogIn,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TimelineKind } from "@/lib/activity-timeline";
import type { AdminActivityDto } from "@/server/student-admin-activity";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const ICONO: Record<TimelineKind, LucideIcon> = {
  mensaje: MessageSquareText,
  asistencia: CalendarCheck,
  cuestionario: ClipboardCheck,
  tema: BookOpen,
  actividad: LogIn,
};

/**
 * 2026-10-07 — La pestaña «Administración» del legajo.
 *
 * Pide sus datos a `/api/contacts/[id]/admin-activity`, que exige
 * `alumnos.auditoria`. La pestaña ni se dibuja sin esa capacidad (lo decide
 * el servidor), pero si se dibujara igual, la ruta contestaría 403: lo que
 * está acá nunca viaja con el legajo.
 */
export function StudentAdminActivityClient({ contactId }: { contactId: string }) {
  const [data, setData] = useState<AdminActivityDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const res = await fetch(`/api/contacts/${contactId}/admin-activity`).catch(() => null);
      if (!vigente) return;
      if (!res?.ok) {
        setError(
          res?.status === 404
            ? "Contacto no encontrado"
            : res?.status === 403
              ? "No tenés permiso para ver la actividad de este alumno"
              : "No se pudo cargar la actividad"
        );
        return;
      }
      setData((await res.json()) as AdminActivityDto);
    })();
    return () => {
      vigente = false;
    };
  }, [contactId]);

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;

  if (!data) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 p-6 xl:grid-cols-2">
      <SignInsCard signIns={data.signIns} />
      <OfflineCoursesCard courses={data.offlineCourses} />
      <TimelineCard timeline={data.timeline} includesMessages={data.timelineIncludesMessages} />
      <ActivityLogCard activity={data.activity} />
    </div>
  );
}

function SignInsCard({ signIns }: { signIns: AdminActivityDto["signIns"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LogIn className="h-4 w-4 text-muted-foreground" aria-hidden />
          Inicios de sesión
        </CardTitle>
        <CardDescription>
          {signIns.lastAt
            ? `Último inicio de sesión: ${fechaHora(signIns.lastAt)}`
            : "Todavía no inició sesión en el portal desde que se registran los ingresos."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {signIns.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Los inicios de sesión se registran a partir de esta versión: los ingresos anteriores
            no quedaron guardados y no se pueden reconstruir.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signIns.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap">{fechaHora(s.at)}</TableCell>
                  <TableCell>{s.device}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {s.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OfflineCoursesCard({ courses }: { courses: AdminActivityDto["offlineCourses"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
          Progreso en cursos offline
        </CardTitle>
        <CardDescription>
          Los cursos que tiene asignados por sus cohortes o de forma individual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tiene cursos offline asignados.</p>
        ) : (
          <ul className="space-y-4">
            {courses.map((c) => (
              <li key={c.courseId} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{c.title}</p>
                  {c.completed ? <Badge variant="success">Completado</Badge> : null}
                  {c.courseRecognized ? (
                    <Badge variant="secondary">Reconocido</Badge>
                  ) : c.recognizedLessons > 0 ? (
                    <Badge variant="secondary">
                      {c.recognizedLessons === 1
                        ? "1 lección reconocida"
                        : `${c.recognizedLessons} lecciones reconocidas`}
                    </Badge>
                  ) : null}
                </div>
                {c.topicsPct === null ? (
                  <p className="text-xs text-muted-foreground">Este curso todavía no tiene temas.</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <Progress
                      value={c.topicsPct}
                      tone={c.completed ? "success" : "brand"}
                      className="flex-1"
                      label={`Temas completados de ${c.title}: ${c.topicsPct}%`}
                    />
                    <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                      {c.topicsDone}/{c.topicsTotal} temas · {c.topicsPct}%
                    </span>
                  </div>
                )}
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Cuestionarios aprobados: {c.quizzesPassed}/{c.quizzesTotal}
                  </span>
                  <span>
                    Intentos: {c.attempts}
                    {c.bestScore !== null ? ` · mejor puntaje ${Math.round(c.bestScore)}%` : ""}
                  </span>
                  <span>Última actividad: {fecha(c.lastActivityAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineCard({
  timeline,
  includesMessages,
}: {
  timeline: AdminActivityDto["timeline"];
  includesMessages: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          Últimas interacciones
        </CardTitle>
        <CardDescription>
          {includesMessages
            ? "Mensajes de WhatsApp, asistencia, cursos offline e ingresos al portal, de lo más reciente a lo más antiguo."
            : "Asistencia, cursos offline e ingresos al portal. Los mensajes de WhatsApp no se muestran porque tu rol no puede ver conversaciones."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay interacciones registradas.</p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((e) => {
              const Icono = ICONO[e.kind];
              return (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-text-2">
                    <Icono className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{e.title}</p>
                    {e.detail ? (
                      <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                    ) : null}
                  </div>
                  <time
                    dateTime={e.at}
                    className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
                  >
                    {fechaHora(e.at)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityLogCard({ activity }: { activity: AdminActivityDto["activity"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          Registro de actividad
        </CardTitle>
        <CardDescription>
          Lo que el sistema anotó sobre esta persona. Se registra a partir de esta versión.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin actividad registrada todavía. El registro empezó con esta versión: lo anterior no
            quedó guardado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{fechaHora(a.createdAt)}</TableCell>
                  <TableCell>{a.label}</TableCell>
                  <TableCell>{a.device}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {a.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
