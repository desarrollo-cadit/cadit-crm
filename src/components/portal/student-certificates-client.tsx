"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyNote,
  PortalCard,
  formatDate,
} from "@/components/portal/student-bits";

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
        setError("No pudimos cargar tus certificados. Probá de nuevo en un momento.");
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
      <EmptyNote title="Todavía no tenés certificados">
        Se emiten al terminar una cursada, cuando cumplís la asistencia mínima
        y aprobás las evaluaciones obligatorias. Cuando salga el tuyo, lo vas a
        encontrar acá con su enlace de verificación.
      </EmptyNote>
    );
  }

  return (
    <div className="space-y-3">
      {certs.map((c) => {
        const anulado = c.revokedAt !== null;
        return (
          <PortalCard key={c.code} className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Award
                className={`mt-0.5 h-6 w-6 shrink-0 ${anulado ? "text-text-4" : "text-brand"}`}
                strokeWidth={1.6}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.courseName}</p>
                <p className="truncate text-xs text-text-3">{c.cohortName}</p>
                <p className="mt-1 text-xs text-text-3">
                  Emitido el {formatDate(c.issuedAt)} · código{" "}
                  <span className="font-mono">{c.code}</span>
                </p>
              </div>
            </div>

            {anulado ? (
              <div className="text-right">
                <p className="text-xs font-medium text-danger">Anulado</p>
                <p className="text-xs text-text-3">
                  El {formatDate(c.revokedAt)} · consultá con la academia
                </p>
              </div>
            ) : (
              <Link
                href={`/verificar/${c.code}`}
                className="inline-flex h-10 shrink-0 items-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                Ver y compartir
              </Link>
            )}
          </PortalCard>
        );
      })}
    </div>
  );
}
