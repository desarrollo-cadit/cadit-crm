"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import { digitosDeTelefonoBuscado } from "@/lib/contact-search";
import {
  Buscador,
  Desplegable,
  OpcionUnica,
  Resaltado,
  ResumenDeFiltros,
  Segmentado,
  SinCoincidencias,
  TarjetaDeFiltros,
  type FiltroActivo,
} from "@/components/listados/filtros";
import type { ContactDto } from "@/lib/types";
import { cn, formatPhone, fullName } from "@/lib/utils";
import { esLlegadaReciente } from "@/lib/form-arrivals";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Modal, useDirty } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EnrollDialog, EnrollLauncher } from "@/components/enrollments/enroll-launcher";
import { MergeContactsDialog } from "@/components/contacts/merge-contacts-dialog";
import { TIPO_DE_CONTACTO_LABEL, type TipoDeContacto } from "@/lib/recorrido-comercial";
import { notify } from "@/lib/notify";
import { PESTANA_POR_FILTRO_DE_CONTACTOS, type FiltroDeContactos } from "@/lib/pestanas";
import { usePestanaEnUrl } from "@/components/use-pestana-en-url";

const PAGE_SIZE = 20;

/** 046 US7 — Las pestañas por tipo de contacto (derivado del historial). */
type Pestana = FiltroDeContactos;
type CantidadesPorTipo = Record<Pestana, number>;
const PESTANAS: { key: Pestana; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "lead", label: "Leads" },
  { key: "alumno_activo", label: "Alumnos activos" },
  { key: "exalumno", label: "Exalumnos" },
];
const ETIQUETA_DE_PESTANA = Object.fromEntries(PESTANAS.map((p) => [p.key, p.label])) as Record<
  Pestana,
  string
>;
const VARIANTE_TIPO: Record<TipoDeContacto, "outline" | "success" | "secondary"> = {
  lead: "outline",
  alumno_activo: "success",
  exalumno: "secondary",
};

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

/** La clave de `?tab=` de cada filtro (leads, alumnos-activos, exalumnos). */
const enUrl = (p: Pestana) => PESTANA_POR_FILTRO_DE_CONTACTOS[p];

