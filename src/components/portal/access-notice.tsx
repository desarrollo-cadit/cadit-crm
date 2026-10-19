import { CalendarClock, Lock } from "lucide-react";
import { formatearDia } from "@/lib/access-expiry";

/**
 * 043 — Lo que el alumno lee sobre el vencimiento de su acceso.
 *
 * El servidor decide (`StudentAccessDto`): cuándo vence, si ya venció y si
 * corresponde avisar. Acá solo se dice. Vencido, el contenido NO llegó al
 * navegador: este cartel explica por qué no está, no lo esconde.
 */

export type StudentAccess = {
  until: string | null;
  expired: boolean;
  notice: { tipo: "hasta" | "finalizado"; hasta: string } | null;
};

/** "Acceso finalizado el 1 de octubre de 2026" / "Tenés acceso hasta el …". */
export function textoDeAcceso(access: StudentAccess | undefined): string | null {
  const n = access?.notice;
  if (!n) return null;
  return n.tipo === "finalizado"
    ? `Acceso finalizado el ${formatearDia(n.hasta)}`
    : `Tenés acceso hasta el ${formatearDia(n.hasta)}`;
}

/** El cartel de la cursada: arriba del detalle, solo cuando hay algo que decir. */
export function AvisoDeAcceso({ access }: { access: StudentAccess | undefined }) {
  const texto = textoDeAcceso(access);
  if (!texto) return null;
  const vencido = access?.notice?.tipo === "finalizado";
  return (
    <div
      role="status"
      className={
        vencido
          ? "flex items-start gap-3 rounded-lg border border-border bg-subtle px-4 py-3 text-sm"
          : "flex items-start gap-3 rounded-lg border border-warning-border bg-warning-soft px-4 py-3 text-sm"
      }
    >
      {vencido ? (
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-3" aria-hidden />
      ) : (
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <div className="space-y-0.5">
        <p className="font-medium">{texto}</p>
        <p className="text-text-3">
          {vencido
            ? "Tus notas, tu asistencia y tus certificados siguen acá. Las grabaciones, el material y los avisos de este curso ya no están disponibles."
            : "Después de esa fecha dejás de ver las grabaciones, el material y los avisos de este curso. Tus notas y certificados quedan siempre."}
        </p>
      </div>
    </div>
  );
}
