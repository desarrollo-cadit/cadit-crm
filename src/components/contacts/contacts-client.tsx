"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
  Search,
  Trash2,
} from "lucide-react";
import type { ContactDto } from "@/lib/types";
import { formatPhone, fullName } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 20;

/** Extrae "Landing Revit" de "formulario:Landing Revit" para el badge. */
function formSourceLabel(source: string | null): string | null {
  if (!source?.startsWith("formulario:")) return null;
  return source.slice("formulario:".length) || "Formulario";
}

function SourceBadge({ source }: { source: string | null }) {
  const formName = formSourceLabel(source);
  if (formName) {
    return <Badge variant="success">Formulario: {formName}</Badge>;
  }
  if (source) {
    return <Badge variant="secondary">{source}</Badge>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ContactsClient() {
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  /** 014 — Qué pasó al dar de baja: borrado o archivado, y por qué. */
  const [avisoBaja, setAvisoBaja] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ContactDto | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (showArchived) params.set("archived", "true");
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const res = await fetch(`/api/contacts?${params}`).catch(() => null);
    if (!res?.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      contacts: ContactDto[];
      total: number;
    };
    setContacts(data.contacts);
    setTotal(data.total);
    setSelected(new Set());
    setLoading(false);
  }, [query, showArchived, page]);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 250);
    return () => clearTimeout(t);
  }, [refetch]);

  // Búsqueda o filtro nuevos: siempre vuelve a la página 1.
  useEffect(() => {
    setPage(1);
  }, [query, showArchived]);

  /**
   * 014 (T008, DV-008) — Da de baja a un alumno.
   *
   * **La decisión de borrar o archivar es del servidor**, no de acá. Un
   * contacto con inscripciones nunca se borra: el borrado cae en cascada sobre
   * sus notas, sus pagos y sus certificados emitidos. El navegador solo cuenta
   * qué pasó, para que nadie apriete y se quede sin saber.
   */
  async function darDeBaja(id: string, nombre: string) {
    const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" }).catch(
      () => null
    );
    const data = (await res?.json().catch(() => null)) as
      | { accion?: "borrar" | "archivar"; motivo?: string; error?: { message?: string } }
      | null;

    if (!res?.ok) {
      setAvisoBaja(data?.error?.message ?? "No se pudo dar de baja");
      return;
    }
    setAvisoBaja(
      data?.accion === "borrar"
        ? `${nombre} fue eliminado.`
        : `${nombre} fue archivado. ${data?.motivo ?? ""}`
    );
    void refetch();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    void refetch();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        {/*
          021 — El total estaba SOLO al pie: había que recorrer las 340 filas
          para saber cuántas eran. Arriba, junto al título, es donde se busca.
          Y cuando hay una búsqueda activa el número dice lo que ENCONTRÓ, que
          es la pregunta que se está haciendo en ese momento.
        */}
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold">Alumnos</h2>
          {!loading && (
            <span className="text-sm text-muted-foreground">
              {query.trim()
                ? `${total} ${total === 1 ? "resultado" : "resultados"}`
                : total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-primary"
            />
            Ver archivados
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, apellido o teléfono…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72 pl-8"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {avisoBaja && (
          <p className="mb-3 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm">
            {avisoBaja}
          </p>
        )}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">Sin alumnos</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Cada persona que escriba a tu WhatsApp (o llene un formulario de
              tu sitio) quedará registrada aquí automáticamente.
            </p>
          </div>
        ) : (
          <>
            <Table containerClassName="max-h-[calc(100vh-15rem)] rounded-lg border">
              {/*
                021 — Encabezado FIJO. Con 340 filas paginadas de a decenas,
                bajar media pantalla y quedarse sin saber qué columna es cuál
                es un defecto de uso, no un detalle estético.
              */}
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      className="accent-primary"
                      checked={selected.size === contacts.length}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${fullName(c)}`}
                        className="accent-primary"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelected(c.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <ContactAvatar name={fullName(c)} seed={c.id} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {fullName(c)}
                            </span>
                            {c.archivedAt && (
                              <Badge variant="secondary">Archivado</Badge>
                            )}
                          </div>
                          {c.notes && (
                            <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                              {c.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatPhone(c.phone)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={c.source} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex shrink-0 items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(c)}
                        >
                          Editar
                        </Button>
                        <Link href={`/inbox?contact=${c.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Abrir conversación"
                          >
                            <MessageSquareText className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={c.archivedAt ? "Desarchivar" : "Archivar"}
                          onClick={() =>
                            void patch(c.id, { archived: !c.archivedAt })
                          }
                        >
                          {c.archivedAt ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </Button>
                        {/* 014 (T008, DV-008) — Baja.
                            El SERVIDOR decide si borra o archiva: con
                            inscripciones nunca borra, porque el borrado cae en
                            cascada sobre notas, pagos y certificados. Acá solo
                            se muestra qué pasó. */}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Dar de baja a ${c.firstName}`}
                          onClick={() => void darDeBaja(c.id, c.firstName)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <p>
                Página {page} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {editing && (
        <EditDialog
          contact={editing}
          onClose={() => setEditing(null)}
          onSave={async (patchBody) => {
            await patch(editing.id, patchBody);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Iteración 6 (feedback en vivo: "si le da a editar solo se edita nombre y
 * eso... es clave poder editar todo") — antes solo tocaba nombre/notas.
 * `phone`/identidad de WhatsApp quedan afuera a propósito (ver
 * `src/app/api/contacts/[id]/route.ts`).
 */
function EditDialog({
  contact,
  onClose,
  onSave,
}: {
  contact: ContactDto;
  onClose: () => void;
  onSave: (patch: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    nationalId: string | null;
    source: string | null;
    utmCampaign: string | null;
    notes: string | null;
  }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [nationalId, setNationalId] = useState(contact.nationalId ?? "");
  const [source, setSource] = useState(contact.source ?? "");
  const [utmCampaign, setUtmCampaign] = useState(contact.utmCampaign ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">Editar contacto</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="edit-first-name">
                Nombre
              </label>
              <Input
                id="edit-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="edit-last-name">
                Apellido
              </label>
              <Input
                id="edit-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Teléfono: {formatPhone(contact.phone)} — no editable acá (es la
            identidad de WhatsApp del contacto).
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-email">
              Email
            </label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-national-id">
              Cédula / identificación
            </label>
            <Input
              id="edit-national-id"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="edit-source">
                Origen
              </label>
              <Input
                id="edit-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="edit-utm">
                Campaña (UTM)
              </label>
              <Input
                id="edit-utm"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-notes">
              Notas
            </label>
            <Textarea
              id="edit-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!firstName.trim()}
            onClick={() =>
              void onSave({
                firstName: firstName.trim(),
                lastName: lastName.trim() || null,
                email: email.trim() || null,
                nationalId: nationalId.trim() || null,
                source: source.trim() || null,
                utmCampaign: utmCampaign.trim() || null,
                notes: notes.trim() || null,
              })
            }
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
