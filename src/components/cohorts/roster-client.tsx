"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, KeyRound, Mail, UserPlus } from "lucide-react";
import type { CohortRosterDto, ModuleLicenseLine, RosterEntryDto } from "@/server/enrollments";
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
import { BillingBulkPanel } from "@/components/cohorts/billing-bulk-panel";
import { BillingPanel } from "@/components/cohorts/billing-panel";
import { OfflineCoursesPanel } from "@/components/offline-courses/offline-courses-panel";
import { EnrollForm } from "@/components/enrollments/enroll-form";
import { EnrollmentCommercialForm } from "@/components/enrollments/enrollment-commercial-form";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkSendsPanel } from "@/components/cohorts/bulk-sends-panel";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { formatSentAt } from "@/lib/schedule-time";
import type { SellerOption } from "@/lib/vendedores";

/**
 * 2026-10-05 (decisión del dueño) — "Software instalado" y "Licencia" son
 * independientes: tildar la instalación NO consume licencia; solo asignarla
 * descuenta del stock. Como en pantalla están uno al lado del otro, el `hint`
 * lo dice donde surge la duda.
 */
const CHECKLIST_ITEMS: {
  key: "termsEmailSentAt" | "softwareInstalledAt" | "academiaOnlineAccessAt";
  label: string;
  hint?: string;
}[] = [
  { key: "termsEmailSentAt", label: "Correo de T&C enviado" },
  {
    key: "softwareInstalledAt",
    label: "Software instalado",
    hint: "Registra la instalación; no descuenta licencias del stock.",
  },
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
    e.checklist.licenseAssigned ||
      e.checklist.hadOwnLicense ||
      // 2026-10-05 — En una especialización la licencia es de los módulos.
      Boolean(e.moduleLicenses?.some((l) => l.licenseAssigned)),
    Boolean(e.checklist.termsEmailSentAt),
    Boolean(e.checklist.softwareInstalledAt),
    Boolean(e.checklist.academiaOnlineAccessAt),
  ];
  return { done: steps.filter(Boolean).length, total: steps.length };
}

