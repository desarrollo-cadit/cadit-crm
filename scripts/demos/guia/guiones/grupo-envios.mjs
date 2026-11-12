/** Envíos al grupo: términos de la licencia y bienvenida, con vista previa y detalle. */
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

const { api } = await apiComo("direccion");
const { grupoId } = await armarGrupo(api, { inicio: 3, fin: 40, alumnos: 3, whatsapp: true });
const equipos = (await api("/api/license-teams")).json?.teams ?? [];
const programa = ((await api("/api/software")).json?.software ?? []).find((s) => s.name === "AutoCAD");
const equipo = equipos.find((t) => !t.archived && t.seats.some((x) => x.softwareId === programa?.id && x.libres >= 3));
if (!programa || !equipo) throw new Error("no hay un equipo con cupo de AutoCAD");
// Con la licencia del grupo ya asignada, los términos tienen a quién ir.
exigir(
  "licencia del grupo",
  await api(`/api/cohorts/${grupoId}/group-licenses`, {
    method: "POST",
    body: JSON.stringify({ softwareId: programa.id, teamId: equipo.id, expiresAt: null }),
  })
);
export const ruta = `/cohorts/${grupoId}?tab=alumnos`;

export async function guion(g) {
  const { page } = g;
  const panel = page.getByRole("region", { name: "Envíos al grupo" });
  const terminos = panel.getByRole("button", { name: /Términos de la licencia/ });

  await g.paso("«Envíos al grupo» manda correos solo a quienes todavía no los recibieron", panel, { sostener: 3.6 });

  await g.paso("El número entre paréntesis indica cuántas personas recibirían cada envío", panel.locator("div.flex-wrap").last(), { sostener: 3.4 });

  await g.paso("Términos de la licencia abre primero una vista previa de destinatarios", terminos, {
    accion: "clic",
    sostener: 3,
    despues: async () => page.getByRole("dialog").waitFor({ timeout: 10000 }),
  });

  await g.paso("Se detalla a quién se envía, quién ya lo recibió y quién queda fuera y por qué", page.getByRole("dialog"), { sostener: 4.6 });

  await g.paso("Confirmar inicia el envío; los correos salen de a uno", page.getByRole("dialog").getByRole("button", { name: /^Enviar a/ }), {
    accion: "clic",
    sostener: 3,
    despues: async () => panel.getByText(/enviados/).waitFor({ timeout: 30000 }),
  });

  await g.paso("El detalle muestra el resultado por alumno; si un correo falla, queda el motivo", panel.getByText(/enviados/).locator("xpath=ancestor::div[contains(@class,'bg-subtle')][1]"), { sostener: 4.2 });

  await g.paso("La bienvenida lleva el enlace al grupo de WhatsApp y funciona igual", panel.getByRole("button", { name: /Bienvenida/ }), { sostener: 3.4 });
}
