/**
 * Sonda para escribir guiones: entra como un rol, abre una pantalla, guarda una
 * captura y lista lo que se puede señalar (títulos, pestañas, botones, campos).
 *
 *   node scripts/demos/guia/sonda.mjs direccion /contacts
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const [rol = "direccion", ruta = "/"] = process.argv.slice(2);
const BASE = process.env.APP_BASE_URL ?? "http://localhost:3006";
const SALIDA = path.resolve("demos-output/guia");
const CLAVE = "Demo-Guia-2026";

let email = `demo.${rol}@demo.test`;
if (rol === "alumno" || rol === "profesor") {
  email = JSON.parse(await readFile(path.join(SALIDA, "cuentas.json"), "utf8"))[rol];
}

const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email, password: CLAVE }),
});
if (!res.ok) throw new Error(`ingreso: ${res.status}`);
const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => {
  const [par] = c.split(";");
  const i = par.indexOf("=");
  return { name: par.slice(0, i), value: par.slice(i + 1), url: BASE };
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-UY" });
await context.addCookies(cookies);
const page = await context.newPage();
// `networkidle` no sirve: el SSE de /api/events deja la red siempre abierta.
await page.goto(`${BASE}${ruta}`, { waitUntil: "load" });
await page.waitForTimeout(2500);

await mkdir(path.join(SALIDA, "sonda"), { recursive: true });
const archivo = path.join(SALIDA, "sonda", `${rol}${ruta.replace(/[^\w]+/g, "-")}.png`);
await page.screenshot({ path: archivo });

const lista = await page.evaluate(() => {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0;
  };
  const t = (e) => (e.innerText || e.getAttribute("aria-label") || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const sel = (q) => [...document.querySelectorAll(q)].filter(visible).map(t).filter(Boolean);
  return {
    url: location.pathname + location.search,
    titulos: sel("h1,h2,h3"),
    pestanas: sel('[role="tab"]'),
    botones: sel("button,a[role=button]").slice(0, 40),
    campos: sel("input,select,textarea").slice(0, 20),
  };
});
console.log(JSON.stringify(lista, null, 1));
console.log("captura:", archivo);
await browser.close();
