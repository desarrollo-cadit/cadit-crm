import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ACCION_DE_REGLA, ParaResolver } from "@/components/dashboard/tareas-de-hoy-panel";
import { AgendaDeHoy, type ClaseDeHoy } from "@/components/dashboard/today-panel";
import { TarjetaDeMorosidad, type FilaDeMorosidad } from "@/components/dashboard/morosidad-resumen";
import type { GrupoDeTareas } from "@/lib/tareas-del-dia";

/**
 * 2026-10-26 — El inicio rediseñado: actuar (Para resolver), hoy (la agenda) y
 * el mes (tarjetas calladas). Se renderizan las piezas presentacionales con
 * datos fijos; la lectura de cada una ya tiene sus propios tests.
 */

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const GRUPOS: GrupoDeTareas[] = [
  {
    ruleId: "asistencia",
    titulo: "Asistencia sin pasar",
    resumen: "5 clases sin pasar en 2 grupos",
    cantidad: 5,
    urgencia: "alta",
    items: [
      { ruleId: "asistencia", titulo: "Revit — Martes", detalle: "4 clases sin pasar · la más vieja de hace 5 días", href: "/cohorts/c1?tab=asistencia", urgencia: "alta", cantidad: 4 },
      { ruleId: "asistencia", titulo: "AutoCAD — Noche", detalle: "Clase de ayer", href: "/cohorts/c2?tab=asistencia", urgencia: "media", cantidad: 1 },
    ],
  },
  {
    ruleId: "facturar",
    titulo: "Pendientes de facturar",
    resumen: "1 grupo con ventas sin factura",
    cantidad: 1,
    urgencia: "media",
    items: [
      { ruleId: "facturar", titulo: "BIM — 4", detalle: "1 inscripción sin factura", href: "/facturacion?tab=pendientes&grupo=c3", urgencia: "media" },
    ],
  },
];

