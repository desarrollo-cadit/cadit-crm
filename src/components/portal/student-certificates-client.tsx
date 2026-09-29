"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalCard, formatDate } from "@/components/portal/student-bits";
import { ChipDeEstado, Tarjeta } from "@/components/portal/campus";

/**
 * 015 (US6, FR-009) — Mis certificados.
 *
 * El anulado **se muestra y no se esconde**: quien lo tuvo y lo perdió
 * necesita saber que pasó, y a quién preguntarle. Lo que no puede es
 * descargarse ni compartirse como válido.
 */

type Certificate = {
  code: string;
  issuedAt: string;
  revokedAt: string | null;
  courseName: string;
  cohortName: string;
};

export function StudentCertificatesClient() {
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/portal/me/certificados").catch(() => null);
      if (!res?.ok) {
        setError("No se pudieron cargar tus certificados. Intentá nuevamente más tarde.");
        return;
      }
      const body = (await res.json()) as { certificates: Certificate[] };
      setCerts(body.certificates);
    })();
  }, []);

  if (error) {
    return (
      <PortalCard className="border-danger-border bg-danger-soft">
        <p className="text-sm text-danger">{error}</p>
      </PortalCard>
    );
  }

  if (!certs) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (certs.length === 0) {
    return (
      // El lugar del certificado ya existe: se muestra vacío, no se oculta.
      <PortalCard className="flex flex-col items-start gap-4 border-dashed p-6 sm:p-8">
        <ChipDeEstado tono="neutro">Sin emitir</ChipDeEstado>
        <p className="text-2xl font-bold tracking-tight">
          No tenés certificados emitidos
        </p>
        <p className="max-w-prose text-sm text-text-2">
          Los certificados se emiten al finalizar el curso, con la asistencia
          mínima cumplida y las evaluaciones obligatorias aprobadas. Los
          requisitos pendientes de cada curso figuran en su recorrido. Una vez
          emitido, tu certificado estará disponible aquí con su enlace de
          verificación.
        </p>
        <Link
          href="/portal"
          className="inline-flex min-h-10 items-center rounded-md border border-border-strong px-4 text-sm font-semibold transition-colors hover:bg-accent"
        >
          Ver mis cursos
        </Link>
      </PortalCard>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {certs.map((c) => {
        const anulado = c.revokedAt !== null;
        return (
          anulado ? (
            // FR-009 — el anulado se ve, pero no se ofrece.
            <PortalCard
              key={c.code}
              className="flex flex-wrap items-center justify-between gap-4 border-dashed"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-2">{c.courseName}</p>
                <p className="truncate text-xs text-text-3">{c.cohortName}</p>
                <p className="mt-1 text-xs text-text-3">
                  Emitido el {formatDate(c.issuedAt)} · código{" "}
                  <span className="font-mono">{c.code}</span>
                </p>
              </div>
              <div className="sm:text-right">
                <ChipDeEstado tono="atencion">Anulado</ChipDeEstado>
                <p className="mt-2 text-xs text-text-3">
                  Anulado el {formatDate(c.revokedAt)}. Para más información,
                  comunicate con la academia.
                </p>
              </div>
            </PortalCard>
          ) : (
            <Tarjeta key={c.code} as="article" className="p-0 sm:p-0">
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-tight tracking-tight">
                    {c.courseName}
                  </p>
                  <p className="truncate text-sm text-text-3">{c.cohortName}</p>
                  <p className="mt-1 text-xs text-text-3">
                    Emitido el {formatDate(c.issuedAt)} · código{" "}
                    <span className="font-mono">{c.code}</span>
                  </p>
                </div>
                <Link
                  href={`/verificar/${c.code}`}
                  className="inline-flex min-h-10 shrink-0 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Ver y compartir
                </Link>
              </div>
            </Tarjeta>
          )
        );
      })}
    </div>
  );
}
