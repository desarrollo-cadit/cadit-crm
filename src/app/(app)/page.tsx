import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { portalTeacherId, resolvePortalSession } from "@/lib/auth/portal";
import { landingRedirect, parseViewCookie, VIEW_COOKIE } from "@/lib/view-preference";
import { getAuth } from "@/lib/auth";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { FinancePanel } from "@/components/dashboard/finance-panel";
import { TodayPanel } from "@/components/dashboard/today-panel";
import { TareasDeHoyPanel } from "@/components/dashboard/tareas-de-hoy-panel";
import { reglasPermitidas } from "@/lib/tareas-del-dia";
import { LicenseInventoryPanel } from "@/components/dashboard/license-inventory-panel";
import { MorosidadResumen } from "@/components/dashboard/morosidad-resumen";

export const dynamic = "force-dynamic";

/**
 * 005 (T039, US6) — home de la app. Antes `/` solo redirigía a `/inbox`
 * (`src/app/page.tsx`, ahora eliminado); esa ruta no tenía contenido propio
 * donde "integrar el dashboard financiero" como pide el spec, así que esta
 * fase la convierte en un home real dentro del layout autenticado — ver
 * reporte final de la fase para el detalle de esta decisión. `/inbox` sigue
 * accesible desde el sidebar como antes.
 *
 * Iteración 2 (pedido en vivo del dueño) — suma el widget de licencias
 * disponibles FUERA del `fullAccess`: es información operativa, no
 * financiera, así que también es visible para `role: "soporte"`.
 */
export default async function HomePage() {
  const session = await getSessionOrNull();

  /**
   * 030 (addendum) — Quien es equipo Y profesor entra a la última vista que
   * eligió ("Ver como"). Solo el INICIO redirige: un enlace directo a una
   * pantalla del panel abre esa pantalla, elija lo que elija.
   */
  const vista = parseViewCookie((await cookies()).get(VIEW_COOKIE)?.value);
  if (vista === "profesor") {
    const portal = await resolvePortalSession();
    const destino = landingRedirect(vista, { isTeacher: portal !== null && portalTeacherId(portal) !== null });
    if (destino) redirect(destino);
  }
  /**
   * 012 (T029) — Se pregunta por la CAPACIDAD, no por el nombre del rol.
   *
   * Antes decía `session?.role !== "soporte"`, y eso ataba la pantalla a un
   * rol puntual: el día que los roles se renombran —que es exactamente lo que
   * hace esta fase— el panel financiero se le abría a quien no debía, sin que
   * fallara nada. Preguntar por `cobranza.ver` sobrevive a cualquier cambio de
   * nombres y respeta lo que la dueña configure desde la pantalla de roles.
   */
  const fullAccess = session
    ? sessionCapabilities(session).includes("cobranza.ver")
    : false;

  const verReportes = session ? sessionCapabilities(session).includes("reportes.ver") : false;

  // 2026-10-26 — La bandeja "Para resolver" solo aparece si la persona
  // puede ver al menos una de sus reglas (cada una pide SU capacidad).
  const verTareas = session ? reglasPermitidas(sessionCapabilities(session)).length > 0 : false;

  const authSession = await getAuth().api.getSession({ headers: await headers() });

  /**
   * 021 — El inicio dejó de abrir con un encabezado que decía "Inicio".
   *
   * Se quitó a propósito: el título de una pantalla que dice el nombre de la
   * pantalla no le informa nada a nadie, y ocupaba la franja más valiosa. En
   * su lugar va el saludo y el día, que es lo que hace que esto se sienta
   * TUYO y no un panel de administración genérico.
   *
   * El orden también cambió: primero qué pasa HOY, después la plata del mes.
   * Lo financiero es importante y no es urgente; las clases de las próximas
   * horas son las dos cosas.
   *
   * 2026-10-26 — Rediseño: tres franjas con peso distinto. Arriba ACTUAR
   * ("Para resolver", con presencia) junto a HOY (la agenda con la línea de
   * ahora); abajo EL MES, en tarjetas calladas. Los reportes se mudaron a
   * `/reportes` y acá queda una fila que lleva. Los permisos no cambian:
   * nada de plata sin `cobranza.ver`.
   */
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-[22px] overflow-y-auto px-4 pb-12 pt-[22px] md:px-7">
        <TodayPanel
          nombre={authSession?.user.name ?? "que tal"}
          paraResolver={verTareas ? <TareasDeHoyPanel /> : undefined}
        />

        <h2 className="flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground after:h-px after:flex-1 after:bg-border after:content-['']">
          Este mes
        </h2>
        <section className="grid items-start gap-3.5 min-[1100px]:grid-cols-3">
          {/* 008 — la morosidad va junto a las finanzas y con el mismo gate. */}
          {fullAccess && <FinancePanel />}
          {fullAccess && <MorosidadResumen />}
          <LicenseInventoryPanel />
        </section>

        {/* 046 US8 (FR-026) — Reportes: con `reportes.ver` (Dirección y Coordinación), en su pantalla. */}
        {verReportes && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border-strong px-4 py-3 text-sm text-text-2">
            <span>Reportes: cursos más vendidos, embudo de leads, recompra y más.</span>
            <Link href="/reportes" className="font-medium text-brand-text hover:underline">
              Abrir reportes →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