describe("Para resolver", () => {
  it("lleva el total en el encabezado, la cantidad de cada regla y su marca", () => {
    const h = html(createElement(ParaResolver, { grupos: GRUPOS }));
    expect(h).toContain("Para resolver");
    // Las reglas de asistencia cuentan CLASES (5), aunque vengan en 2 items por grupo.
    expect(h).toMatch(/rounded-full bg-brand[^"]*">6</);
    expect(h).toMatch(/tabular-nums[^"]*">5</);
    expect(h).toContain("5 clases sin pasar en 2 grupos");
    expect(h).toContain("Urgente");
    expect(h).toContain("Esta semana");
  });

  it("la primera regla abre desplegada, con la acción dicha en palabras y su enlace", () => {
    const h = html(createElement(ParaResolver, { grupos: GRUPOS }));
    expect(h).toContain("Pasar asistencia →");
    expect(h).toContain('href="/cohorts/c1?tab=asistencia"');
    // La segunda regla queda plegada.
    expect(h).not.toContain("Ir a facturación →");
  });

  it("cada regla tiene su acción", () => {
    expect(ACCION_DE_REGLA).toEqual({
      asistencia_zoom: "Revisar y confirmar",
      asistencia: "Pasar asistencia",
      grabaciones: "Resolver",
      confirmar: "Confirmar o cancelar",
      facturar: "Ir a facturación",
      leads: "Abrir seguimiento",
      prorrogas: "Aprobar o rechazar",
      resultados: "Confirmar resultados",
    });
  });

  it("sin tareas, un vacío tranquilo", () => {
    expect(html(createElement(ParaResolver, { grupos: [] }))).toContain("Nada pendiente por hoy.");
  });
});

describe("Agenda de hoy", () => {
  const TZ = "America/Montevideo";
  const AHORA = new Date("2026-10-26T18:42:00Z"); // 15:42 en Montevideo
  const base = { date: "2026-10-26T00:00:00.000Z", cohortId: "c", projected: false };
  const CLASES: ClaseDeHoy[] = [
    { ...base, cohortId: "a", cohortName: "Mañana", courseName: "Revit Inicial", startTime: "09:00", endTime: "12:00" },
    { ...base, cohortId: "b", cohortName: "Tarde", courseName: "AutoCAD 2D", startTime: "14:00", endTime: "17:00" },
    { ...base, cohortId: "c", cohortName: "Online", courseName: "Civil 3D", startTime: "19:00", endTime: "22:00", projected: true },
  ];

  it("dice qué terminó, qué está en curso y dónde está ahora", () => {
    const h = html(createElement(AgendaDeHoy, { clases: CLASES, timeZone: TZ, now: AHORA }));
    expect(h).toContain("Mañana · terminó 12:00");
    expect(h).toContain("en curso");
    expect(h).toContain("Tarde · termina 17:00");
    expect(h).toContain("15:42");
    expect(h).toContain("proyectada");
    // La línea de ahora va entre AutoCAD (en curso) y Civil 3D (próxima).
    expect(h.indexOf("AutoCAD 2D")).toBeLessThan(h.indexOf("15:42"));
    expect(h.indexOf("15:42")).toBeLessThan(h.indexOf("Civil 3D"));
  });

  it("la línea de ahora usa el naranja de la marca, por token", () => {
    expect(html(createElement(AgendaDeHoy, { clases: CLASES, timeZone: TZ, now: AHORA }))).toContain("bg-barra-rotulo");
  });

  it("sin clases, el vacío de siempre", () => {
    expect(html(createElement(AgendaDeHoy, { clases: [], timeZone: TZ, now: AHORA }))).toContain(
      "No hay clases programadas para hoy."
    );
  });
});

describe("Para resolver y Agenda de hoy: mismo alto, scroll adentro", () => {
  const panel = readFileSync(join(process.cwd(), "src", "components", "dashboard", "today-panel.tsx"), "utf8");
  const ALTO = "clamp(22rem,60vh,38rem)";

  it("lado a lado comparten UN alto acotado por la ventana; sola, la agenda lo usa de máximo", () => {
    expect(panel).toContain(`min-[1100px]:h-[${ALTO}]`);
    expect(panel).toContain("min-[1100px]:grid-rows-[minmax(0,1fr)]");
    expect(panel).toContain("min-[1100px]:items-stretch");
    expect(panel).toContain(`min-[1100px]:max-h-[${ALTO}]`);
  });

  it("la lista de tareas se desplaza adentro y el encabezado queda afuera", () => {
    const h = html(createElement(ParaResolver, { grupos: GRUPOS }));
    expect(h).toContain("scroll-con-borde");
    expect(h.indexOf("Para resolver")).toBeLessThan(h.indexOf("scroll-con-borde"));
  });

  it("el scroll interno es solo desde 1100px: apiladas, alto natural (sin scroll dentro de scroll)", () => {
    const zona = readFileSync(join(process.cwd(), "src", "components", "dashboard", "zona-con-scroll.tsx"), "utf8");
    expect(zona).toContain("min-[1100px]:overflow-y-auto");
    expect(zona).not.toMatch(/(^|[\s"])overflow-y-auto/);
    // Con movimiento reducido, salta.
    expect(zona).toContain("prefers-reduced-motion: reduce");
  });

  it("la agenda marca la línea de ahora para traerla a la vista", () => {
    const AHORA = new Date("2026-10-26T18:42:00Z");
    const h = html(
      createElement(AgendaDeHoy, {
        clases: [
          {
            date: "2026-10-26T00:00:00.000Z",
            cohortId: "x",
            projected: false,
            cohortName: "Tarde",
            courseName: "Revit",
            startTime: "19:00",
            endTime: "21:00",
          },
        ],
        timeZone: "America/Montevideo",
        now: AHORA,
      })
    );
    expect(h).toContain("data-ahora");
    expect(panel).toContain('enfocar="[data-ahora]"');
  });
});

describe("Morosidad en el inicio", () => {
  const fila = (i: number): FilaDeMorosidad => ({
    enrollmentId: `e${i}`,
    contact: { id: `ct${i}`, name: `Persona ${i}` },
    overdueAmount: 100_00,
    currency: "UYU",
    daysOverdue: 40 - i,
  });

  it("muestra las tres de más atraso y lleva a la lista entera", () => {
    const h = html(createElement(TarjetaDeMorosidad, { filas: [1, 2, 3, 4, 5].map(fila) }));
    expect(h).toContain("Persona 3");
    expect(h).not.toContain("Persona 4");
    expect(h).toContain("Ver los 5 →");
    expect(h).toContain('href="/finanzas/morosidad"');
  });

  it("sin deudas lo dice", () => {
    expect(html(createElement(TarjetaDeMorosidad, { filas: [] }))).toContain("Nadie con cuotas vencidas.");
  });
});

describe("La página de inicio", () => {
  const page = readFileSync(join(process.cwd(), "src", "app", "(app)", "page.tsx"), "utf8");

  it("la plata del mes sigue detrás de `cobranza.ver`", () => {
    expect(page).toContain('includes("cobranza.ver")');
    expect(page).toContain("{fullAccess && <FinancePanel />}");
    expect(page).toContain("{fullAccess && <MorosidadResumen />}");
  });

  it("los reportes ya no se arman en el inicio: hay una fila que lleva a /reportes", () => {
    expect(page).not.toContain("ReportsPanel");
    expect(page).toContain('href="/reportes"');
  });

  it("la lista entera de morosidad pide `cobranza.ver` en el servidor", () => {
    const src = readFileSync(join(process.cwd(), "src", "app", "(app)", "finanzas", "morosidad", "page.tsx"), "utf8");
    expect(src).toContain('includes("cobranza.ver")) redirect("/")');
    expect(src).toContain("<OverduePanel />");
  });
});
