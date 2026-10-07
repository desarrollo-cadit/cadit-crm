"use client";

import { useState } from "react";
import { StudentRecordClient } from "@/components/contacts/student-record-client";
import { StudentAdminActivityClient } from "@/components/contacts/student-admin-activity-client";

/**
 * 2026-10-07 — Las pestañas del legajo, con la misma forma que las de la
 * cohorte (`CohortTabs`): se pasa de una a otra sin recargar la página.
 *
 * «Administración» se dibuja SOLO con `alumnos.auditoria`, resuelta en el
 * servidor y bajada como booleano. Esto decide lo que la persona VE; la
 * barrera real es el `requireCapability` de `/api/contacts/[id]/admin-activity`.
 */
export function StudentTabs({
  contactId,
  canEnroll,
  canAudit,
}: {
  contactId: string;
  /** `inscripciones.editar`: el botón «Inscribir en una cohorte». */
  canEnroll: boolean;
  /** `alumnos.auditoria`: la pestaña «Administración». */
  canAudit: boolean;
}) {
  const [tab, setTab] = useState<"record" | "admin">("record");

  const tabs = [
    { key: "record", label: "Legajo" },
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
        ) : (
          <StudentRecordClient contactId={contactId} canEnroll={canEnroll} />
        )}
      </div>
    </div>
  );
}
