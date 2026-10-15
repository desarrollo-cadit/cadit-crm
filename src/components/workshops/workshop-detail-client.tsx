"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Pencil, UserPlus } from "lucide-react";
import { BillingPanel } from "@/components/cohorts/billing-panel";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";
import {
  ESTADO_DE_PAGO_LABEL,
  WORKSHOP_ATTENDEE_LABEL,
  WORKSHOP_ATTENDEE_STATUSES,
  WORKSHOP_REGISTRATION_LABEL,
  type EstadoDePago,
  type WorkshopAttendeeStatus,
  type WorkshopSource,
} from "@/lib/workshops";
import { WorkshopEditionFields, type EditionPayload } from "./workshop-edition-form";
import type { EditionRow } from "./workshops-client";
import {
  REGISTRATION_BADGE,
  costLabel,
  horario,
  modalityLabel,
  money,
  workshopDay,
  type Currency,
} from "./workshop-format";

type Edition = EditionRow & {
  name: string | null;
  description: string | null;
  meetingUrl: string | null;
  startsAt: string;
};

type Attendee = {
  id: string;
  enrollmentId: string;
  contact: { id: string; name: string; phone: string | null; email: string | null };
  conversationId: string | null;
  status: WorkshopAttendeeStatus;
  source: WorkshopSource;
  createdAt: string;
  lastNotifyError: string | null;
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
  payment?: {
    amount: number | null;
    currency: Currency | null;
    due: number;
    paid: number;
    state: EstadoDePago;
  };
};

const PAGO_BADGE: Record<EstadoDePago, "success" | "warning" | "secondary"> = {
  pagado: "success",
  pendiente: "warning",
  gratuito: "secondary",
  sin_saldo: "secondary",
};

const ESTADO_BADGE: Record<WorkshopAttendeeStatus, "default" | "secondary" | "success" | "destructive" | "outline"> = {
  anotado: "outline",
  confirmado: "default",
  asistio: "success",
  no_asistio: "secondary",
  cancelado: "destructive",
};

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit" });

/**
 * 033 (US2/US3) — Una edición de taller: sus datos, los contadores por estado,
 * los lugares que quedan y la lista de inscriptos, donde se cambia el estado,
 * se anota a alguien a mano y se registra el pago con la cobranza de siempre.
 */
