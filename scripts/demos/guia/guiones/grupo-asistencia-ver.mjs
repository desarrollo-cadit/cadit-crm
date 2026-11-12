/** La planilla de asistencia de un grupo: clases dictadas, marcas y porcentaje por alumno. */
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
const { grupoId, inscripciones } = await armarGrupo(api, { inicio: -28, fin: 14, alumnos: 5 });
const clases = (await api(`/api/cohorts/${grupoId}/classes`)).json?.classes ?? [];
const ESTADOS = ["presente", "presente", "ausente", "tarde", "justificado"];
for (const [k, c] of clases.filter((x) => x.id).slice(0, 4).entries()) {
  exigir(
    "asistencia",
    await api(`/api/class-sessions/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        attendance: inscripciones.map((enrollmentId, i) => ({ enrollmentId, status: i === 2 && k % 2 ? "ausente" : ESTADOS[(i + k) % 4 === 3 ? 3 : i % 2 ? 0 : (i + k) % ESTADOS.length] })),
      }),
    })
  );
}
export const ruta = `/cohorts/${grupoId}?tab=asistencia`;

export async function guion(g) {
  const { page } = g;
  const planilla = page.getByRole("table", { name: "Planilla de asistencia" });

  await g.paso("La pestaña Asistencia muestra cuántas clases se dictaron y en cuántas se tomó lista", page.getByText(/clases dictadas · asistencia tomada/), { sostener: 4 });
  await g.paso("La planilla tiene un alumno por fila y una columna por clase", planilla, { sostener: 3.4 });
  await g.paso("Cada celda indica presente, tarde, ausente o justificado", planilla.locator("tbody tr").first(), { sostener: 3.4 });
  await g.paso("La última fila cuenta cuántos estuvieron presentes en cada clase", planilla.locator("tfoot tr"), { sostener: 3.4 });
  await g.paso("El porcentaje sale solo de las clases dictadas con lista tomada", planilla.locator("thead th").last(), { sostener: 3.6 });
  await g.paso("Las clases futuras o suspendidas no cuentan para el porcentaje", page.getByText(/El porcentaje cuenta solo/), { sostener: 3.8 });
}
