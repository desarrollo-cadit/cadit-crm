"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import type { CohortRosterDto, RosterEntryDto } from "@/server/enrollments";
import type { CompanyDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EnrollForm } from "@/components/enrollments/enroll-form";
import { EnrollmentCommercialForm } from "@/components/enrollments/enrollment-commercial-form";

type MemberOption = { userId: string; name: string };

const CHECKLIST_ITEMS: {
  key: "termsEmailSentAt" | "softwareInstalledAt" | "academiaOnlineAccessAt";
  label: string;
}[] = [
  { key: "termsEmailSentAt", label: "Correo de T&C enviado" },
  { key: "softwareInstalledAt", label: "Software instalado" },
  { key: "academiaOnlineAccessAt", label: "Acceso a Academia Online" },
];

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * 005 (T027, US3, contracts/cohort-roster.md) — pantalla compartida de
 * camada: lista de inscripciones + checklist editable. Oculta la sección
 * financiera en el cliente cuando el DTO no la trae (FR-016/FR-017) —
 * además de la regla dura de servidor en `buildRosterEntry` (T022).
 *
 * Iteración 2 (feedback en vivo del dueño): (a) los tres ítems del checklist
 * abren un modal de confirmación antes de disparar el PATCH — evita clicks
 * accidentales sobre acciones que no son reversibles con un solo click
 * ("ya mandé el mail"); "Tenía licencia propia" queda excluido, es
 * informativo, no una acción; (b) sección financiera con botón "Editar"
 * para corregir cédula/factura/recibo/empresa/monto/cuotas/vendedor de una
 * inscripción ya creada (antes solo se podían fijar al inscribir).
 */
