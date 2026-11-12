/** Asignar licencias: a todo el grupo (con equipo de Autodesk) y lo que se ve por alumno. */
import { apiComo, exigir, sufijo } from "../datos.mjs";
import { asegurarVendedor, isoDia } from "../../lib.mjs";

export const rol = "soporte";

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

const { api: apiDir } = await apiComo("direccion");
const { grupoId } = await armarGrupo(apiDir, { inicio: 3, fin: 40, alumnos: 3 });
const equipos = (await apiDir("/api/license-teams")).json?.teams ?? [];
const programas = (await apiDir("/api/software")).json?.software ?? [];
const programa = programas.find((s) => s.name === "AutoCAD");
const equipo = equipos.find((t) => !t.archived && t.seats.some((x) => x.softwareId === programa?.id && x.libres >= 3));
if (!programa || !equipo) throw new Error("no hay un equipo con cupo de AutoCAD");
export const ruta = `/cohorts/${grupoId}?tab=alumnos`;

export async function guion(g) {
  const { page } = g;
  const panel = page.getByRole("region", { name: "Licencias del grupo" });

  await g.paso("Soporte asigna licencias desde la pestaña Alumnos, sobre el listado", panel, { sostener: 3.4 });

  await g.paso("Primero se elige el equipo de Autodesk que aporta el cupo", panel.getByLabel("Equipo de licencias para todo el grupo"), {
    sostener: 3,
    despues: async () => panel.getByLabel("Equipo de licencias para todo el grupo").selectOption(equipo.id),
  });

  await g.paso("Después, el programa: cada opción muestra cuántas licencias libres quedan", panel.getByLabel("Programa para todo el grupo"), {
    sostener: 3.2,
    despues: async () => panel.getByLabel("Programa para todo el grupo").selectOption(programa.id),
  });

  await g.paso("Asignar al grupo pide confirmar: si no alcanza el cupo, no se asigna ninguna", panel.getByRole("button", { name: "Asignar al grupo" }), {
    accion: "clic",
    sostener: 3.2,
    despues: async () => page.getByRole("dialog").waitFor({ timeout: 10000 }),
  });

  await g.paso("Quien se inscriba después recibe la licencia sola", page.getByRole("dialog"), { sostener: 3.6 });

  await g.paso("Confirmar descuenta las licencias del equipo y las deja asignadas a cada alumno", page.getByRole("dialog").getByRole("button", { name: "Asignar al grupo" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => panel.getByText(/· ATC/).first().waitFor({ timeout: 20000 }),
  });

  await g.paso("El programa queda a la vista con su equipo; la «x» lo quita y libera el cupo", panel, { sostener: 3.4 });

  await g.paso("Por alumno, el detalle muestra su licencia y el correo al que se envía", page.getByRole("button", { name: "Ver detalle" }).first(), {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByText("Tenía licencia propia").first().waitFor({ timeout: 15000 }),
  });

  await g.paso(
    "«Tenía licencia propia» excluye al alumno de la asignación y de los términos",
    page.getByText("Tenía licencia propia").first().locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"),
    { sostener: 4 }
  );
}
