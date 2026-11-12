/** Configuración › Equipo: alta de una cuenta, rol y avisos internos. */
import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/settings/team";

export async function guion(g) {
  const { page } = g;
  const s = sufijo();
  const nombre = `Prueba Demo ${s}`;
  const correo = `prueba.demo.${s}@demo.test`;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");

  await g.paso(
    "Desde Equipo se crean las cuentas con acceso al panel",
    tarjeta(page.getByRole("heading", { name: "Crear cuenta de equipo" })),
    { sostener: 3.2 }
  );

  await g.paso("Se completan el nombre y el correo de la persona", page.locator("#team-name").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), {
    despues: async () => {
      await g.escribir(page.locator("#team-name"), nombre, { retardo: 45 });
      await g.escribir(page.locator("#team-email"), correo, { retardo: 35 });
    },
    sostener: 4.2,
  });

  await g.paso("El rol define qué puede hacer; sus permisos se ajustan en Roles", page.locator("#team-role"), {
    despues: async () => {
      const sel = page.locator("#team-role");
      const v = await sel.evaluate((s) => { const o = [...s.options].filter((x) => !x.disabled); return (o.find((x) => /^Soporte/.test(x.text)) ?? o[0])?.value; });
      await sel.selectOption(v);
    },
    sostener: 3.4,
  });

  await g.paso(
    "Si el correo es de un profesor con portal, la contraseña queda vacía y usa su misma cuenta",
    page.getByText("Si el correo es de un profesor con acceso al portal"),
    { sostener: 4 }
  );

  await g.paso("«Generar» propone una contraseña temporal", page.getByRole("button", { name: "Generar" }), {
    accion: "clic",
    sostener: 2.6,
  });

  await g.paso("«Crear cuenta» da de alta a la persona", page.getByRole("button", { name: "Crear cuenta" }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("Cuenta creada").waitFor({ timeout: 15000 });
    },
    sostener: 2.8,
  });

  await g.paso("La contraseña se muestra una sola vez: debe compartirse en ese momento", page.getByText("Cuenta creada").locator("xpath=.."), {
    sostener: 3.6,
  });

  const fila = page.locator("div.space-y-1.rounded-lg").filter({ hasText: correo });
  await g.paso("La cuenta nueva aparece en Miembros, con su rol editable", fila, { sostener: 3.4 });

  await g.paso(
    "Cada cuenta decide si recibe avisos internos por correo",
    fila.getByText("Recibir avisos internos por correo"),
    { accion: "clic", sostener: 3.4 }
  );
}
