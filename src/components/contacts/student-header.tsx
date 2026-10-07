import { Mail, Phone } from "lucide-react";
import type { StudentHeaderDto } from "@/server/student-header";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ContactAvatar } from "@/components/avatar";

const ACCESO: Record<
  StudentHeaderDto["portalAccess"],
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  activo: { label: "Con acceso al portal", variant: "success" },
  suspendido: { label: "Acceso al portal suspendido", variant: "warning" },
  sin_acceso: { label: "Sin acceso al portal", variant: "secondary" },
};

/**
 * 2026-10-07 — Dónde estoy y de quién es este legajo: miga, iniciales,
 * nombre, cómo contactarlo y dos estados (portal y cursadas).
 *
 * Misma anatomía que `CohortHeader` (miga arriba, título, datos en una línea,
 * borde abajo) para que las dos pantallas que se alternan desde el roster se
 * lean igual. Server component: llega armado desde la página.
 */
export function StudentHeader({ header }: { header: StudentHeaderDto }) {
  const acceso = ACCESO[header.portalAccess];
  return (
    <header className="space-y-3 border-b px-6 pb-3 pt-4">
      <Breadcrumb items={header.crumbs} />
      <div className="flex items-center gap-3">
        <ContactAvatar name={header.name} seed={header.contactId} size="lg" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-lg font-semibold text-foreground">{header.name}</h1>
            <Badge variant={acceso.variant}>{acceso.label}</Badge>
            <Badge variant="secondary">
              {header.cohortEnrollments === 1
                ? "1 cursada"
                : `${header.cohortEnrollments} cursadas`}
            </Badge>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {header.email || header.phone ? (
              <>
                {header.email ? (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    {header.email}
                  </span>
                ) : null}
                {header.phone ? (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {header.phone}
                  </span>
                ) : null}
              </>
            ) : (
              "Sin datos de contacto"
            )}
          </p>
        </div>
      </div>
    </header>
  );
}
