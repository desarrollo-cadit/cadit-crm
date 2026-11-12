/** Suspender una clase (con su reemplazo automático) y crear reemplazos en lote. */
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
const { grupoId } = await armarGrupo(api, { inicio: -7, fin: 21, alumnos: 2 });
// Dos clases ya suspendidas SIN reemplazo, para mostrar «Crear reemplazos» (sugerencias en lote).
const clases = ((await api(`/api/cohorts/${grupoId}/classes`)).json?.classes ?? []).filter((c) => c.id);
for (const c of clases.slice(-3, -1)) {
  exigir(
    "suspensión previa",
    await api(`/api/class-sessions/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cancelReason: "Feriado local", autoReplacement: false }),
    })
  );
}
export const ruta = `/cohorts/${grupoId}?tab=clases`;

export async function guion(g) {
  const { page } = g;

  await g.paso("Cada clase vigente tiene un botón Suspender", page.getByRole("button", { name: "Suspender" }).nth(2), {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByRole("dialog").waitFor({ timeout: 10000 }),
  });

  await g.escribir(page.getByPlaceholder("¿Por qué se suspende?"), "Profesor con licencia médica");
  await g.paso("Se escribe el motivo: una clase suspendida deja de contar para la asistencia", page.getByRole("dialog"), { sostener: 3.6 });

  await g.paso(
    "«Crear sola la clase de reemplazo» la agenda en el próximo día de cursada libre",
    page.getByText("Crear sola la clase de reemplazo").locator("xpath=ancestor::label[1]"),
    { sostener: 4 }
  );

  await g.paso("Al confirmar, la clase queda suspendida y se crea su reemplazo", page.getByRole("button", { name: "Suspender clase" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByText(/Se creó la clase de reemplazo/).waitFor({ timeout: 20000 }),
  });

  await g.paso("El aviso indica la fecha del reemplazo y si el fin o la entrega final se corrieron", page.getByRole("dialog"), { sostener: 4.4 });
  await page.getByRole("button", { name: "Listo" }).click();

  await g.paso("Las suspendidas sin reemplazo se reponen todas juntas", page.getByRole("button", { name: "Crear reemplazos" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByRole("button", { name: /Aceptar todas las sugerencias/ }).waitFor({ timeout: 15000 }),
  });

  await g.paso("Cada fila propone un día: se acepta, se cambia o se ignora", page.getByRole("dialog"), { sostener: 4 });
}
