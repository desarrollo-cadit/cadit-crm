/** Licencias: cambiar de equipo, desasignar y mover un programa, sobre una inscripción creada por el guion. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "soporte";
export const ruta = "/licencias";

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const nombre = `Guia${suf}`;

  // Datos de apoyo: una inscripción propia con AutoCAD en el equipo ATC UY.
  const { api } = await apiComo("direccion");
  const lic = exigir("licencias", await api("/api/licenses"));
  const autocad = lic.programas.find((p) => p.name === "AutoCAD");
  const uy = lic.equipos.find((e) => e.name === "ATC UY");
  const grupo = (await api("/api/cohorts")).json.cohorts.find((c) => c.name === "AutoCAD 2D");
  const vendedor = (await api("/api/sellers")).json.sellers.find((s) => !s.archived);
  const insc = exigir(
    "inscripción",
    await api("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({
        cohortId: grupo.id,
        sellerId: vendedor.id,
        contact: { firstName: nombre, lastName: "Demostración", email: `${nombre.toLowerCase()}@demo.test` },
      }),
    })
  );
  exigir(
    "asignar",
    await api(`/api/enrollments/${insc.enrollment.id}/license`, {
      method: "PUT",
      body: JSON.stringify({ softwareId: autocad.softwareId, teamId: uy.id }),
    })
  );
  await page.reload({ waitUntil: "load" });
  await page.getByRole("button", { name: "AutoCAD", exact: true }).first().waitFor({ timeout: 120000 });
  await g.pausa(1);
  g.comenzar();

  await g.paso(
    "Para trabajar con una licencia, abra el programa en la lista",
    page.getByRole("button", { name: "AutoCAD", exact: true }).first(),
    { accion: "clic", sostener: 3, despues: () => page.getByRole("heading", { name: "AutoCAD" }).last().waitFor() }
  );

  const buscador = page.getByPlaceholder("Buscar alumno o profesor…");
  await g.paso("Busque a la persona por su nombre", buscador.locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), {
    sostener: 3,
    despues: async () => {
      await g.escribir(buscador, nombre);
      await page.getByRole("button", { name: /Desasignar/ }).first().waitFor();
    },
  });

  const fila = page.getByRole("row", { name: new RegExp(nombre) });
  await g.paso("«Equipo» pasa la licencia al cupo de otro equipo de Autodesk", fila.getByRole("button", { name: /Cambiar de equipo/ }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.getByRole("dialog").waitFor(),
  });

  await g.paso(
    "Elija el equipo de destino: se indica cuántas licencias libres tiene",
    page.getByRole("dialog"),
    {
      sostener: 3.6,
      despues: async () => {
                const op = await page.locator("#mover-licencia-destino option").allTextContents();
        const i = op.findIndex((t) => /ATC PY/.test(t));
        await page.locator("#mover-licencia-destino").selectOption({ index: i });
      },
    }
  );

  await g.paso("Confirme el cambio: la licencia ahora descuenta del equipo elegido", page.getByRole("dialog").getByRole("button", { name: "Cambiar de equipo" }), {
    accion: "clic",
    sostener: 3.4,
    despues: async () => {
      await page.getByRole("row", { name: new RegExp(`${nombre}.*ATC PY`) }).waitFor();
    },
  });

  await g.paso("«Desasignar» devuelve la licencia al stock del programa", fila.getByRole("button", { name: "Desasignar" }), {
    accion: "clic",
    sostener: 3.2,
    despues: () => page.getByRole("dialog").waitFor(),
  });

  await g.paso("Confirme: la licencia queda libre para otra persona", page.getByRole("dialog"), {
    sostener: 3,
    despues: async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Desasignar" }).click();
      await page.getByText("Nadie tiene este programa asignado.").or(page.getByText(/Ninguna licencia coincide/)).waitFor();
    },
  });

  const mover = page
    .getByRole("heading", { name: "ATC PY" })
    .locator("xpath=ancestor::*[contains(@class,'rounded')][1]")
    .getByRole("button", { name: /Mover AutoCAD/ });
  await g.paso("«Mover» pasa un programa completo, con su cupo, a otro equipo", mover, {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.getByRole("dialog").waitFor(),
  });

  await g.paso(
    "Si el destino ya tiene el programa, hay que marcar que se suman los cupos",
    page.getByRole("dialog"),
    { sostener: 4.2 }
  );
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
}
