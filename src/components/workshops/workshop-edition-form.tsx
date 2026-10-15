"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  WORKSHOP_REGISTRATION_LABEL,
  type WorkshopModality,
  type WorkshopRegistrationStatus,
} from "@/lib/workshops";
import { dateInputValue, type Currency } from "./workshop-format";

/** Lo que el formulario manda: el body de `workshopEditionSchema`. */
export type EditionPayload = {
  name: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  modality: WorkshopModality;
  meetingUrl: string | null;
  classroom: string | null;
  capacity: number | null;
  cost: number | null;
  currency: Currency;
  registrationStatus: WorkshopRegistrationStatus;
};

export type EditionInitial = Partial<{
  name: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  modality: WorkshopModality | null;
  meetingUrl: string | null;
  classroom: string | null;
  capacity: number | null;
  cost: number | null;
  currency: Currency;
  registrationStatus: WorkshopRegistrationStatus | null;
}>;

const vacio = (s: string) => (s.trim() ? s.trim() : null);
const entero = (s: string) => (s.trim() ? Number.parseInt(s, 10) : null);

/**
 * 033 (FR-002) — Los datos de una edición de taller: fecha y hora, modalidad
 * (enlace si es online, lugar si es presencial), cupo, costo y estado de la
 * inscripción. Lo usan el alta, la reedición y la edición.
 */
export function WorkshopEditionFields({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  children,
}: {
  initial?: EditionInitial;
  submitLabel: string;
  busy: boolean;
  onSubmit: (payload: EditionPayload) => void;
  onCancel?: () => void;
  /** Campos propios de quien usa el formulario (nombre del taller, curso). */
  children?: React.ReactNode;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(dateInputValue(initial?.startDate ?? null));
  const [endDate, setEndDate] = useState(dateInputValue(initial?.endDate ?? null));
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [modality, setModality] = useState<WorkshopModality>(initial?.modality ?? "online");
  const [meetingUrl, setMeetingUrl] = useState(initial?.meetingUrl ?? "");
  const [classroom, setClassroom] = useState(initial?.classroom ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [pago, setPago] = useState(Boolean(initial?.cost && initial.cost > 0));
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost) : "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [registrationStatus, setRegistrationStatus] = useState<WorkshopRegistrationStatus>(
    initial?.registrationStatus ?? "abierta"
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: vacio(name),
      startDate,
      endDate: vacio(endDate),
      startTime: vacio(startTime),
      endTime: vacio(endTime),
      modality,
      meetingUrl: modality === "online" ? vacio(meetingUrl) : null,
      classroom: modality === "presencial" ? vacio(classroom) : null,
      capacity: entero(capacity),
      cost: pago ? entero(cost) : null,
      currency,
      registrationStatus,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {children}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="ed-name">Nombre de esta edición (opcional)</Label>
          <Input
            id="ed-name"
            value={name}
            maxLength={160}
            placeholder="Si lo dejás vacío, se usa el nombre del taller"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ed-start">Fecha</Label>
          <Input
            id="ed-start"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ed-end">Hasta (si dura más de un día)</Label>
          <Input
            id="ed-end"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ed-start-time">Hora de inicio</Label>
          <Input
            id="ed-start-time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ed-end-time">Hora de fin</Label>
          <Input
            id="ed-end-time"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Modalidad</legend>
        <div className="flex gap-4 text-sm">
          {(["online", "presencial"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                name="ed-modality"
                value={m}
                checked={modality === m}
                onChange={() => setModality(m)}
              />
              {m === "online" ? "Online" : "Presencial"}
            </label>
          ))}
        </div>
        {modality === "online" ? (
          <div className="space-y-1">
            <Label htmlFor="ed-url">Enlace de la reunión</Label>
            <Input
              id="ed-url"
              type="url"
              value={meetingUrl}
              placeholder="https://…"
              onChange={(e) => setMeetingUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              No se publica en la web: solo lo reciben los confirmados en el recordatorio.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="ed-place">Lugar</Label>
            <Input
              id="ed-place"
              value={classroom}
              maxLength={300}
              placeholder="Sede, dirección o aula"
              onChange={(e) => setClassroom(e.target.value)}
            />
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ed-capacity">Cupo (vacío = sin límite)</Label>
          <Input
            id="ed-capacity"
            type="number"
            min={1}
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ed-status">Inscripción</Label>
          <Select
            id="ed-status"
            value={registrationStatus}
            onChange={(e) => setRegistrationStatus(e.target.value as WorkshopRegistrationStatus)}
          >
            {(Object.keys(WORKSHOP_REGISTRATION_LABEL) as WorkshopRegistrationStatus[]).map((s) => (
              <option key={s} value={s}>
                {WORKSHOP_REGISTRATION_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Costo</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="ed-pago" checked={!pago} onChange={() => setPago(false)} />
            Gratuito
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ed-pago" checked={pago} onChange={() => setPago(true)} />
            Con costo
          </label>
        </div>
        {pago && (
          <div className="flex gap-2">
            <Input
              aria-label="Monto"
              type="number"
              min={1}
              required
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <Select
              aria-label="Moneda"
              className="w-28"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="UYU">UYU</option>
              <option value="USD">USD</option>
              <option value="PYG">PYG</option>
            </Select>
          </div>
        )}
        {pago && (
          <p className="text-xs text-muted-foreground">
            Cada inscripción nace con un pago único pendiente por este monto. Si lo cambiás
            después, los ya anotados conservan el suyo.
          </p>
        )}
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
