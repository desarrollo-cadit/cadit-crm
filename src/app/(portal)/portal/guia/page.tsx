import { redirect } from "next/navigation";
import {
  portalTeacherId,
  resolvePortalSession,
  studentContactId,
} from "@/lib/auth/portal";
import {
  CIERRE_PORTAL,
  GUIA_PORTAL_ALUMNO,
  GUIA_PORTAL_PROFESOR,
} from "@/lib/guia-portal";
import { ITEMS_ALUMNO, ITEMS_PROFESOR } from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * 027 (US2) — La guía del portal, escrita para quien la lee.
 *
 * FR-009 — Vive bajo `(portal)`, con su propia ruta y su propio contenido. No
 * es una versión recortada de la del staff: reusar aquella superficie
 * obligaría a llenarla de `if`, que es exactamente cómo un enlace interno
 * termina visible en la pantalla equivocada. Es el Principio 3 del roadmap
 * —cada audiencia con su superficie— y la misma decisión que ya se tomó con
 * `PortalNav`, que no reusa `AppNav`.
 *
 * FR-010 — Se arma con los mismos ítems que dibujan la barra lateral, así que
 * una pantalla nueva en el portal aparece acá sola; y si no se la describe, no
 * compila.
 *
 * FR-011 — Acá no se nombra ningún permiso, ni ningún puesto de la academia,
 * ni ninguna pantalla interna: nada de eso significa algo para quien lee, y
 * enumerarlo sería mostrarle el funcionamiento interno de la academia a
 * alguien de afuera sin ningún beneficio.
 */
export default async function GuiaPortalPage() {
  const portal = await resolvePortalSession();
  if (!portal) redirect("/login");

  const esAlumno = Boolean(studentContactId(portal));
  const esProfesor = Boolean(portalTeacherId(portal));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cómo funciona esto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Qué hay en cada pantalla del menú y para qué sirve. Sólo aparece lo
          que vos podés abrir.
        </p>
      </div>

      {/*
        SC-005 — Quien cursa Y da clase ve las dos secciones, rotuladas. Es un
        caso real y no una hipótesis: un egresado que después empieza a dar
        clase conserva las dos cosas, y sin los rótulos vería una sola lista
        larga sin entender por qué le hablan de dos cosas distintas.
      */}
      {esAlumno && (
        <Seccion
          titulo="Mientras cursás"
          items={ITEMS_ALUMNO.map((i) => ({
            label: i.label,
            texto: GUIA_PORTAL_ALUMNO[i.href],
          }))}
        />
      )}

      {esProfesor && (
        <Seccion
          titulo="Cuando das clase"
          items={ITEMS_PROFESOR.map((i) => ({
            label: i.label,
            texto: GUIA_PORTAL_PROFESOR[i.href],
          }))}
        />
      )}

      {/*
        El cierre. Quien lee esto tiene un solo camino cuando no encuentra algo
        —hablar con la academia— y decírselo es más útil que cualquier lista de
        quién hace qué del otro lado.
      */}
      <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
        {CIERRE_PORTAL}
      </p>
    </div>
  );
}

function Seccion({
  titulo,
  items,
}: {
  titulo: string;
  items: readonly { label: string; texto: string }[];
}) {
  return (
    <section>
      <h2 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
        {titulo}
      </h2>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
        {items.map((i) => (
          <li key={i.label} className="px-4 py-3.5">
            <p className="text-sm font-semibold">{i.label}</p>
            <p className="mt-1 text-sm text-text-2">{i.texto}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