export function ContactsClient({
  canEnroll = false,
  canMerge = false,
  initialTab = "todos",
}: {
  canEnroll?: boolean;
  /** 2026-10-26 — `contactos.unificar`: ofrecer "Unificar con…" ante un duplicado. */
  canMerge?: boolean;
  /** 2026-10-26 — De `?tab=`, ya validada y traducida por el servidor. */
  initialTab?: Pestana;
}) {
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  /** 014 — Qué pasó al dar de baja: borrado o archivado, y por qué. */
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ContactDto | null>(null);
  /** El duplicado del 409, para abrir "Unificar contactos" ya elegido. */
  const [merging, setMerging] = useState<{
    contactId: string;
    otro: { id: string; name: string };
  } | null>(null);
  /** 2026-10-26 — La persona de la fila que se está inscribiendo en un grupo. */
  const [enrolling, setEnrolling] = useState<{ id: string; name: string } | null>(null);
  const [pestana, setPestana] = usePestanaEnUrl<Pestana>(initialTab, enUrl);
  const [cantidades, setCantidades] = useState<CantidadesPorTipo | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (showArchived) params.set("archived", "true");
    if (pestana !== "todos") params.set("tipo", pestana);
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
      tipos?: CantidadesPorTipo;
    };
    setContacts(data.contacts);
    setTotal(data.total);
    setCantidades(data.tipos ?? null);
    setSelected(new Set());
    setLoading(false);
  }, [query, showArchived, page, pestana]);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 250);
    return () => clearTimeout(t);
  }, [refetch]);

  // Búsqueda o filtro nuevos: siempre vuelve a la página 1.
  useEffect(() => {
    setPage(1);
  }, [query, showArchived, pestana]);

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
      notify.error(data?.error?.message ?? "No se pudo dar de baja");
      return;
    }
    if (data?.accion === "borrar") notify.success(`${nombre} fue eliminado.`);
    else
      notify.success(`${nombre} fue archivado.`, {
        ...(data?.motivo ? { description: data.motivo } : {}),
      });
    void refetch();
  }

  /**
   * 2026-10-21 — Devuelve el rechazo del servidor (antes se tragaba): un
   * correo o teléfono de otro contacto vuelve con ese contacto, para enlazarlo.
   */
  async function patch(id: string, body: Record<string, unknown>): Promise<EditError | null> {
    const res = await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as
        | {
            error?: {
              message?: string;
              fields?: { message: string }[];
              contact?: { id: string; name: string };
            };
          }
        | null;
      return {
        message:
          data?.error?.fields?.[0]?.message ??
          data?.error?.message ??
          "No se pudo guardar el contacto",
        contact: data?.error?.contact ?? null,
      };
    }
    void refetch();
    return null;
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

  /**
   * 2026-10-29 — La misma tarjeta de filtros que Académico. La búsqueda y los
   * filtros siguen en el SERVIDOR (paginados): acá solo se dibujan, y el total
   * del resumen es el que devuelve `GET /api/contacts`.
   */
  const busqueda = query.trim();
  const busquedaDeTelefono = digitosDeTelefonoBuscado(busqueda) ?? busqueda;
  const filtrosActivos: FiltroActivo[] = [
    ...(busqueda ? [{ clave: "q", etiqueta: `“${busqueda}”`, quitar: () => setQuery("") }] : []),
    ...(pestana !== "todos"
      ? [{ clave: "tipo", etiqueta: ETIQUETA_DE_PESTANA[pestana], quitar: () => setPestana("todos") }]
      : []),
    ...(showArchived
      ? [{ clave: "archivados", etiqueta: "Con archivados", quitar: () => setShowArchived(false) }]
      : []),
  ];
  const hayFiltros = filtrosActivos.length > 0;
  function limpiarFiltros() {
    setQuery("");
    setPestana("todos");
    setShowArchived(false);
  }
  // Con más de una página, el rango de ESTA página ("21–40 de 57").
  const desde = (page - 1) * PAGE_SIZE + 1;
  const mostrando =
    total > PAGE_SIZE && contacts.length > 0
      ? `${desde}–${desde + contacts.length - 1}`
      : contacts.length;
  // Sin contactos de verdad (no por un filtro): la tarjeta no tiene nada que filtrar.
  const sinContactos = !loading && !hayFiltros && total === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="font-semibold">Alumnos</h2>
        <div className="flex flex-wrap items-center gap-3">
          {canEnroll && (
            <EnrollLauncher
              className="flex flex-col items-end"
              label="Inscribir alumno"
              variant="default"
              onEnrolled={() => void refetch()}
            />
          )}
        </div>
      </header>

      {/*
        2026-10-26 — La tabla usa TODO el alto que queda. Antes tenía un tope
        alto máximo calculado a ojo sobre la ventana y sobraba pantalla. Desde
        `md` esta región es una columna: la tabla crece (`flex-1 min-h-0`) y
        scrollea sola (así el encabezado sticky se ancla a ella) y la
        paginación queda al pie. En pantallas angostas scrollea la región
        entera, como siempre.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6 md:flex md:flex-col md:overflow-hidden">
        {/*
          2026-10-29 — Buscar, tipo (Todos / Leads / Alumnos activos /
          Exalumnos, con las cantidades del servidor) y archivados en UNA
          tarjeta, como en Académico. El tipo sigue en `?tab=`.
        */}
        {!sinContactos && (
          <TarjetaDeFiltros
            className="mb-4 shrink-0"
            pie={
              <ResumenDeFiltros
                mostrando={mostrando}
                total={total}
                sustantivo={{ uno: "contacto", varios: "contactos" }}
                activos={filtrosActivos}
                onLimpiar={limpiarFiltros}
              />
            }
          >
            <Buscador
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nombre, apellido, correo o teléfono…"
            />
            <Segmentado<Pestana>
              etiqueta="Tipo de contacto"
              opciones={PESTANAS.map((p) => ({
                clave: p.key,
                etiqueta: p.label,
                cantidad: cantidades?.[p.key] ?? null,
              }))}
              encendida={(clave) => clave === pestana}
              onElegir={setPestana}
            />
            <Desplegable
              etiqueta="Archivados"
              valor={showArchived ? "Incluidos" : "Ocultos"}
              activo={showArchived}
              alinear="derecha"
            >
              {(cerrar) => (
                <>
                  <OpcionUnica
                    elegida={!showArchived}
                    onElegir={() => {
                      setShowArchived(false);
                      cerrar();
                    }}
                  >
                    Ocultar archivados
                  </OpcionUnica>
                  <OpcionUnica
                    elegida={showArchived}
                    onElegir={() => {
                      setShowArchived(true);
                      cerrar();
                    }}
                  >
                    Incluir archivados
                  </OpcionUnica>
                </>
              )}
            </Desplegable>
          </TarjetaDeFiltros>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : contacts.length === 0 && hayFiltros ? (
          // Vacía POR los filtros: no es "no hay contactos".
          <SinCoincidencias
            mensaje="Ningún contacto coincide con la búsqueda y los filtros."
            onLimpiar={limpiarFiltros}
          />
        ) : contacts.length === 0 ? (
          <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">Sin alumnos</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Cada persona que escriba a tu WhatsApp (o llene un formulario de
              tu sitio) quedará registrada aquí automáticamente.
            </p>
          </div>
        ) : (
          <>
            <Table containerClassName="rounded-lg border bg-card md:min-h-0 md:flex-1">
              {/*
                021 — Encabezado FIJO. Con 340 filas paginadas de a decenas,
                bajar media pantalla y quedarse sin saber qué columna es cuál
                es un defecto de uso, no un detalle estético.
              */}
              <TableHeader className="sticky top-0 z-10 bg-subtle">
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
                {contacts.map((c) => {
                  // Los mismos que cuenta el número de "Alumnos" en el menú.
                  const nuevo = esLlegadaReciente(c);
                  return (
                  <TableRow key={c.id} className={cn("hover:bg-subtle", nuevo && "bg-brand-tint")}>
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
                            {/* 2026-10-07 — Al legajo desde el listado: la
                                guía promete "buscar a un alumno y abrir su
                                legajo", y hasta acá solo se llegaba desde
                                el roster de una cohorte. */}
                            <Link
                              href={`/contacts/${c.id}/legajo`}
                              className="truncate text-sm font-medium hover:underline"
                            >
                              <Resaltado texto={fullName(c)} busqueda={busqueda} />
                            </Link>
                            {nuevo && (
                              <Badge variant="default" title="Llegó por un formulario en las últimas 48 horas">
                                Nuevo
                              </Badge>
                            )}
                            {c.tipo && (
                              <Badge variant={VARIANTE_TIPO[c.tipo]}>{TIPO_DE_CONTACTO_LABEL[c.tipo]}</Badge>
                            )}
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
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {c.phone ? (
                        <Resaltado texto={formatPhone(c.phone)} busqueda={busquedaDeTelefono} />
                      ) : (
                        formatPhone(c.phone)
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.email ? <Resaltado texto={c.email} busqueda={busqueda} /> : "—"}
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
                        {/* 2026-10-26 — Inscribir a ESTA persona: el mismo
                            formulario del legajo y la bandeja, con el
                            contacto ya elegido. Solo con inscripciones.editar. */}
                        {canEnroll && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Inscribir en un grupo"
                            aria-label={`Inscribir a ${fullName(c)} en un grupo`}
                            onClick={() => setEnrolling({ id: c.id, name: fullName(c) })}
                          >
                            <GraduationCap className="h-4 w-4" />
                          </Button>
                        )}
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
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-4 flex shrink-0 items-center justify-between text-xs text-muted-foreground">
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
          onMerge={
            canMerge
              ? (otro) => {
                  setMerging({ contactId: editing.id, otro });
                  setEditing(null);
                }
              : undefined
          }
          onSave={async (patchBody) => {
            const error = await patch(editing.id, patchBody);
            if (!error) setEditing(null);
            return error;
          }}
        />
      )}

      {enrolling && (
        <EnrollDialog
          key={enrolling.id}
          initialContact={enrolling}
          onClose={() => setEnrolling(null)}
          onEnrolled={() => void refetch()}
        />
      )}

      {merging && (
        <MergeContactsDialog
          contactId={merging.contactId}
          otro={merging.otro}
          onClose={() => {
            setMerging(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

/**
 * Iteración 6 (feedback en vivo: "si le da a editar solo se edita nombre y
 * eso... es clave poder editar todo") — antes solo tocaba nombre/notas.
 * 2026-10-21 — El teléfono se puede AGREGAR a quien no lo tiene (pasa a ser
 * su identidad de WhatsApp si era provisional); uno ya cargado no se cambia
 * acá (ver `src/app/api/contacts/[id]/route.ts`).
 */
type EditError = { message: string; contact: { id: string; name: string } | null };

function EditDialog({
  contact,
  onClose,
  onSave,
  onMerge,
}: {
  contact: ContactDto;
  onClose: () => void;
  /**
   * 2026-10-26 — El caso Patricia: el 409 nombra al contacto que ya tiene el
   * teléfono o el correo. Con `contactos.unificar`, se ofrece unificarlos.
   */
  onMerge?: (otro: { id: string; name: string }) => void;
  onSave: (patch: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    secondaryEmail: string | null;
    nationalId: string | null;
    source: string | null;
    utmCampaign: string | null;
    notes: string | null;
    companyId: string | null;
    phone?: string;
  }) => Promise<EditError | null>;
}) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<EditError | null>(null);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState(contact.firstName);
  /**
   * 043 — La empresa de la PERSONA (para "asignar a toda la empresa"). Se
   * completa sola al inscribir con empresa; acá se corrige.
   */
  const [companyId, setCompanyId] = useState(contact.companyId ?? "");
  const [empresas, setEmpresas] = useState<{ id: string; legalName: string }[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/companies").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { companies: { id: string; legalName: string }[] };
      setEmpresas(body.companies);
    })();
  }, []);
  const [lastName, setLastName] = useState(contact.lastName ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(contact.secondaryEmail ?? "");
  const [nationalId, setNationalId] = useState(contact.nationalId ?? "");
  const [source, setSource] = useState(contact.source ?? "");
  const [utmCampaign, setUtmCampaign] = useState(contact.utmCampaign ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const dirty = useDirty({
    firstName,
    lastName,
    phone,
    email,
    secondaryEmail,
    nationalId,
    source,
    utmCampaign,
    notes,
    companyId,
  });

  return (
    <Modal
      onClose={onClose}
      dirty={dirty}
      labelledBy="edit-contact-title"
      className="max-h-[90vh] overflow-y-auto"
    >
        <h3 id="edit-contact-title" className="mb-4 font-semibold">Editar contacto</h3>
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
          {contact.phone ? (
            <p className="text-xs text-muted-foreground">
              Teléfono: {formatPhone(contact.phone)} — no editable acá (es la
              identidad de WhatsApp del contacto).
            </p>
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="edit-phone">
                Teléfono
              </label>
              <Input
                id="edit-phone"
                placeholder="099 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sin teléfono no tiene WhatsApp. Una vez guardado, el teléfono queda como su
                identidad de WhatsApp y no se cambia desde acá.
              </p>
            </div>
          )}
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
            <label className="text-sm font-medium" htmlFor="edit-secondary-email">
              Correo secundario
            </label>
            <Input
              id="edit-secondary-email"
              type="email"
              value={secondaryEmail}
              onChange={(e) => setSecondaryEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sirve para encontrar al contacto. No se le envía nada a este correo.
            </p>
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-company">
              Empresa
            </label>
            <Select id="edit-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Sin empresa</option>
              {empresas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </Select>
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
        {error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error.message}
            {error.contact && (
              <>
                {" "}
                <Link
                  href={`/contacts/${error.contact.id}`}
                  className="underline underline-offset-2"
                >
                  Ver a {error.contact.name}
                </Link>
                {onMerge && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => onMerge(error.contact!)}
                    >
                      Unificar con {error.contact.name}
                    </button>
                  </>
                )}
              </>
            )}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!firstName.trim() || saving}
            onClick={async () => {
              setError(null);
              setSaving(true);
              const fallo = await onSave({
                firstName: firstName.trim(),
                lastName: lastName.trim() || null,
                email: email.trim() || null,
                secondaryEmail: secondaryEmail.trim() || null,
                nationalId: nationalId.trim() || null,
                source: source.trim() || null,
                utmCampaign: utmCampaign.trim() || null,
                notes: notes.trim() || null,
                companyId: companyId || null,
                ...(phone.trim() ? { phone: phone.trim() } : {}),
              });
              setSaving(false);
              setError(fallo);
            }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
    </Modal>
  );
}
