"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, Mail, UserPlus } from "lucide-react";
import type { CohortRosterDto, RosterEntryDto } from "@/server/enrollments";
import type { CompanyDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, formatAmount } from "@/lib/utils";
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

// 007 — `formatAmount` (símbolo por moneda) vive en `@/lib/utils`: el panel de
// facturación imprime los mismos importes y no deben divergir.

/**
 * 007 — cuántos de los 4 pasos de onboarding están hechos, para poder verlo
 * de un vistazo en la tabla sin desplegar la fila.
 */
function checklistProgress(e: RosterEntryDto): { done: number; total: number } {
  const steps = [
    e.checklist.licenseAssigned || e.checklist.hadOwnLicense,
    Boolean(e.checklist.termsEmailSentAt),
    Boolean(e.checklist.softwareInstalledAt),
    Boolean(e.checklist.academiaOnlineAccessAt),
  ];
  return { done: steps.filter(Boolean).length, total: steps.length };
}

/**
 * 007 (feedback en vivo: "que sea una tabla con paginación, es espantoso el
 * formato de hoy en día") — con camadas de 40 alumnos, una tarjeta por
 * inscripción con TODO desplegado es una pared imposible de recorrer.
 */
const PAGE_SIZE = 20;

/**
 * 005 (T027, US3, contracts/cohort-roster.md) — pantalla compartida de
 * cohorte: lista de inscripciones + checklist editable. Oculta la sección
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
export function RosterClient({
  cohortId,
  canEnroll = true,
}: {
  cohortId: string;
  /** 005 iteración 6 (hallazgo del reviewer) — POST /api/enrollments acepta
   * datos financieros y ahora exige `requireFullAccess`; soporte no debe ver
   * un botón que le va a devolver 403. */
  canEnroll?: boolean;
}) {
  const [roster, setRoster] = useState<CohortRosterDto | null>(null);
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  /** 007 — paginación de la tabla y fila desplegada (una a la vez). */
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [editingCommercial, setEditingCommercial] = useState<RosterEntryDto | null>(null);
  const [confirmChecklist, setConfirmChecklist] = useState<{
    enrollmentId: string;
    key: (typeof CHECKLIST_ITEMS)[number]["key"];
    label: string;
    contactName: string;
    next: boolean;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  /** Mensaje de error de las acciones del roster, mostrado inline. */
  async function errorMessage(res: Response | null, fallback: string) {
    const body = (await res?.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return body?.error?.message ?? fallback;
  }

  /**
   * Un fallo acá NO puede pasar desapercibido: el checklist es el registro de
   * "ya le mandé el correo de T&C" / "ya le instalé el software". Si el PATCH
   * falla y solo se refetchea, el tilde vuelve atrás sin explicación y el
   * operador cree que quedó guardado.
   */
  async function patchChecklist(
    enrollmentId: string,
    field: (typeof CHECKLIST_ITEMS)[number]["key"] | "hadOwnLicense",
    value: string | boolean | null
  ) {
    const res = await fetch(`/api/enrollments/${enrollmentId}/checklist`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => null);
    if (!res?.ok) {
      setActionError(await errorMessage(res, "No se pudo guardar el cambio del checklist"));
    } else {
      setActionError(null);
    }
    void refetch();
  }

  /**
   * 007 — Envío real del correo. Tildar "Correo de T&C enviado" ya no es solo
   * un registro: dispara el correo al alumno y la marca la escribe el servidor
   * DESPUÉS de que M365 acepta el envío. Si falla, el tilde no queda puesto y
   * el error se muestra: lo peor sería que el equipo crea que se mandó.
   */
  async function sendEmail(enrollmentId: string, kind: "terms" | "welcome") {
    setSendingEmail(enrollmentId + kind);
    const res = await fetch(`/api/enrollments/${enrollmentId}/emails`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch(() => null);
    setSendingEmail(null);
    if (!res?.ok) {
      setActionError(await errorMessage(res, "No se pudo enviar el correo"));
    } else {
      const data = (await res.json()) as { skipped: boolean };
      setActionError(
        data.skipped ? "Ese correo ya se había enviado; no se reenvió." : null
      );
    }
    void refetch();
  }
  async function assignLicense(enrollmentId: string, softwareId: string) {
    const res = await fetch(`/api/enrollments/${enrollmentId}/license`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ softwareId }),
    }).catch(() => null);
    if (!res?.ok) {
      setActionError(await errorMessage(res, "No se pudo asignar la licencia"));
    } else {
      setActionError(null);
    }
    void refetch();
  }

  async function unassignLicense(enrollmentId: string) {
    const res = await fetch(`/api/enrollments/${enrollmentId}/license`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res?.ok) {
      setActionError(await errorMessage(res, "No se pudo liberar la licencia"));
    } else {
      setActionError(null);
    }
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
  // La columna de monto existe solo si el rol la puede ver (FR-016/FR-017):
  // se decide con la primera fila, porque el servidor recorta el DTO entero.
  const showFinance = Boolean(roster?.enrollments[0] && isFullAccess(roster.enrollments[0]));

  const total = roster?.enrollments.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart = Math.min(page, totalPages - 1) * PAGE_SIZE;
  const pageEntries = roster?.enrollments.slice(pageStart, pageStart + PAGE_SIZE) ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">{roster?.cohort.name ?? roster?.cohort.courseName ?? "Camada"}</h2>
          {roster?.cohort.name && (
            <p className="text-xs text-muted-foreground">{roster.cohort.courseName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/cohorts/${cohortId}/export`}
            download
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </a>
          {canEnroll && (
            <Button size="sm" onClick={() => setShowEnrollForm(true)}>
              <UserPlus className="h-4 w-4" /> Inscribir alumno
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {actionError && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-destructive/50 px-4 py-3">
            <p className="text-sm text-destructive">{actionError}</p>
            <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>
              Cerrar
            </Button>
          </div>
        )}
        {!roster ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : roster.enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin inscripciones todavía.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Alumno</TableHead>
                    <TableHead>Contacto</TableHead>
                    {showFinance && <TableHead className="text-right">Monto</TableHead>}
                    <TableHead>Licencia</TableHead>
                    <TableHead>Onboarding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageEntries.map((e) => {
                    const progress = checklistProgress(e);
                    const open = expanded === e.id;
                    return (
                      <Fragment key={e.id}>
                        <TableRow>
                          <TableCell>
                            <button
                              type="button"
                              aria-label={open ? "Contraer" : "Ver detalle"}
                              aria-expanded={open}
                              className="rounded p-1 text-muted-foreground hover:bg-accent"
                              onClick={() => setExpanded(open ? null : e.id)}
                            >
                              <ChevronRight
                                className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
                              />
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">{e.contact.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {e.contact.phone ?? "sin teléfono"}
                            {e.contact.email && (
                              <span className="block truncate">{e.contact.email}</span>
                            )}
                          </TableCell>
                          {showFinance && (
                            <TableCell className="whitespace-nowrap text-right">
                              {formatAmount(e.amount, e.currency)}
                              {e.installments ? (
                                <span className="block text-xs text-muted-foreground">
                                  {e.installments} cuotas
                                </span>
                              ) : null}
                            </TableCell>
                          )}
                          <TableCell className="text-xs">
                            {e.checklist.licenseAssigned ? (
                              <Badge variant="success">
                                {roster.cohort.software.find(
                                  (s) => s.id === e.checklist.licenseSoftwareId
                                )?.name ?? "Asignada"}
                              </Badge>
                            ) : e.checklist.hadOwnLicense ? (
                              <span className="text-muted-foreground">propia</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5",
                                progress.done === progress.total
                                  ? "bg-primary/15 text-primary"
                                  : "bg-secondary text-muted-foreground"
                              )}
                            >
                              {progress.done}/{progress.total}
                            </span>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                            <TableCell colSpan={showFinance ? 6 : 5} className="px-4 py-3">
                              {/* Checklist de onboarding — visible para cualquier rol (FR-014/FR-017). */}
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Licencia asignada — leída de license.assigned (DV-004), con
                      acción propia (PUT/DELETE /api/enrollments/:id/license) en
                      vez de un checkbox del checklist genérico. */}
                  {e.checklist.licenseAssigned ? (
                    <span className="flex items-center gap-1.5">
                      <Checkbox checked readOnly />
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
                      <Select
                        className="h-7 w-auto px-1.5 py-0.5 text-xs"
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
                      </Select>
                    </label>
                  ) : (
                    <span className="text-muted-foreground">
                      Sin software declarado en la cohorte
                    </span>
                  )}
                  {CHECKLIST_ITEMS.map((item) => (
                    <label key={item.key} className="flex items-center gap-1.5">
                      <Checkbox
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
                    <Checkbox
                      checked={e.checklist.hadOwnLicense}
                      onChange={(ev) =>
                        void patchChecklist(e.id, "hadOwnLicense", ev.target.checked)
                      }
                    />
                    Tenía licencia propia
                  </label>
                              </div>

                              {/* 007 — Bienvenida + invitación al grupo. Separado del
                                  checklist porque no es un paso de onboarding a tildar:
                                  es una acción que manda un correo. */}
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={sendingEmail === e.id + "welcome"}
                                  onClick={() => void sendEmail(e.id, "welcome")}
                                >
                                  <Mail className="h-4 w-4" />
                                  {sendingEmail === e.id + "welcome"
                                    ? "Enviando…"
                                    : "Enviar bienvenida + grupo"}
                                </Button>
                                {e.welcomeEmailSentAt ? (
                                  <span className="text-muted-foreground">
                                    Enviada el {formatDate(e.welcomeEmailSentAt)}
                                  </span>
                                ) : !roster.cohort.whatsappGroupLink ? (
                                  <span className="text-muted-foreground">
                                    Cargá el enlace del grupo en la camada para poder enviarla.
                                  </span>
                                ) : null}
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
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* 007 — paginación: 20 filas por página. */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                <span>
                  Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, total)} de {total}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {page + 1} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
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
            {confirmChecklist.key === "termsEmailSentAt" && confirmChecklist.next && (
              <p className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs text-foreground">
                Se le va a ENVIAR el correo con los términos de la licencia ATC.
                Un correo no se puede deshacer.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmChecklist(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  // Marcar "T&C enviado" MANDA el correo; desmarcar es una
                  // corrección manual y no dispara nada.
                  if (confirmChecklist.key === "termsEmailSentAt" && confirmChecklist.next) {
                    void sendEmail(confirmChecklist.enrollmentId, "terms");
                  } else {
                    void patchChecklist(
                      confirmChecklist.enrollmentId,
                      confirmChecklist.key,
                      confirmChecklist.next ? "now" : null
                    );
                  }
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