/**
 * 007 (feedback en vivo: "que sea una tabla con paginación, es espantoso el
 * formato de hoy en día") — con cohortes de 40 alumnos, una tarjeta por
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
  canViewOfflineCourses = false,
  canEditOfflineCourses = false,
  canManageAccess = false,
}: {
  cohortId: string;
  /** 2026-10-05 — `accesos.gestionar`: ofrecer el acceso al portal a toda la cohorte. */
  canManageAccess?: boolean;
  /** cursos-offline — `academico.ver`: draw the per-student library panel. */
  canViewOfflineCourses?: boolean;
  /** cursos-offline — `academico.editar`: add / remove / reset per student. */
  canEditOfflineCourses?: boolean;
  /** 005 iteración 6 (hallazgo del reviewer) — POST /api/enrollments acepta
   * datos financieros y exige `inscripciones.editar`; soporte no debe ver
   * un botón que le va a devolver 403. */
  canEnroll?: boolean;
}) {
  const [roster, setRoster] = useState<CohortRosterDto | null>(null);
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellersLoaded, setSellersLoaded] = useState(false);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  /** 007 — paginación de la tabla y fila desplegada (una a la vez). */
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [invitingPortal, setInvitingPortal] = useState<string | null>(null);
  /**
   * 012 (T017) — La contraseña temporal se muestra UNA vez, para la única
   * situación en que hace falta: el correo demora y el alumno está al teléfono.
   * No se guarda ni se puede volver a consultar; reinvitar genera otra.
   */
  const [temporaryPassword, setTemporaryPassword] = useState<
    { enrollmentId: string; password: string; emailError: string | null } | null
  >(null);
  const [editingCommercial, setEditingCommercial] = useState<RosterEntryDto | null>(null);
  const [confirmChecklist, setConfirmChecklist] = useState<{
    enrollmentId: string;
    key: (typeof CHECKLIST_ITEMS)[number]["key"];
    label: string;
    contactName: string;
    next: boolean;
  } | null>(null);
  /**
   * 2026-10-05 — Reenviar algo que ya salió pide confirmación, diciendo
   * cuándo salió. `sentAt` null = el sistema no tiene registro del envío
   * (accesos dados antes de que existiera la marca).
   */
  const [resend, setResend] = useState<{
    enrollmentId: string;
    kind: "terms" | "welcome" | "portal";
    contactName: string;
    sentAt: string | null;
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
      // 2026-10-06 — Vendedores de `/api/sellers` (`inscripciones.editar`),
      // no del equipo: hay quien vende sin usar el panel.
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
      setSellersLoaded(true);
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
  async function sendEmail(
    enrollmentId: string,
    kind: "terms" | "welcome",
    contactName: string,
    force = false
  ) {
    setSendingEmail(enrollmentId + kind);
    const res = await fetch(`/api/enrollments/${enrollmentId}/emails`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(force ? { kind, force: true } : { kind }),
    }).catch(() => null);
    setSendingEmail(null);
    if (!res?.ok) {
      setActionError(await errorMessage(res, "No se pudo enviar el correo"));
    } else {
      const data = (await res.json()) as { skipped: boolean; sentAt: string };
      setActionError(null);
      // 2026-10-05 — Ya había salido (quizás en un envío a toda la cohorte):
      // en vez de un aviso suelto, se pregunta si reenviarlo, diciendo cuándo.
      if (data.skipped) setResend({ enrollmentId, kind, contactName, sentAt: data.sentAt });
    }
    void refetch();
  }
  /**
   * 012 (T017) — Invita a UN alumno al portal.
   *
   * 2026-10-05 — El envío a toda la cohorte existe (T017b revertido) en
   * `BulkSendsPanel`. Acá sigue siendo de a uno, y a quien ya tiene acceso
   * solo se lo reinvita con `force` después de confirmarlo: reinvitar le
   * genera una contraseña nueva.
   */
  async function invitePortal(enrollmentId: string, contactName: string, force = false) {
    setInvitingPortal(enrollmentId);
    setTemporaryPassword(null);
    const res = await fetch(`/api/enrollments/${enrollmentId}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(force ? { force: true } : {}),
    }).catch(() => null);
    setInvitingPortal(null);

    if (!res?.ok) {
      setActionError(await errorMessage(res, "No se pudo dar el acceso al portal"));
    } else {
      const data = (await res.json()) as {
        skipped?: boolean;
        emailSentAt: string | null;
        existingAccount: boolean;
        temporaryPassword: string | null;
        emailError: string | null;
      };
      if (data.skipped) {
        setActionError(null);
        setResend({ enrollmentId, kind: "portal", contactName, sentAt: data.emailSentAt });
      } else if (data.temporaryPassword) {
        setTemporaryPassword({
          enrollmentId,
          password: data.temporaryPassword,
          emailError: data.emailError,
        });
        setActionError(null);
      } else {
        // Ya tenía cuenta en el sistema (por ejemplo, alguien del equipo que
        // además cursa): se le habilitó el portal sin tocarle la contraseña.
        setActionError(
          "Esa persona ya tenía cuenta; se le habilitó el portal y entra con su contraseña de siempre."
        );
      }
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
        Cohorte no encontrada
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
          <h2 className="font-semibold">{roster?.cohort.name ?? roster?.cohort.courseName ?? "Cohorte"}</h2>
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
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-danger-border px-4 py-3">
            <p className="text-sm text-destructive">{actionError}</p>
            <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>
              Cerrar
            </Button>
          </div>
        )}
        {!roster ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : roster.enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin inscripciones todavía.
          </p>
        ) : (
          <div className="space-y-3">
            {/*
              022 — Cargar la cobranza de la cohorte entera.
              Va acá, arriba del roster, porque es donde están las
              inscripciones sobre las que actúa. El panel se esconde solo
              cuando no queda ninguna sin cargar (FR-007).
            */}
            {showFinance && (
              <BillingBulkPanel cohortId={cohortId} onDone={() => void refetch()} />
            )}
            {/* 2026-10-05 — Términos, bienvenida y acceso al portal a toda
                la cohorte, con confirmación y de a uno. */}
            <BulkSendsPanel
              cohortId={cohortId}
              canManageAccess={canManageAccess}
              onProgress={refetch}
            />
            <div className="rounded-lg border">
              <Table>
                <TableHeader className="bg-subtle">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Alumno</TableHead>
                    <TableHead>Contacto</TableHead>
                    {showFinance && <TableHead className="text-right">Monto</TableHead>}
                    {showFinance && <TableHead>Vendedor</TableHead>}
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
                          <TableCell className="font-medium">
                            {/* 013 (T029) — Al legajo desde donde se mira al
                                alumno: el roster es la pantalla en la que
                                surge la pregunta "¿cómo viene esta persona?". */}
                            <a
                              href={`/contacts/${e.contact.id}/legajo`}
                              className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                            >
                              {e.contact.name}
                            </a>
                          </TableCell>
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
                          {showFinance && (
                            <TableCell className="text-xs">
                              <SellerCell
                                entry={e}
                                canEdit={canEnroll}
                                onEdit={() => setEditingCommercial(e)}
                              />
                            </TableCell>
                          )}
                          <TableCell className="text-xs">
                            {e.moduleLicenses?.some((l) => l.licenseAssigned) ? (
                              <Badge variant="success">
                                {e.moduleLicenses
                                  .filter((l) => l.licenseAssigned)
                                  .map(
                                    (l) =>
                                      l.software.find((s) => s.id === l.licenseSoftwareId)?.name ??
                                      "Asignada"
                                  )
                                  .join(", ")}
                              </Badge>
                            ) : e.checklist.licenseAssigned ? (
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
                                  ? "bg-brand-tint text-primary"
                                  : "bg-secondary text-muted-foreground"
                              )}
                            >
                              {progress.done}/{progress.total}
                            </span>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow className="bg-subtle hover:bg-subtle">
                            <TableCell colSpan={showFinance ? 6 : 5} className="px-4 py-3">
                              {/* Checklist de onboarding — visible para cualquier rol (FR-014/FR-017). */}
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Licencia asignada — leída de license.assigned (DV-004), con
                      acción propia (PUT/DELETE /api/enrollments/:id/license) en
                      vez de un checkbox del checklist genérico. */}
                  {roster.cohort.isSpecialization ? (
                    <ModuleLicenses
                      lines={e.moduleLicenses ?? []}
                      onAssign={(childId, softwareId) => void assignLicense(childId, softwareId)}
                      onUnassign={(childId) => void unassignLicense(childId)}
                    />
                  ) : e.checklist.licenseAssigned ? (
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
                    <Fragment key={item.key}>
                    <label className="flex items-center gap-1.5" title={item.hint}>
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
                    {/* 2026-10-05 — Reenviar los términos: con confirmación y
                        diciendo cuándo salieron. */}
                    {item.key === "termsEmailSentAt" && e.checklist.termsEmailSentAt && (
                      <button
                        type="button"
                        className="-ml-1.5 text-muted-foreground underline"
                        onClick={() =>
                          setResend({
                            enrollmentId: e.id,
                            kind: "terms",
                            contactName: e.contact.name,
                            sentAt: e.checklist.termsEmailSentAt,
                          })
                        }
                      >
                        reenviar
                      </button>
                    )}
                    </Fragment>
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
                  {(roster.cohort.software.length > 0 ||
                    (e.moduleLicenses ?? []).some((l) => l.software.length > 0)) && (
                    <p className="basis-full text-muted-foreground">
                      Solo asignar una licencia descuenta del stock; marcar
                      «Software instalado» registra la instalación y no consume
                      licencias.
                    </p>
                  )}
                              </div>

                              {/* 007 — Bienvenida + invitación al grupo. Separado del
                                  checklist porque no es un paso de onboarding a tildar:
                                  es una acción que manda un correo. */}
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={sendingEmail === e.id + "welcome"}
                                  onClick={() =>
                                    e.welcomeEmailSentAt
                                      ? setResend({
                                          enrollmentId: e.id,
                                          kind: "welcome",
                                          contactName: e.contact.name,
                                          sentAt: e.welcomeEmailSentAt,
                                        })
                                      : void sendEmail(e.id, "welcome", e.contact.name)
                                  }
                                >
                                  <Mail className="h-4 w-4" />
                                  {sendingEmail === e.id + "welcome"
                                    ? "Enviando…"
                                    : e.welcomeEmailSentAt
                                      ? "Reenviar bienvenida + grupo"
                                      : "Enviar bienvenida + grupo"}
                                </Button>
                                {e.welcomeEmailSentAt ? (
                                  <span className="text-muted-foreground">
                                    Enviada el {formatSentAt(e.welcomeEmailSentAt)}
                                  </span>
                                ) : !roster.cohort.whatsappGroupLink ? (
                                  <span className="text-muted-foreground">
                                    Cargá el enlace del grupo en la cohorte para poder enviarla.
                                  </span>
                                ) : null}
                              </div>

                              {/* 012 (T017) — Acceso al portal del alumno.
                                  Explícito: inscribir NO habilita nada. El
                                  envío a toda la cohorte vive en el panel de
                                  arriba (2026-10-05). */}
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                {e.portalAccess.granted && e.portalAccess.suspended ? (
                                  <span className="text-muted-foreground">
                                    Acceso al portal suspendido.
                                  </span>
                                ) : e.portalAccess.granted ? (
                                  <>
                                    <span className="text-muted-foreground">
                                      Tiene acceso al portal.{" "}
                                      {e.portalAccess.emailSentAt
                                        ? `El correo de acceso se envió el ${formatSentAt(e.portalAccess.emailSentAt)}.`
                                        : "No hay registro del envío del correo de acceso."}
                                    </span>
                                    <button
                                      type="button"
                                      className="text-muted-foreground underline"
                                      disabled={invitingPortal === e.id}
                                      onClick={() =>
                                        setResend({
                                          enrollmentId: e.id,
                                          kind: "portal",
                                          contactName: e.contact.name,
                                          sentAt: e.portalAccess.emailSentAt,
                                        })
                                      }
                                    >
                                      {invitingPortal === e.id
                                        ? "Reenviando…"
                                        : "Reenviar acceso con una contraseña nueva"}
                                    </button>
                                  </>
                                ) : e.portalAccess.blockedReason ? (
                                  /* T017d — el motivo, en vez de un botón que
                                     va a fallar: son 6 de los 340 alumnos. */
                                  <span className="text-muted-foreground">
                                    {e.portalAccess.blockedReason}
                                  </span>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={invitingPortal === e.id}
                                    onClick={() => void invitePortal(e.id, e.contact.name)}
                                  >
                                    <KeyRound className="h-4 w-4" />
                                    {invitingPortal === e.id
                                      ? "Dando acceso…"
                                      : "Dar acceso al portal"}
                                  </Button>
                                )}

                                {temporaryPassword?.enrollmentId === e.id && (
                                  <span className="rounded border border-warning-border bg-warning-soft px-2 py-1">
                                    {/* 014 — Decir que salió el correo cuando no
                                        salió es mentir sobre lo único que la
                                        persona necesita para entrar. */}
                                    {temporaryPassword.emailError ? (
                                      <>
                                        Creamos el acceso, pero el correo no se pudo
                                        enviar ({temporaryPassword.emailError}). La
                                        contraseña temporal es{" "}
                                        <code className="font-mono font-semibold">
                                          {temporaryPassword.password}
                                        </code>
                                        : compartila por otro medio, porque no se va a
                                        volver a mostrar.
                                      </>
                                    ) : (
                                      <>
                                        Acceso creado y correo enviado. Contraseña
                                        temporal:{" "}
                                        <code className="font-mono font-semibold">
                                          {temporaryPassword.password}
                                        </code>{" "}
                                        (no se va a volver a mostrar).
                                      </>
                                    )}
                                  </span>
                                )}
                              </div>

                              {/* cursos-offline — Library access for THIS
                                  student (exceptions over the cohort) and
                                  their quiz attempts. Not financial, so it
                                  sits outside the financial block. */}
                              {canViewOfflineCourses && (
                                <div className="mt-3 border-t pt-3">
                                  <OfflineCoursesPanel
                                    enrollmentId={e.id}
                                    canEdit={canEditOfflineCourses}
                                  />
                                </div>
                              )}

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

                                  {/* 008 — Cuotas y pagos. Va dentro del bloque
                                      financiero: es la misma sección y el mismo
                                      gate de rol (FR-016). */}
                                  <div className="mt-3 border-t pt-3">
                                    <BillingPanel enrollmentId={e.id} />
                                  </div>
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
          sellers={sellers}
          sellersLoaded={sellersLoaded}
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
          sellers={sellers}
          sellersLoaded={sellersLoaded}
          onClose={() => setEditingCommercial(null)}
          onSaved={() => {
            setEditingCommercial(null);
            void refetch();
          }}
        />
      )}

      {confirmChecklist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
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
              <p className="mt-2 rounded-md border border-brand-soft bg-brand-tint p-2 text-xs text-foreground">
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
                    void sendEmail(
                      confirmChecklist.enrollmentId,
                      "terms",
                      confirmChecklist.contactName
                    );
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

      {resend && (
        <ConfirmSendDialog
          title={RESEND_COPY[resend.kind].title}
          confirmLabel={RESEND_COPY[resend.kind].confirm}
          busy={
            resend.kind === "portal"
              ? invitingPortal === resend.enrollmentId
              : sendingEmail === resend.enrollmentId + resend.kind
          }
          onClose={() => setResend(null)}
          onConfirm={() => {
            const r = resend;
            setResend(null);
            if (r.kind === "portal") void invitePortal(r.enrollmentId, r.contactName, true);
            else void sendEmail(r.enrollmentId, r.kind, r.contactName, true);
          }}
        >
          <p className="text-foreground">{resendSentence(resend)}</p>
          <p>{RESEND_COPY[resend.kind].effect}</p>
        </ConfirmSendDialog>
      )}
    </div>
  );
}

const RESEND_COPY: Record<
  "terms" | "welcome" | "portal",
  { title: string; confirm: string; effect: string }
> = {
  terms: {
    title: "Reenviar los términos de la licencia",
    confirm: "Reenviar los términos",
    effect: "Se le enviará otra copia. Un correo enviado no se puede deshacer.",
  },
  welcome: {
    title: "Reenviar la bienvenida",
    confirm: "Reenviar la bienvenida",
    effect: "Se le enviará otra copia. Un correo enviado no se puede deshacer.",
  },
  portal: {
    title: "Reenviar el acceso al portal",
    confirm: "Reenviar con una contraseña nueva",
    effect:
      "Se generará una contraseña temporal nueva y la anterior dejará de servir: si la persona ya entraba al portal, va a tener que usar la nueva.",
  },
};

/** "Ya se envió el 5 oct. 2026, 14:32 a Ana Pérez." — o que no hay registro. */
function resendSentence(r: { contactName: string; sentAt: string | null }) {
  return r.sentAt
    ? `Ya se envió el ${formatSentAt(r.sentAt)} a ${r.contactName}.`
    : `${r.contactName} ya tiene acceso al portal; no hay registro de cuándo se le envió el correo de acceso.`;
}

/**
 * 2026-10-05 (decisión del dueño) — Licencias en el roster de una
 * especialización: una línea por módulo.
 *
 * La especialización no tiene software propio (es de cada módulo), así que
 * acá la licencia se asigna a la inscripción del MÓDULO, con el software de
 * ese módulo, usando la misma ruta que el roster del módulo. Antes no había
 * dónde asignarla y el equipo tildaba "Software instalado" creyendo que
 * descontaba stock.
 */
function ModuleLicenses({
  lines,
  onAssign,
  onUnassign,
}: {
  lines: ModuleLicenseLine[];
  onAssign: (childEnrollmentId: string, softwareId: string) => void;
  onUnassign: (childEnrollmentId: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <span className="basis-full text-muted-foreground">
        La especialización todavía no tiene módulos.
      </span>
    );
  }
  return (
    <ul className="basis-full space-y-1" aria-label="Licencias por módulo">
      {lines.map((l, i) => (
        <li key={l.enrollmentId ?? `sin-${i}`} className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{l.moduleName}:</span>
          {!l.enrollmentId ? (
            <span className="text-muted-foreground">no está inscripto en este módulo.</span>
          ) : l.licenseAssigned ? (
            <>
              <Checkbox checked readOnly aria-label={`Licencia asignada en ${l.moduleName}`} />
              Licencia:{" "}
              {l.software.find((s) => s.id === l.licenseSoftwareId)?.name ?? l.licenseSoftwareId}
              <button
                type="button"
                className="text-muted-foreground underline"
                onClick={() => onUnassign(l.enrollmentId!)}
              >
                liberar
              </button>
            </>
          ) : l.software.length > 0 ? (
            <label className="flex items-center gap-1.5">
              Licencia:
              <Select
                className="h-7 w-auto px-1.5 py-0.5 text-xs"
                defaultValue=""
                aria-label={`Asignar licencia en ${l.moduleName}`}
                onChange={(ev) => {
                  if (ev.target.value) onAssign(l.enrollmentId!, ev.target.value);
                }}
              >
                <option value="" disabled>
                  asignar…
                </option>
                {l.software.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <span className="text-muted-foreground">el módulo no tiene software declarado.</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 2026-10-06 — El vendedor de cada venta, al lado del alumno.
 *
 * Viaja sólo con `cobranza.ver` (es el dato con el que se paga una comisión),
 * igual que el monto de la columna de al lado. "Sin vendedor" se ve a simple
 * vista y, para quien puede editar datos comerciales, abre la edición: es la
 * pantalla donde se corrige.
 */
function SellerCell({
  entry,
  canEdit,
  onEdit,
}: {
  entry: RosterEntryDto;
  canEdit: boolean;
  onEdit: () => void;
}) {
  if (entry.sellerRequired === false) {
    return (
      <span className="text-muted-foreground" title="El vendedor figura en la inscripción de la especialización">
        —
      </span>
    );
  }
  if (entry.seller) {
    return (
      <span className="whitespace-nowrap">
        {entry.seller.name}
        {entry.seller.archived && <span className="ml-1 text-muted-foreground">(archivado)</span>}
      </span>
    );
  }
  if (!canEdit) return <Badge variant="warning">Sin vendedor</Badge>;
  return (
    <button
      type="button"
      onClick={onEdit}
      title="Indicar el vendedor de esta venta"
      className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Badge variant="warning" className="cursor-pointer underline-offset-2 hover:underline">
        Sin vendedor
      </Badge>
    </button>
  );
}
