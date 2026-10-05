/**
 * Cambio de contraseña forzado en el primer ingreso (y voluntario después).
 *
 * Dos cosas viven acá:
 *
 * 1. `alEntrar()` — el paso que una persona real da al entrar con una
 *    contraseña asignada: elegir la suya. Los bloques que abren PANTALLAS con
 *    una cuenta invitada o dada de alta por el staff lo llaman después del
 *    login; sin eso, cada pantalla respondería con un 307 a
 *    `/cambiar-contrasena` y los checks del bloque mirarían la página
 *    equivocada (o, peor, pasarían de casualidad: un 307 no es un 403).
 *    Recuerda la contraseña vigente de cada correo para que un bloque
 *    posterior que reusa la cuenta (la 027 reusa el soporte de la 026) entre
 *    con la que corresponde.
 *
 * 2. `seccionCambioDeContrasena()` — el bloque propio de la feature.
 */

const vigentes = new Map();

/** La contraseña "propia" que el arnés elige en lugar de la asignada. */
export const clavePropia = (asignada) => `${asignada}-propia`;

/** La contraseña con la que entra HOY esta cuenta, según lo que el arnés cambió. */
export const claveVigente = (email, asignada) => vigentes.get(email.toLowerCase()) ?? asignada;

/**
 * Si el login dice que la contraseña es asignada, elige una propia. `como`
 * es el fetcher con el tarro de esa sesión: la respuesta trae la cookie
 * nueva (cambiar cierra las otras sesiones, la propia incluida).
 */
export async function alEntrar(como, login, email, actual, headers = {}) {
  if (!login?.json?.user?.mustChangePassword) return null;
  const nueva = clavePropia(actual);
  const r = await como("/api/account/password", {
    method: "POST",
    headers,
    body: JSON.stringify({ currentPassword: actual, newPassword: nueva }),
  });
  if (r.res.ok) vigentes.set(email.toLowerCase(), nueva);
  return r;
}

/** Fetcher con tarro propio; no sigue redirecciones para poder verlas. */
function conJar(BASE, jar) {
  return async (p, opts = {}) => {
    const res = await fetch(`${BASE}${p}`, {
      redirect: "manual",
      ...opts,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
        ...(opts.headers ?? {}),
      },
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) jar.cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { res, json, text };
  };
}

const destino = (r) => r.res.headers.get("location") ?? "";

