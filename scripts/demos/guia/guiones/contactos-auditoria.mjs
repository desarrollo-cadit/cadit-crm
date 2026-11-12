import { id } from "../ids.mjs";
/** Pestaña Administración: auditoría de un alumno. */
export const rol = "direccion";
export const ruta = `/contacts/${id("auditoria")}/legajo`;

export async function guion(g) {
  const { page } = g;
  await page.getByRole("tab", { name: "Administración" }).waitFor();
  const tarjeta = (t) => page.getByText(t, { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

  await g.paso("La pestaña «Administración» solo existe para quien tiene permiso de auditoría", page.getByRole("tab", { name: "Administración" }), {
    accion: "clic",
    sostener: 3.8,
    despues: () => page.getByText("Inicios de sesión").first().waitFor(),
  });
  await g.paso("Inicios de sesión: fecha, dispositivo y dirección IP de cada ingreso al portal", tarjeta("Inicios de sesión"), { sostener: 4.4 });
  await g.paso("Progreso en cursos offline: temas, cuestionarios aprobados e intentos", tarjeta("Progreso en cursos offline"), { sostener: 4.4 });
  await g.paso("Últimas interacciones: asistencia, avance e ingresos, de lo más reciente a lo más antiguo", tarjeta("Últimas interacciones"), { sostener: 4.4 });
  await g.paso("El registro de actividad anota lo que el sistema guardó sobre la persona", tarjeta("Registro de actividad"), { sostener: 4 });
  await g.paso("Los datos de esta pestaña no viajan con el legajo: se piden aparte y exigen el permiso", null, { sostener: 3.6 });
}
