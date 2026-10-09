"use client";

import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import type { CompanyDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EnrollForm } from "@/components/enrollments/enroll-form";
import type { SellerOption } from "@/lib/vendedores";
import { notify } from "@/lib/notify";

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
        onClick={() => setOpen(true)}
      >
        <GraduationCap className="h-4 w-4" strokeWidth={1.7} />
        {label}
      </Button>

      {open && (
        <EnrollForm
          initialContact={initialContact}
          companies={companies}
          sellers={sellers}
          sellersLoaded={loaded}
          onClose={() => setOpen(false)}
          onSaved={(result) => {
            setOpen(false);
            notify.success(`Inscripción creada en ${result.cohortLabel ?? "la cohorte"}.`, {
              action: { label: "Ver la cohorte", href: `/cohorts/${result.cohortId}` },
            });
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
