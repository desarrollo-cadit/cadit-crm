"use client";

import { usePestanaEnUrl } from "@/components/use-pestana-en-url";
import { StudentRecordClient } from "@/components/contacts/student-record-client";
import { StudentAdminActivityClient } from "@/components/contacts/student-admin-activity-client";
import { SeguimientoClient } from "@/components/contacts/seguimiento-client";
import { PESTANA_DEL_CONTACTO_EN_URL, type PestanaDelContacto } from "@/lib/seguimiento";

/** La clave que escribe `?tab=` (la inversa de la que lee el servidor). */
const enUrl = (t: PestanaDelContacto) => PESTANA_DEL_CONTACTO_EN_URL[t];

/**
 * 2026-10-07 — Las pestañas del legajo, con la misma forma que las de la
 * cohorte (`CohortTabs`): se pasa de una a otra sin recargar la página.
 *
 * «Administración» se dibuja SOLO con `alumnos.auditoria`, resuelta en el
 * servidor y bajada como booleano. Esto decide lo que la persona VE; la
 * barrera real es el `requireCapability` de `/api/contacts/[id]/admin-activity`.
 *
 * «Seguimiento» (formularios, notas y contactos) se dibuja con `contactos.ver`
 * y abre primero cuando la persona es un lead (`pestanaInicialDelContacto`).
 */
export function StudentTabs({
  contactId,
  canEnroll,
  canAudit,
  canPrintTranscript = false,
  canViewAccess = false,
  canEditAccess = false,
  canManagePortal = false,
  initialTab = "record",
  canFollowUp = false,
}: {
  contactId: string;
  /** `inscripciones.editar`: el botón «Inscribir en una cohorte». */
  canEnroll: boolean;
  /** `alumnos.auditoria`: la pestaña «Administración». */
  canAudit: boolean;
  /** 031 — `academico.ver`: el enlace «Escolaridad». */
  canPrintTranscript?: boolean;
  /** 043 — `academico.ver`: hasta cuándo ve contenidos y sus accesos directos. */
  canViewAccess?: boolean;
  /** 043 — `academico.editar`: fijar la fecha y dar/quitar accesos directos. */
  canEditAccess?: boolean;
  /** 043 — `accesos.gestionar`: portal para quien no tiene inscripción. */
  canManagePortal?: boolean;
  /** Qué pestaña abre (`pestanaInicialDelContacto`, decidida en el servidor). */
  initialTab?: PestanaDelContacto;
  /** `inscripciones.seguimiento`: escribir notas y registrar contactos. */
  canFollowUp?: boolean;
}) {
  // 2026-10-26 — Cambiar de pestaña la deja en `?tab=` (legajo, seguimiento,
  // administracion): recargar o volver abre en la misma.
  const [tab, setTab] = usePestanaEnUrl<PestanaDelContacto>(initialTab, enUrl);

  const tabs = [
    { key: "record", label: "Legajo" },
    { key: "seguimiento", label: "Seguimiento" },
    ...(canAudit ? ([{ key: "admin", label: "Administración" }] as const) : []),
  ] as const;

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b px-6 pt-2" role="tablist" aria-label="Secciones del legajo">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "admin" && canAudit ? (
          <StudentAdminActivityClient contactId={contactId} />
        ) : tab === "seguimiento" ? (
          <SeguimientoClient contactId={contactId} canWrite={canFollowUp} />
        ) : (
          <StudentRecordClient
            contactId={contactId}
            canEnroll={canEnroll}
            canPrintTranscript={canPrintTranscript}
            canViewAccess={canViewAccess}
            canEditAccess={canEditAccess}
            canManagePortal={canManagePortal}
          />
        )}
      </div>
    </div>
  );
}
