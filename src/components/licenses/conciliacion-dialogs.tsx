"use client";

import { useEffect, useState } from "react";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { ContactPicker } from "@/components/contacts/contact-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ContactDto } from "@/lib/types";

/**
 * 0091 — Los dos diálogos chicos de la conciliación: dejar una nota al mantener
 * u omitir un caso, y vincular un correo de Autodesk con una persona del campus.
 * El servidor valida todo; acá solo se elige.
 */

export function NotaDialog({
  titulo,
  confirmar,
  ayuda,
  busy,
  onClose,
  onConfirm,
}: {
  titulo: string;
  confirmar: string;
  ayuda: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (nota: string) => void;
}) {
  const [nota, setNota] = useState("");
  return (
    <ConfirmSendDialog
      title={titulo}
      confirmLabel={confirmar}
      busyLabel="Guardando…"
      busy={busy}
      onClose={onClose}
      onConfirm={() => onConfirm(nota)}
    >
      <p className="text-foreground">{ayuda}</p>
      <div className="space-y-1.5">
        <Label htmlFor="conciliacion-nota">Nota (opcional)</Label>
        <Input
          id="conciliacion-nota"
          value={nota}
          maxLength={500}
          placeholder="Por qué se deja así"
          onChange={(ev) => setNota(ev.target.value)}
        />
      </div>
    </ConfirmSendDialog>
  );
}

type Profesor = { id: string; name: string; email: string | null };

export function VincularDialog({
  correo,
  busy,
  onClose,
  onConfirm,
}: {
  correo: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (persona: { contactId: string } | { teacherId: string }) => void;
}) {
  const [tipo, setTipo] = useState<"alumno" | "profesor">("alumno");
  const [contacto, setContacto] = useState<ContactDto | null>(null);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [profesorId, setProfesorId] = useState("");

  useEffect(() => {
    if (tipo !== "profesor" || profesores.length > 0) return;
    let cancelado = false;
    void (async () => {
      const res = await fetch("/api/teachers").catch(() => null);
      if (!res?.ok || cancelado) return;
      const data = (await res.json()) as { teachers: Profesor[] };
      if (!cancelado) setProfesores(data.teachers);
    })();
    return () => {
      cancelado = true;
    };
  }, [tipo, profesores.length]);

  const elegida: { contactId: string } | { teacherId: string } | null =
    tipo === "alumno" ? (contacto ? { contactId: contacto.id } : null) : profesorId ? { teacherId: profesorId } : null;

  return (
    <ConfirmSendDialog
      title="Vincular el correo a una persona"
      confirmLabel="Vincular"
      busyLabel="Vinculando…"
      busy={busy || !elegida}
      onClose={onClose}
      onConfirm={() => elegida && onConfirm(elegida)}
    >
      <p className="text-foreground">
        El correo <span className="font-medium">{correo}</span> de Autodesk no coincide con ninguno del campus. Elegí a
        quién corresponde: se recuerda para las próximas importaciones.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="vincular-tipo">Es un…</Label>
        <Select id="vincular-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as "alumno" | "profesor")}>
          <option value="alumno">Alumno</option>
          <option value="profesor">Profesor</option>
        </Select>
      </div>
      {tipo === "alumno" ? (
        <ContactPicker id="vincular-contacto" label="Buscar alumno" value={contacto} onChange={setContacto} />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="vincular-profesor">Profesor</Label>
          <Select id="vincular-profesor" value={profesorId} onChange={(ev) => setProfesorId(ev.target.value)}>
            <option value="">— Elegir —</option>
            {profesores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </ConfirmSendDialog>
  );
}
