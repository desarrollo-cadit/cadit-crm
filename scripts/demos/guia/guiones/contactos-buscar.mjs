/** Alumnos: buscar y filtrar el listado de contactos. */
import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/contacts";

/** Pedido a la API con la sesión del propio navegador (no gasta otro ingreso). */
async function api(page, metodo, destino, data) {
  const r = await page.request.fetch(new URL(destino, page.url()).href, { method: metodo, data, timeout: 120000 });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok()) throw new Error(`${metodo} ${destino}: ${r.status()} ${JSON.stringify(cuerpo)}`);
  return cuerpo;
}
const telefonoAlAzar = () => `09${Math.floor(1000000 + Math.random() * 8999999)}`;

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const telefono = telefonoAlAzar();
  const correo = `ximena.bonfiglio.${suf}@demo.test`;

  // Dato de apoyo: una persona que llegó hace un momento por un formulario.
  const { contact } = await api(page, "POST", "/api/contacts", {
    firstName: "Ximena",
    lastName: "Bonfiglio",
    phone: telefono,
    email: correo,
    notes: `Consultó por Revit (demo ${suf})`,
  });
  await api(page, "PATCH", `/api/contacts/${contact.id}`, { source: "formulario:Landing Revit" });
  await page.reload({ waitUntil: "load" });
  await page.getByRole("group", { name: "Tipo de contacto" }).waitFor();
  await g.pausa(1.5);
  g.comenzar();

  const buscador = page.getByRole("searchbox");
  const tarjeta = page
    .getByRole("group", { name: "Tipo de contacto" })
    .locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
  const fila = page.getByRole("row").filter({ hasText: correo });
  /** Espera la respuesta del listado con ese filtro (el resultado viejo sigue en pantalla hasta entonces). */
  const listado = (cond) =>
    page.waitForResponse(
      (r) => {
        if (!r.url().includes("/api/contacts?")) return false;
        const p = new URL(r.url()).searchParams;
        return cond(p);
      },
      { timeout: 90000 }
    );
  const buscar = async (texto) => {
    const respuesta = listado((p) => p.get("q") === texto);
    await g.escribir(buscador, texto);
    await respuesta;
    await fila.waitFor();
    await g.pausa(0.5);
  };
  const pestana = (nombre) => page.getByRole("group", { name: "Tipo de contacto" }).getByRole("button", { name: nombre });

  await g.paso("Alumnos reúne a todas las personas que tienen contacto con la academia", tarjeta, { sostener: 3.4 });

  await g.paso(
    "Las pestañas separan leads, alumnos activos y exalumnos, con la cantidad de cada uno",
    page.getByRole("group", { name: "Tipo de contacto" }),
    { sostener: 4.4 }
  );

  await g.paso("Cada palabra se busca en nombre, apellido, correo y teléfono, en cualquier orden y sin tildes", buscador, {
    sostener: 5.2,
    despues: () => buscar("bonfiglio ximena"),
  });

  await g.paso("Lo encontrado queda resaltado en cada fila", fila, { sostener: 3.2 });

  await g.paso("También se busca por teléfono o por correo electrónico, sin importar cómo se escriba", buscador, {
    sostener: 4,
    despues: () => buscar(telefono),
  });

  await g.paso(
    "«Nuevo» marca a quien llegó por un formulario en las últimas 48 horas",
    fila.getByText("Nuevo", { exact: true }),
    { sostener: 4 }
  );

  await g.paso("«Limpiar filtros» vuelve al listado completo", page.getByRole("button", { name: "Limpiar filtros" }), {
    accion: "clic",
    sostener: 3,
  });
}
