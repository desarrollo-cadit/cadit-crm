/** Pasar lista: «Todos presentes» desde el menú de la clase y corrección de una marca. */
import { apiComo, exigir, sufijo } from "../datos.mjs";
import { asegurarVendedor, isoDia } from "../../lib.mjs";

export const rol = "coordinacion";

/**
 * Datos de apoyo (no se graban): un grupo ficticio NUEVO, con sufijo único, para no
 * tocar los datos sembrados y poder volver a grabar.
 */
async function armarGrupo(api, { inicio = -14, fin = 21, cronograma = true, alumnos = 4, empresa = false, monto = 1200000, whatsapp = false } = {}) {
  const sello = sufijo();
  const cursos = (await api("/api/courses")).json?.courses ?? [];
  const curso = cursos.find((c) => c.name === "AutoCAD 2D Estudiantes") ?? cursos[0];
  const grupo = exigir(
    "alta del grupo",
    await api("/api/cohorts", {
      method: "POST",
      body: JSON.stringify({
        courseId: curso.id,
        name: `Grupo Guía ${sello}`,
        startDate: isoDia(inicio),
        endDate: isoDia(fin),
        daysOfWeek: "0,2",
        startTime: "18:30",
        endTime: "20:30",
        meetingUrl: "https://zoom.us/j/81234567890",
        ...(whatsapp ? { whatsappGroupLink: "https://chat.whatsapp.com/GrupoGuiaDemo" } : {}),
      }),
    })
  );
  const grupoId = grupo.cohort?.id ?? grupo.id;
  if (cronograma) exigir("cronograma", await api(`/api/cohorts/${grupoId}/schedule`, { method: "POST" }));
  const vendedorId = await asegurarVendedor(api, "Ventas Demo");
  let companyId = null;
  if (empresa) {
    const c = exigir(
      "alta de la empresa",
      await api("/api/companies", { method: "POST", body: JSON.stringify({ legalName: `Constructora Guía ${sello} S.A.` }) })
    );
    companyId = c.company?.id ?? c.id;
  }
  const NOMBRES = [["Lucía", "Ferreira"], ["Mateo", "Acosta"], ["Sofía", "Techera"], ["Bruno", "Olivera"], ["Camila", "Rivero"], ["Diego", "Núñez"]];
  const inscripciones = [];
  for (let i = 0; i < alumnos; i++) {
    const [nombre, apellido] = NOMBRES[i % NOMBRES.length];
    const alta = exigir(
      `inscripción de ${nombre}`,
      await api("/api/enrollments", {
        method: "POST",
        body: JSON.stringify({
          cohortId: grupoId,
          sellerId: vendedorId,
          amount: monto,
          currency: "UYU",
          ...(companyId ? { companyId } : {}),
          contact: {
            firstName: nombre,
            lastName: `${apellido} ${sello}`,
            phone: `5989${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
            email: `${nombre}.${apellido}.${sello}.${i}@demo.test`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
          },
        }),
      })
    );
    inscripciones.push(alta.enrollment?.id);
  }
  return { grupoId, sello, inscripciones, companyId, cursoId: curso.id };
}

const { api } = await apiComo(rol);
const { grupoId } = await armarGrupo(api, { inicio: -28, fin: 14 });
export const ruta = `/cohorts/${grupoId}?tab=asistencia`;

export async function guion(g) {
  const { page } = g;
  const planilla = page.getByRole("table", { name: "Planilla de asistencia" });
  const cabecera = page.getByRole("button", { name: /^Clase 1 · .*Acciones de la clase/ });

  await g.paso("La planilla tiene un alumno por fila y una columna por clase", planilla, { sostener: 3.4 });

  await g.paso("Cada clase tiene su menú: se abre desde la fecha de la columna", cabecera, {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByRole("menuitem", { name: /Todos presentes/ }).waitFor({ timeout: 10000 }),
  });

  await g.paso("«Todos presentes» marca de una vez a quienes aún no tienen marca", page.getByRole("menuitem", { name: /Todos presentes/ }), {
    accion: "clic",
    sostener: 3.4,
    despues: async () => page.getByRole("dialog").waitFor({ timeout: 10000 }),
  });

  await g.paso("Se pide confirmar y las marcas ya cargadas no se tocan", page.getByRole("dialog"), {
    sostener: 3.8,
  });

  await g.paso("Confirmar deja toda la columna en presente", page.getByRole("button", { name: /^Marcar \d+ presentes?$/ }), {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByRole("dialog").waitFor({ state: "hidden", timeout: 15000 }),
  });

  const celda = page.getByRole("button", { name: /^.+ Ferreira .+, .+: Presente$/ }).first();
  await g.paso("Una marca ya tomada se corrige desde su celda", celda, {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByRole("menuitem", { name: /Ausente/ }).waitFor({ timeout: 10000 }),
  });

  await g.paso("Se elige el estado correcto: presente, tarde, ausente o justificado", page.getByRole("menu"), {
    sostener: 3.2,
  });

  await g.paso(
    "El porcentaje de la última columna se recalcula con cada cambio",
    page.getByRole("button", { name: /Ferreira .+: Presente$/ }).first().locator("xpath=ancestor::tr[1]"),
    {
      sostener: 3.6,
      despues: async () => {
        await page.getByRole("menuitem", { name: /Ausente/ }).click();
        await g.pausa(1.2);
      },
    }
  );
}