export async function seccionCambioDeContrasena({ api, ok, BASE, getCookie }) {
  console.log("\n== Cambio de contraseña: forzado en el primer ingreso ==");

  const sello = Date.now();
  // Cada persona entra desde su propia dirección (TEST-NET-1, RFC 5737): el
  // login y el cambio de contraseña tienen límite por IP.
  let ip = 0;
  const otraIp = () => ({ "x-forwarded-for": `192.0.2.${++ip}` });
  const isoDia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  // ---- Una persona inscripta, con acceso al portal y contraseña asignada.
  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Contraseña ${sello}`, published: false }),
  });
  const cohorte = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: curso.json?.course?.id,
      name: `Contraseña ${sello}`,
      startDate: isoDia(-7),
      endDate: isoDia(60),
    }),
  });
  const correo = `clave-${sello}@example.com`;
  const insc = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: cohorte.json?.cohort?.id,
      contact: { firstName: "Clara", lastName: "Propia", email: correo, phone: `5989${String(sello).slice(-7)}` },
    }),
  });
  const enrollmentId = insc.json?.enrollment?.id ?? insc.json?.id;
  const acceso = await api(`/api/enrollments/${enrollmentId}/access`, { method: "POST" });
  const asignada = acceso.json?.temporaryPassword;
  ok(
    "setup: alumna inscripta y con acceso al portal",
    Boolean(enrollmentId) && Boolean(asignada),
    `${insc.res.status} ${acceso.res.status} ${JSON.stringify(acceso.json?.error ?? null)}`
  );

  const ipAlumna = otraIp();
  const jar = { cookie: "" };
  const como = conJar(BASE, jar);
  const login = await como("/api/auth/sign-in/email", {
    method: "POST",
    headers: ipAlumna,
    body: JSON.stringify({ email: correo, password: asignada }),
  });
  ok("entra con la contraseña asignada", login.res.ok, `${login.res.status}`);
  ok(
    "y la sesión dice que la contraseña es asignada",
    login.json?.user?.mustChangePassword === true,
    JSON.stringify(login.json?.user ?? null)
  );

  // Una segunda sesión abierta con la contraseña del correo: la que podría
  // tener otra persona que leyó el mensaje.
  const jarAjeno = { cookie: "" };
  const comoAjeno = conJar(BASE, jarAjeno);
  await comoAjeno("/api/auth/sign-in/email", {
    method: "POST",
    headers: otraIp(),
    body: JSON.stringify({ email: correo, password: asignada }),
  });

  const portalAntes = await como("/portal");
  ok(
    "el portal la manda a elegir su contraseña (307 → /cambiar-contrasena)",
    portalAntes.res.status === 307 && destino(portalAntes).endsWith("/cambiar-contrasena"),
    `${portalAntes.res.status} ${destino(portalAntes)}`
  );
  const pantallaForzada = await como("/cambiar-contrasena");
  ok(
    "la pantalla de cambio responde, sin bucle, con el texto del primer ingreso",
    pantallaForzada.res.status === 200 &&
      pantallaForzada.text.includes("Elegí tu contraseña") &&
      pantallaForzada.text.includes("la generó la academia"),
    `${pantallaForzada.res.status}`
  );
  const apiPortal = await como("/api/portal/me");
  ok(
    "la API no se bloquea a propósito: solo las pantallas redirigen",
    apiPortal.res.status === 200,
    `${apiPortal.res.status}`
  );

  // ---- Caminos infelices.
  const sinSesion = await fetch(`${BASE}/api/account/password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ currentPassword: asignada, newPassword: "otra-clave-123" }),
  });
  ok("sin sesión, el cambio responde 401", sinSesion.status === 401, `${sinSesion.status}`);

  const equivocada = await como("/api/account/password", {
    method: "POST",
    headers: ipAlumna,
    body: JSON.stringify({ currentPassword: "no-es-esta-123", newPassword: clavePropia(asignada) }),
  });
  ok(
    "con la actual equivocada responde 400 y lo dice en castellano",
    equivocada.res.status === 400 &&
      equivocada.json?.error?.code === "wrong_current_password" &&
      /contraseña actual/.test(equivocada.json?.error?.message ?? ""),
    `${equivocada.res.status} ${JSON.stringify(equivocada.json)}`
  );
  const misma = await como("/api/account/password", {
    method: "POST",
    headers: ipAlumna,
    body: JSON.stringify({ currentPassword: asignada, newPassword: asignada }),
  });
  ok("repetir la misma responde 422", misma.res.status === 422, `${misma.res.status}`);
  const corta = await como("/api/account/password", {
    method: "POST",
    headers: ipAlumna,
    body: JSON.stringify({ currentPassword: asignada, newPassword: "corta" }),
  });
  ok("una nueva de menos de 8 responde 422", corta.res.status === 422, `${corta.res.status}`);
  const sigueForzada = await como("/portal");
  ok(
    "fallar no la libera: el portal la sigue mandando a cambiarla",
    sigueForzada.res.status === 307,
    `${sigueForzada.res.status}`
  );

  // ---- El cambio.
  const cambio = await alEntrar(como, login, correo, asignada, ipAlumna);
  ok(
    "elige su contraseña: 200, con la sesión nueva en la cookie",
    cambio?.res.status === 200 && (cambio?.res.headers.getSetCookie?.() ?? []).length > 0,
    `${cambio?.res.status} ${JSON.stringify(cambio?.json)}`
  );
  const portalDespues = await como("/portal");
  ok(
    "el portal ya no la redirige",
    portalDespues.res.status === 200,
    `${portalDespues.res.status} ${destino(portalDespues)}`
  );
  const voluntaria = await como("/cambiar-contrasena");
  ok(
    "y la pantalla de cambio pasa a ser la voluntaria",
    voluntaria.res.status === 200 &&
      voluntaria.text.includes("Cambiar contraseña") &&
      !voluntaria.text.includes("Elegí tu contraseña"),
    `${voluntaria.res.status}`
  );
  const ajenoDespues = await comoAjeno("/api/portal/me");
  ok(
    "la sesión abierta con la contraseña del correo quedó cerrada",
    ajenoDespues.res.status === 401,
    `${ajenoDespues.res.status}`
  );

  const conVieja = await conJar(BASE, { cookie: "" })("/api/auth/sign-in/email", {
    method: "POST",
    headers: otraIp(),
    body: JSON.stringify({ email: correo, password: asignada }),
  });
  ok("la contraseña del correo ya no sirve para entrar", conVieja.res.status === 401, `${conVieja.res.status}`);
  const conNueva = await conJar(BASE, { cookie: "" })("/api/auth/sign-in/email", {
    method: "POST",
    headers: otraIp(),
    body: JSON.stringify({ email: correo, password: clavePropia(asignada) }),
  });
  ok(
    "la suya sí, y ya sin la marca",
    conNueva.res.ok && conNueva.json?.user?.mustChangePassword === false,
    `${conNueva.res.status} ${JSON.stringify(conNueva.json?.user ?? null)}`
  );

  // ---- El staff.
  const panelOperador = await fetch(`${BASE}/`, {
    redirect: "manual",
    headers: { cookie: getCookie(), origin: BASE },
  });
  ok(
    "quien eligió su propia contraseña no es forzado: el panel responde 200",
    panelOperador.status === 200,
    `${panelOperador.status} ${panelOperador.headers.get("location") ?? ""}`
  );

  const correoStaff = `e2e.clave-${sello}@vocero.test`;
  const claveStaff = "asignada-por-direccion";
  const alta = await api("/api/settings/team", {
    method: "POST",
    body: JSON.stringify({ name: "Staff Clave E2E", email: correoStaff, password: claveStaff, roleKey: "soporte" }),
  });
  const ipStaff = otraIp();
  const jarStaff = { cookie: "" };
  const comoStaff = conJar(BASE, jarStaff);
  const loginStaff = await comoStaff("/api/auth/sign-in/email", {
    method: "POST",
    headers: ipStaff,
    body: JSON.stringify({ email: correoStaff, password: claveStaff }),
  });
  const panelStaff = await comoStaff("/inbox");
  ok(
    "una cuenta del equipo con contraseña escrita por otra persona también es forzada",
    alta.res.status === 201 && loginStaff.res.ok && panelStaff.res.status === 307 &&
      destino(panelStaff).endsWith("/cambiar-contrasena"),
    `${alta.res.status} ${loginStaff.res.status} ${panelStaff.res.status} ${destino(panelStaff)}`
  );
  await alEntrar(comoStaff, loginStaff, correoStaff, claveStaff, ipStaff);
  const panelStaffDespues = await comoStaff("/inbox");
  ok(
    "y después de elegir la suya entra a su panel",
    panelStaffDespues.res.status === 200,
    `${panelStaffDespues.res.status} ${destino(panelStaffDespues)}`
  );
}