export function WorkshopDetailClient({
  editionId,
  canEdit,
  canEditAttendees,
  canSeeBilling,
}: {
  editionId: string;
  canEdit: boolean;
  canEditAttendees: boolean;
  canSeeBilling: boolean;
}) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [editando, setEditando] = useState(false);
  const [anotando, setAnotando] = useState(false);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingEdition, setSavingEdition] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/talleres/ediciones/${editionId}`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { edition: Edition; attendees: Attendee[] };
      setEdition(data.edition);
      setAttendees(data.attendees);
    } else if (res?.status === 404) {
      setMissing(true);
    } else {
      notify.error("No pudimos cargar el taller.");
    }
    setLoading(false);
  }, [editionId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function cambiarEstado(a: Attendee, status: WorkshopAttendeeStatus) {
    setBusyId(a.id);
    const res = await fetch(`/api/talleres/inscriptos/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      notify.error(await leerError(res));
      return;
    }
    void refetch();
  }

  async function guardarEdicion(payload: EditionPayload) {
    setSavingEdition(true);
    const res = await fetch(`/api/talleres/ediciones/${editionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSavingEdition(false);
    if (!res?.ok) {
      notify.error(await leerError(res));
      return;
    }
    notify.success("Taller actualizado.");
    setEditando(false);
    void refetch();
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (missing || !edition) {
    return (
      <div className="space-y-2 p-6">
        <p className="text-sm text-muted-foreground">Este taller no existe o fue borrado.</p>
        <Link href="/talleres" className="text-sm underline">
          Volver a Talleres
        </Link>
      </div>
    );
  }

  const conCosto = edition.cost !== null && edition.cost > 0;

  return (
    <div className="space-y-6 p-6">
      <Breadcrumb
        items={[
          { label: "Talleres", href: "/talleres" },
          { label: edition.displayName, href: null },
        ]}
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-semibold">{edition.displayName}</h2>
          <p className="text-sm text-muted-foreground">
            {workshopDay(edition.startDate)}
            {edition.endDate && edition.endDate !== edition.startDate
              ? ` al ${workshopDay(edition.endDate)}`
              : ""}{" "}
            · {horario(edition.startTime, edition.endTime)} · {modalityLabel(edition.modality)}
            {edition.modality === "presencial" && edition.classroom ? ` (${edition.classroom})` : ""}{" "}
            · {costLabel(edition.cost, edition.currency)}
          </p>
          {edition.modality === "online" && (
            <p className="text-sm text-muted-foreground">
              Enlace:{" "}
              {edition.meetingUrl ? (
                <a href={edition.meetingUrl} target="_blank" rel="noreferrer" className="underline">
                  {edition.meetingUrl}
                </a>
              ) : (
                "sin cargar"
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {edition.registrationStatus && (
            <Badge variant={REGISTRATION_BADGE[edition.registrationStatus]}>
              Inscripción {WORKSHOP_REGISTRATION_LABEL[edition.registrationStatus].toLowerCase()}
            </Badge>
          )}
          {canEdit && !editando && (
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          )}
        </div>
      </header>

      {editando && (
        <div className="rounded-md border p-4">
          <WorkshopEditionFields
            initial={edition}
            submitLabel="Guardar cambios"
            busy={savingEdition}
            onSubmit={guardarEdicion}
            onCancel={() => setEditando(false)}
          />
        </div>
      )}

      <section aria-label="Contadores" className="flex flex-wrap gap-2 text-sm">
        {WORKSHOP_ATTENDEE_STATUSES.map((s) => (
          <div key={s} className="rounded-md border px-3 py-2">
            <div className="text-xs text-muted-foreground">{WORKSHOP_ATTENDEE_LABEL[s]}</div>
            <div className="text-lg font-semibold">{edition.counts[s]}</div>
          </div>
        ))}
        <div className="rounded-md border px-3 py-2">
          <div className="text-xs text-muted-foreground">Lugares libres</div>
          <div className="text-lg font-semibold">
            {edition.seatsLeft === null ? "Sin límite" : `${edition.seatsLeft} de ${edition.capacity}`}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Inscriptos</h3>
          {canEditAttendees && !anotando && (
            <Button size="sm" variant="outline" onClick={() => setAnotando(true)}>
              <UserPlus className="h-4 w-4" />
              Anotar a alguien
            </Button>
          )}
        </div>

        {anotando && (
          <AnotarAMano
            editionId={editionId}
            onDone={() => {
              setAnotando(false);
              void refetch();
            }}
            onCancel={() => setAnotando(false)}
          />
        )}

        {attendees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se anotó nadie.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Inscripción</TableHead>
                <TableHead>Origen</TableHead>
                {canSeeBilling && conCosto && <TableHead>Pago</TableHead>}
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendees.map((a) => (
                <FilaInscripto
                  key={a.id}
                  a={a}
                  started={edition.started}
                  conCosto={conCosto}
                  canSeeBilling={canSeeBilling}
                  canEditAttendees={canEditAttendees}
                  busy={busyId === a.id}
                  cobrando={cobrando === a.id}
                  onCobrar={() => setCobrando(cobrando === a.id ? null : a.id)}
                  onEstado={(s) => void cambiarEstado(a, s)}
                  onPagoCerrado={() => void refetch()}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function FilaInscripto({
  a,
  started,
  conCosto,
  canSeeBilling,
  canEditAttendees,
  busy,
  cobrando,
  onCobrar,
  onEstado,
  onPagoCerrado,
}: {
  a: Attendee;
  started: boolean;
  conCosto: boolean;
  canSeeBilling: boolean;
  canEditAttendees: boolean;
  busy: boolean;
  cobrando: boolean;
  onCobrar: () => void;
  onEstado: (s: WorkshopAttendeeStatus) => void;
  onPagoCerrado: () => void;
}) {
  const columnas = 7 + (canSeeBilling && conCosto ? 1 : 0);
  return (
    <>
      <TableRow>
        <TableCell>
          <Link href={`/contacts/${a.contact.id}/legajo`} className="font-medium hover:underline">
            {a.contact.name}
          </Link>
          {a.lastNotifyError && (
            <p className="text-xs text-warning">{a.lastNotifyError}</p>
          )}
        </TableCell>
        <TableCell>{a.contact.phone ?? "—"}</TableCell>
        <TableCell>{a.contact.email ?? "—"}</TableCell>
        <TableCell>
          {canEditAttendees ? (
            <Select
              aria-label={`Estado de ${a.contact.name}`}
              className="h-8 w-36"
              value={a.status}
              disabled={busy}
              onChange={(e) => onEstado(e.target.value as WorkshopAttendeeStatus)}
            >
              {WORKSHOP_ATTENDEE_STATUSES.map((s) => (
                <option
                  key={s}
                  value={s}
                  // La asistencia se marca cuando el taller ya empezó.
                  disabled={!started && (s === "asistio" || s === "no_asistio")}
                >
                  {WORKSHOP_ATTENDEE_LABEL[s]}
                </option>
              ))}
            </Select>
          ) : (
            <Badge variant={ESTADO_BADGE[a.status]}>{WORKSHOP_ATTENDEE_LABEL[a.status]}</Badge>
          )}
        </TableCell>
        <TableCell>{fechaCorta(a.createdAt)}</TableCell>
        <TableCell>{a.source === "web" ? "Web" : "Manual"}</TableCell>
        {canSeeBilling && conCosto && (
          <TableCell>
            {a.payment ? (
              <button type="button" onClick={onCobrar} className="text-left">
                <Badge variant={PAGO_BADGE[a.payment.state]}>
                  {ESTADO_DE_PAGO_LABEL[a.payment.state]}
                </Badge>
                {a.payment.state === "pendiente" && a.payment.currency && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    debe {money(Math.max(0, a.payment.due - a.payment.paid), a.payment.currency)}
                  </span>
                )}
              </button>
            ) : (
              "—"
            )}
          </TableCell>
        )}
        <TableCell>
          {/* FR-014 — Del inscripto a su conversación del CRM. */}
          <Link
            href={`/inbox?contact=${a.contact.id}`}
            className="inline-flex items-center gap-1 text-xs hover:underline"
          >
            <MessageCircle className="h-4 w-4" />
            Conversación
          </Link>
        </TableCell>
      </TableRow>
      {cobrando && canSeeBilling && (
        <TableRow>
          <TableCell colSpan={columnas} className="bg-muted">
            {/* FR-016 — El pago se registra con la cobranza de siempre:
                aparece en Cobranza y en la caja del mes de Finanzas. */}
            <BillingPanel enrollmentId={a.enrollmentId} />
            <Button size="sm" variant="ghost" className="mt-2" onClick={onPagoCerrado}>
              Actualizar estado de pago
            </Button>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

async function leerError(res: Response | null): Promise<string> {
  if (!res) return "No pudimos conectar con el servidor.";
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? "No se pudo guardar.";
}

function AnotarAMano({
  editionId,
  onDone,
  onCancel,
}: {
  editionId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/talleres/ediciones/${editionId}/inscriptos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact: {
          firstName,
          lastName: lastName.trim() || null,
          phone: phone.replace(/\D/g, ""),
          email: email.trim() || null,
        },
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error(await leerError(res));
      return;
    }
    notify.success(res.status === 201 ? "Quedó anotado." : "Esa persona ya estaba anotada.");
    onDone();
  }

  return (
    <form onSubmit={guardar} className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="ins-nombre">Nombre</Label>
        <Input id="ins-nombre" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ins-apellido">Apellido</Label>
        <Input id="ins-apellido" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ins-tel">Teléfono (con código de país)</Label>
        <Input
          id="ins-tel"
          required
          inputMode="tel"
          placeholder="59899123456"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Si ya es contacto con ese teléfono, se anota en su contacto existente.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ins-email">Correo</Label>
        <Input id="ins-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          Anotar
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
