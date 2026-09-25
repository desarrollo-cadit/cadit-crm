import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OfflineAttemptRow } from "@/server/offline-courses/attempts";

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * cursos-offline (T4) — Quiz attempt history: score and passed, never the
 * answers. Shared by the cohort tab (with the student column) and the
 * per-student panel (without it).
 */
export function OfflineAttemptsTable({
  attempts,
  showStudent,
}: {
  attempts: OfflineAttemptRow[];
  showStudent: boolean;
}) {
  if (attempts.length === 0) {
    return <p className="text-xs text-muted-foreground">Todavía no hay intentos.</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showStudent && <TableHead>Alumno</TableHead>}
            <TableHead>Cuestionario</TableHead>
            <TableHead>Intento</TableHead>
            <TableHead>Puntaje</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attempts.map((a) => (
            <TableRow key={a.attemptId}>
              {showStudent && <TableCell className="font-medium">{a.studentName ?? "—"}</TableCell>}
              <TableCell>
                <span className="block">{a.quizTitle}</span>
                <span className="block text-xs text-muted-foreground">{a.courseTitle}</span>
              </TableCell>
              <TableCell>#{a.attemptNumber}</TableCell>
              <TableCell>{a.scorePercentage.toLocaleString("es-UY")}%</TableCell>
              <TableCell>
                {a.passed ? (
                  <Badge variant="success">Aprobado</Badge>
                ) : (
                  <Badge variant="destructive">No aprobado</Badge>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{when(a.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
