import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import type { EncabezadoDeCohorte } from "@/lib/cohort-header";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";

function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-UY", { timeZone: "UTC" }) : "sin fecha de fin";
}

/**
 * 029 — Dónde estoy: miga, nombre, fechas, qué es (especialización o módulo
 * N de M) y, en un módulo, el anterior y el siguiente.
 *
 * Server component: llega armado desde la página y no pide nada.
 */
export function CohortHeader({ header }: { header: EncabezadoDeCohorte }) {
  return (
    <header className="space-y-2 border-b px-6 pb-3 pt-4">
      <Breadcrumb items={header.crumbs} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-foreground">{header.title}</h1>
        {header.badge ? <Badge variant="secondary">{header.badge}</Badge> : null}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {fecha(header.startDate)} — {fecha(header.endDate)}
        </span>
      </div>
      {header.prev || header.next ? (
        <nav aria-label="Módulos vecinos" className="flex items-center gap-2 text-xs">
          {header.prev ? (
            <Link
              href={header.prev.href}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {header.prev.label}
            </Link>
          ) : null}
          {header.prev && header.next ? (
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
          ) : null}
          {header.next ? (
            <Link
              href={header.next.href}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
            >
              {header.next.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
