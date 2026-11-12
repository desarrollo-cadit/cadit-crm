/** Venta de empresa: pasar a varios alumnos de una empresa a UNA venta (titular y cubiertos). */
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
const { grupoId, sello } = await armarGrupo(api, { inicio: 10, fin: 45, alumnos: 3, empresa: true, monto: 800000 });
const empresa = `Constructora Guía ${sello} S.A.`;
export const ruta = `/facturacion?grupo=${grupoId}`;

export async function guion(g) {
  const { page } = g;
  const fila = page.getByText(empresa).first().locator("xpath=ancestor::tr[1]");

  await g.paso("En Facturación, los alumnos de una misma empresa y grupo aparecen agrupados", fila, { sostener: 3.6 });

  await g.paso("«Pasar a una sola venta» gestiona el total, las cuotas y los pagos una vez", page.getByRole("button", { name: "Pasar a una sola venta" }).first(), {
    accion: "clic",
    sostener: 3.2,
    despues: async () => page.getByRole("dialog").waitFor({ timeout: 10000 }),
  });

  await g.paso("Se elige el alumno titular: en él se guarda la venta de toda la empresa", page.getByLabel("Alumno titular de la venta"), { sostener: 3.6 });

  await g.paso("Y el total que se factura a la empresa; los demás quedan incluidos sin monto propio", page.getByRole("dialog"), { sostener: 4.2 });

  await g.paso("Solo se puede si ningún alumno tiene cuotas o pagos cargados por persona", page.getByRole("dialog").getByRole("button", { name: "Pasar a una sola venta" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByText("Seguimiento de pagos de la empresa").first().waitFor({ timeout: 20000 }),
  });

  await g.paso("Desde el seguimiento de la empresa se carga el plan de cuotas y los pagos", page.getByText("Seguimiento de pagos de la empresa").first(), {
    accion: "clic",
    sostener: 3.4,
    despues: async () => g.pausa(1.5),
  });

  await g.paso("Los alumnos cubiertos ya no llevan cuotas ni pagos propios", page.getByText("Titular de la venta de la empresa").first().locator("xpath=ancestor::tr[1]"), { sostener: 4 });
}
