/**
 * 007/035 — El checklist de onboarding del alumno en el roster.
 *
 * 2026-10-05 (decisión del dueño) — "Software instalado" y "Licencia" son
 * independientes: tildar la instalación NO consume licencia; solo asignarla
 * descuenta del stock. Como en pantalla están uno al lado del otro, el `hint`
 * lo dice donde surge la duda.
 *
 * 035 (US4, FR-017..FR-020) — Quedó UNA casilla:
 * - "Acceso a Academia Online" era de antes de los cursos offline dentro del
 *   CRM: deja de mostrarse y de contar. La columna y sus datos se quedan.
 * - "Correo de T&C enviado" era una casilla que en realidad MANDABA un
 *   correo: una acción con forma de marca. Ahora es el botón "Enviar T&C".
 *   Sigue siendo un paso del progreso: haberlo mandado es parte del onboarding.
 */
export const CHECKLIST_ITEMS: readonly {
  key: "softwareInstalledAt";
  label: string;
  hint?: string;
}[] = [
  {
    key: "softwareInstalledAt",
    label: "Software instalado",
    hint: "Registra la instalación; no descuenta licencias del stock.",
  },
];

/**
 * Cuántos pasos de onboarding están hechos, para verlo de un vistazo en la
 * tabla sin desplegar la fila. `moduleLicenseAssigned`: en una
 * especialización la licencia puede ser de un módulo (2026-10-05).
 */
export function checklistProgress(
  c: {
    licenseAssigned: boolean;
    hadOwnLicense: boolean;
    termsEmailSentAt: string | null;
    softwareInstalledAt: string | null;
    /** FR-019/FR-020 — Se conserva en la base y se ignora a propósito. */
    academiaOnlineAccessAt?: string | null;
  },
  moduleLicenseAssigned = false
): { done: number; total: number } {
  const steps = [
    c.licenseAssigned || c.hadOwnLicense || moduleLicenseAssigned,
    Boolean(c.termsEmailSentAt),
    Boolean(c.softwareInstalledAt),
  ];
  return { done: steps.filter(Boolean).length, total: steps.length };
}