export function RosterClient({ cohortId }: { cohortId: string }) {
  const [roster, setRoster] = useState<CohortRosterDto | null>(null);
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [editingCommercial, setEditingCommercial] = useState<RosterEntryDto | null>(null);
  const [confirmChecklist, setConfirmChecklist] = useState<{
    enrollmentId: string;
    key: (typeof CHECKLIST_ITEMS)[number]["key"];
    label: string;
    contactName: string;
    next: boolean;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/roster`).catch(() => null);
    if (res?.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res?.ok) return;
    const data = (await res.json()) as CohortRosterDto;
    setRoster(data);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    void (async () => {
      const [companiesRes, teamRes] = await Promise.all([
        fetch("/api/companies").catch(() => null),
        fetch("/api/settings/team").catch(() => null),
      ]);
      if (companiesRes?.ok) {
        const data = (await companiesRes.json()) as { companies: CompanyDto[] };
        setCompanies(data.companies);
      }
      if (teamRes?.ok) {
        const data = (await teamRes.json()) as {
          members: { userId: string; name: string }[];
        };
        setMembers(data.members);
      }
    })();
  }, []);

  async function patchChecklist(
    enrollmentId: string,
    field: (typeof CHECKLIST_ITEMS)[number]["key"] | "hadOwnLicense",
    value: string | boolean | null
  ) {
    await fetch(`/api/enrollments/${enrollmentId}/checklist`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => null);
    void refetch();
  }

  async function assignLicense(enrollmentId: string, softwareId: string) {
    const res = await fetch(`/api/enrollments/${enrollmentId}/license`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ softwareId }),
    }).catch(() => null);
    if (res && !res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      alert(body?.error?.message ?? "No se pudo asignar la licencia");
    }
    void refetch();
  }

  async function unassignLicense(enrollmentId: string) {
    await fetch(`/api/enrollments/${enrollmentId}/license`, {
      method: "DELETE",
    }).catch(() => null);
    void refetch();
  }

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Camada no encontrada
      </div>
    );
  }

  const isFullAccess = (e: RosterEntryDto) => "amount" in e;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">{roster?.cohort.name ?? roster?.cohort.courseName ?? "Camada"}</h2>
          {roster?.cohort.name && (
            <p className="text-xs text-muted-foreground">{roster.cohort.courseName}</p>
          )}
        </div>
        <Button size="sm" onClick={() => setShowEnrollForm(true)}>
          <UserPlus className="h-4 w-4" /> Inscribir alumno
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {!roster ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : roster.enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin inscripciones todavía.
          </p>
        ) : (
          <ul className="space-y-3">
            {roster.enrollments.map((e) => (
              <li key={e.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{e.contact.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.contact.phone ?? "sin teléfono"}
                      {e.contact.email ? ` · ${e.contact.email}` : ""}
                    </p>
                  </div>
                  {isFullAccess(e) && e.amount !== undefined && e.amount !== null && (
                    <Badge variant="secondary">
                      ${e.amount.toLocaleString("es-MX")}
                      {e.installments ? ` · ${e.installments} cuotas` : ""}
                    </Badge>
                  )}
                </div>

                {/* Checklist de onboarding — visible para cualquier rol (FR-014/FR-017). */}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {/* Licencia asignada — leída de license.assigned (DV-004), con
                      acción propia (PUT/DELETE /api/enrollments/:id/license) en
                      vez de un checkbox del checklist genérico. */}
                  {e.checklist.licenseAssigned ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked
                        readOnly
                      />
                      Licencia:{" "}
                      {roster.cohort.software.find(
                        (s) => s.id === e.checklist.licenseSoftwareId
                      )?.name ?? e.checklist.licenseSoftwareId}
                      <button
                        type="button"
                        className="text-muted-foreground underline"
                        onClick={() => void unassignLicense(e.id)}
                      >
                        liberar
                      </button>
                    </span>
                  ) : roster.cohort.software.length > 0 ? (
                    <label className="flex items-center gap-1.5">
                      Licencia:
                      <select
                        className="rounded border bg-background px-1.5 py-0.5"
                        defaultValue=""
                        onChange={(ev) => {
                          if (ev.target.value) void assignLicense(e.id, ev.target.value);
                        }}
                      >
                        <option value="" disabled>
                          asignar…
                        </option>
                        {roster.cohort.software.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="text-muted-foreground">
                      Sin software declarado en la camada
                    </span>
                  )}
                  {CHECKLIST_ITEMS.map((item) => (
                    <label key={item.key} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={Boolean(e.checklist[item.key])}
                        onChange={(ev) =>
                          setConfirmChecklist({
                            enrollmentId: e.id,
                            key: item.key,
                            label: item.label,
                            contactName: e.contact.name,
                            next: ev.target.checked,
                          })
                        }
                      />
                      {item.label}
                      {e.checklist[item.key] && (
                        <span className="text-muted-foreground">
                          ({formatDate(e.checklist[item.key])})
                        </span>
                      )}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={e.checklist.hadOwnLicense}
                      onChange={(ev) =>
                        void patchChecklist(e.id, "hadOwnLicense", ev.target.checked)
                      }
                    />
                    Tenía licencia propia
                  </label>
                </div>

                {/* Sección financiera — SOLO si el DTO la trae (rol con acceso completo). */}
                {isFullAccess(e) && (
                  <div className="mt-3 border-t pt-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                      <span>Cédula: {e.nationalId ?? "—"}</span>
                      <span>Factura: {e.invoiceNumber ?? "—"}</span>
                      <span>Recibo: {e.receiptNumber ?? "—"}</span>
                      <span>Empresa: {e.companyId ?? "—"}</span>
                      {e.paymentNotes && (
                        <span className="col-span-2 sm:col-span-4">
                          Notas: {e.paymentNotes}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1.5 h-auto p-0 text-xs underline"
                      onClick={() => setEditingCommercial(e)}
                    >
                      Editar datos comerciales
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showEnrollForm && (
        <EnrollForm
          cohortId={cohortId}
          companies={companies}
          members={members}
          onClose={() => setShowEnrollForm(false)}
          onSaved={() => {
            setShowEnrollForm(false);
            void refetch();
          }}
          onCompanyCreated={(c) => setCompanies((prev) => [...prev, c])}
        />
      )}

      {editingCommercial && (
        <EnrollmentCommercialForm
          enrollmentId={editingCommercial.id}
          entry={editingCommercial}
          companies={companies}
          members={members}
          onClose={() => setEditingCommercial(null)}
          onSaved={() => {
            setEditingCommercial(null);
            void refetch();
          }}
        />
      )}

      {confirmChecklist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmChecklist(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-semibold">Confirmar cambio</h3>
            <p className="text-sm text-muted-foreground">
              {confirmChecklist.next ? "Marcar" : "Desmarcar"} &quot;{confirmChecklist.label}&quot; para{" "}
              {confirmChecklist.contactName}?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmChecklist(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  void patchChecklist(
                    confirmChecklist.enrollmentId,
                    confirmChecklist.key,
                    confirmChecklist.next ? "now" : null
                  );
                  setConfirmChecklist(null);
                }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
