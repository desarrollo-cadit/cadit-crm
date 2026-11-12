/** La pestaña Clases: generar el cronograma, enlaces, cambiar la fecha de una clase y recesos. */
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
// Grupo futuro y SIN cronograma: la pantalla muestra la proyección y el botón para generarlo.
const { grupoId } = await armarGrupo(api, { inicio: 7, fin: 42, cronograma: false, alumnos: 2 });
export const ruta = `/cohorts/${grupoId}?tab=clases`;

export async function guion(g) {
  const { page } = g;

  await g.paso("Sin cronograma, las clases son una proyección según los días de cursada", page.getByText("Estas clases son una proyección").locator("xpath=ancestor::div[1]"), { sostener: 3.8 });

  await g.paso("Generar cronograma crea las clases reales del grupo", page.getByRole("button", { name: "Generar cronograma" }), {
    accion: "clic",
    sostener: 3.4,
    despues: async () => page.getByRole("button", { name: "Hereda el enlace" }).first().waitFor({ timeout: 20000 }),
  });

  await g.paso("Cada clase hereda el enlace de reunión del grupo, salvo que tenga uno propio", page.getByRole("button", { name: "Hereda el enlace" }).first(), {
    accion: "clic",
    sostener: 3.2,
    despues: async () => page.getByPlaceholder(/zoom\.us/).waitFor({ timeout: 10000 }),
  });

  await g.paso("Desde aquí se carga un enlace propio para esa clase", page.getByPlaceholder(/zoom\.us/), { sostener: 3 });
  await page.getByRole("button", { name: "Cancelar" }).first().click();

  await g.paso("«Cambiar fecha» mueve una clase viva a otro día", page.getByRole("button", { name: "Cambiar fecha" }).first(), {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByRole("dialog").waitFor({ timeout: 10000 }),
  });

  await g.paso("Si la nueva fecha pasa el fin del grupo, el fin se extiende", page.getByRole("dialog"), { sostener: 3.6 });
  await page.getByRole("button", { name: /^(Volver|Cancelar)$/ }).first().click();

  await g.paso("Más abajo se administran los recesos: días sin clase del grupo", page.getByText("Recesos de este grupo").locator("xpath=../.."), { sostener: 3.4 });
}
