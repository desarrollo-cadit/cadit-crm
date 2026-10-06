"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { CompanyDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EnrollForm, type EnrollSavedResult } from "@/components/enrollments/enroll-form";
import type { SellerOption } from "@/lib/vendedores";

/**
 * Inscribir desde el contacto — botón + formulario de inscripción para las
 * pantallas que arrancan desde una PERSONA (legajo, bandeja, listado), no
 * desde una cohorte.
 *
 * El permiso NO se decide acá: la pantalla que lo usa lo dibuja solo si el
 * servidor resolvió `inscripciones.editar` y bajó el booleano. La ruta
 * `/api/enrollments` tiene su propio `requireCapability`, así que esto es lo
 * que la persona VE, no la barrera.
 *
 * Empresas y vendedores salen de los mismos endpoints que usa el roster de la
 * cohorte (`/api/companies`, `/api/sellers`) y se piden recién al abrir:
 * quien nunca inscribe a nadie no paga esas consultas.
 */
export function EnrollLauncher({
  initialContact,
  label = "Inscribir en una cohorte",
  variant = "outline",
  className,
  onEnrolled,
}: {
  initialContact?: { id: string; name: string };
  label?: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
  /** Para que la pantalla vuelva a pedir sus datos después de inscribir. */
  onEnrolled?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState<EnrollSavedResult | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    void (async () => {
      const [companiesRes, sellersRes] = await Promise.all([
        fetch("/api/companies").catch(() => null),
        fetch("/api/sellers").catch(() => null),
      ]);
      if (companiesRes?.ok) {
        const data = (await companiesRes.json()) as { companies: CompanyDto[] };
        setCompanies(data.companies);
      }
      if (sellersRes?.ok) {
        const data = (await sellersRes.json()) as { sellers: SellerOption[] };
        setSellers(data.sellers);
      }
      setLoaded(true);
    })();
  }, [open, loaded]);

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        size="sm"
        variant={variant}
        onClick={() => {
          setDone(null);
          setOpen(true);
        }}
      >
        <GraduationCap className="h-4 w-4" strokeWidth={1.7} />
        {label}
      </Button>

      {done && (
        <p
          role="status"
          className="rounded-md border border-success-border bg-success-soft px-3 py-2 text-sm text-success"
        >
          Inscripción creada en {done.cohortLabel ?? "la cohorte"}.{" "}
          <Link
            href={`/cohorts/${done.cohortId}`}
            className="font-medium underline underline-offset-2"
          >
            Ver la cohorte
          </Link>
        </p>
      )}

      {open && (
        <EnrollForm
          initialContact={initialContact}
          companies={companies}
          sellers={sellers}
          sellersLoaded={loaded}
          onClose={() => setOpen(false)}
          onSaved={(result) => {
            setOpen(false);
            setDone(result);
            onEnrolled?.();
          }}
          onCompanyCreated={(company) =>
            setCompanies((prev) =>
              [...prev, company].sort((a, b) => a.legalName.localeCompare(b.legalName))
            )
          }
        />
      )}
    </div>
  );
}
