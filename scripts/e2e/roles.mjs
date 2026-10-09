/**
 * Crear-roles — La dueña arma un rol propio y se lo asigna a una cuenta.
 *
 * El recorrido que importa es el de punta a punta: un rol creado desde la
 * pantalla tiene que REGIR para quien lo recibe. Que el alta responda 201 no
 * prueba nada si después la cuenta puede ver la plata (o no puede ver nada,
 * que es lo que pasa si la llave del rol no resuelve).
 */

/** Fetcher con tarro propio, para entrar con la cuenta nueva. */
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
    let json = null;
    try {
      json = await res.clone().json();
    } catch {}
    return { res, json };
  };
}

export async function seccionRoles({ api, ok, BASE }) {
  console.log("\n== Crear roles: alta, asignación, permisos y baja ==");

  const sello = Date.now();
  const nombre = `Coordinación académica ${sello}`;
  const capacidades = [
    "academico.ver",
    "academico.editar",
    "asistencia.ver",
    "asistencia.editar",
    "evaluacion.ver",
    "evaluacion.editar",
    "contactos.ver",
  ];

  // ---- Alta.
  const alta = await api("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({ name: `  ${nombre} `, capabilities: [...capacidades, "borrar.la.base"] }),
  });
  const rol = alta.json?.role;
  ok(
    "crear un rol responde 201 con nombre limpio, llave propia y sin capacidades inventadas",
    alta.res.status === 201 &&
      rol?.name === nombre &&
      /^rol_[0-9a-z]+$/.test(rol?.key ?? "") &&
      rol?.system === false &&
      JSON.stringify([...(rol?.capabilities ?? [])].sort()) === JSON.stringify([...capacidades].sort()),
    `${alta.res.status} ${JSON.stringify(alta.json)}`
  );

  const repetido = await api("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({ name: nombre.toUpperCase(), capabilities: [] }),
  });
  ok(
    "un nombre repetido (sin mirar mayúsculas) responde 409",
    repetido.res.status === 409 && repetido.json?.error?.code === "duplicate_name",
    `${repetido.res.status} ${JSON.stringify(repetido.json?.error)}`
  );

  const corto = await api("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({ name: " x ", capabilities: [] }),
  });
  ok("un nombre de una letra responde 422", corto.res.status === 422, `${corto.res.status}`);

  const lista = await api("/api/settings/roles");
  ok(
    "el rol nuevo aparece en la lista, que es la que usa el selector de Equipo",
    (lista.json?.roles ?? []).some((r) => r.id === rol?.id && r.memberCount === 0),
    `${lista.res.status}`
  );

  // ---- Asignación: alta de una cuenta del equipo con el rol nuevo.
  const correo = `rol-${sello}@example.com`;
  const clave = `clave-rol-${sello}`;
  const cuenta = await api("/api/settings/team", {
    method: "POST",
    body: JSON.stringify({ name: "Coordinadora E2E", email: correo, password: clave, roleKey: rol?.key }),
  });
  ok("dar de alta una cuenta con el rol nuevo responde 201", cuenta.res.status === 201, `${cuenta.res.status} ${JSON.stringify(cuenta.json)}`);

  const jar = { cookie: "" };
  const como = conJar(BASE, jar);
  const login = await como("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.201" },
    body: JSON.stringify({ email: correo, password: clave }),
  });
  ok("la cuenta nueva entra", login.res.ok, `${login.res.status}`);

  const cursos = await como("/api/courses");
  ok("con el rol nuevo, lo académico responde 200", cursos.res.status === 200, `${cursos.res.status}`);
  const cohortes = await como("/api/cohorts");
  ok("y las cohortes también", cohortes.res.status === 200, `${cohortes.res.status}`);
  const plata = await como("/api/dashboard/finance");
  ok("la plata responde 403", plata.res.status === 403, `${plata.res.status}`);
  const inbox = await como("/api/conversations");
  ok("las conversaciones responden 403", inbox.res.status === 403, `${inbox.res.status}`);
  const rolesAjenos = await como("/api/settings/roles");
  ok("y la pantalla de roles, 403", rolesAjenos.res.status === 403, `${rolesAjenos.res.status}`);

  // ---- Edición: renombrar y cambiar capacidades rige en el próximo pedido.
  const renombre = await api(`/api/settings/roles/${rol?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: `${nombre} (tarde)` }),
  });
  ok(
    "renombrar responde 200 y la llave no cambia",
    renombre.res.status === 200 && renombre.json?.role?.key === rol?.key && renombre.json?.role?.memberCount === 1,
    `${renombre.res.status} ${JSON.stringify(renombre.json)}`
  );
  const choque = await api(`/api/settings/roles/${rol?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Dirección" }),
  });
  ok("renombrarlo como un rol que ya existe responde 409", choque.res.status === 409, `${choque.res.status}`);

  const recorte = await api(`/api/settings/roles/${rol?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ capabilities: ["contactos.ver"] }),
  });
  ok("quitarle lo académico responde 200", recorte.res.status === 200, `${recorte.res.status}`);
  const cursosDespues = await como("/api/courses");
  ok("y la cuenta pierde lo académico en el pedido siguiente (403)", cursosDespues.res.status === 403, `${cursosDespues.res.status}`);

  // ---- Escalada: quien configura sin ver la plata no puede repartirla.
  const configura = await api("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({
      name: `Configura sin plata ${sello}`,
      capabilities: ["configuracion.editar", "academico.ver"],
    }),
  });
  const correoB = `rol-b-${sello}@example.com`;
  const claveB = `clave-rol-b-${sello}`;
  await api("/api/settings/team", {
    method: "POST",
    body: JSON.stringify({
      name: "Configuradora E2E",
      email: correoB,
      password: claveB,
      roleKey: configura.json?.role?.key,
    }),
  });
  const jarB = { cookie: "" };
  const comoB = conJar(BASE, jarB);
  const loginB = await comoB("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.202" },
    body: JSON.stringify({ email: correoB, password: claveB }),
  });
  ok("setup: entra una cuenta que configura pero no ve la plata", configura.res.status === 201 && loginB.res.ok, `${configura.res.status} ${loginB.res.status}`);
  const escalada = await comoB("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({ name: `Caja ${sello}`, capabilities: ["academico.ver", "cobranza.editar"] }),
  });
  ok(
    "crear un rol con una capacidad que no tiene responde 403 (escalation)",
    escalada.res.status === 403 && escalada.json?.error?.code === "escalation",
    `${escalada.res.status} ${JSON.stringify(escalada.json?.error)}`
  );
  const escaladaPatch = await comoB(`/api/settings/roles/${rol?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ capabilities: ["contactos.ver", "cobranza.ver"] }),
  });
  ok(
    "y agregarla a un rol existente, también 403",
    escaladaPatch.res.status === 403 && escaladaPatch.json?.error?.code === "escalation",
    `${escaladaPatch.res.status} ${JSON.stringify(escaladaPatch.json?.error)}`
  );
  const dentro = await comoB("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({ name: `Lectura ${sello}`, capabilities: ["academico.ver"] }),
  });
  ok("con lo que sí tiene, crea el rol (201)", dentro.res.status === 201, `${dentro.res.status}`);
  if (dentro.json?.role?.id) {
    await api(`/api/settings/roles/${dentro.json.role.id}`, { method: "DELETE" });
  }

  // ---- Baja.
  const conCuenta = await api(`/api/settings/roles/${rol?.id}`, { method: "DELETE" });
  ok(
    "borrar un rol que una cuenta tiene asignado responde 409 y lo explica",
    conCuenta.res.status === 409 &&
      conCuenta.json?.error?.code === "role_in_use" &&
      /1 cuenta/.test(conCuenta.json?.error?.message ?? ""),
    `${conCuenta.res.status} ${JSON.stringify(conCuenta.json?.error)}`
  );

  // ---- Equipo: quien gestiona accesos sin configurar reparte roles.
  const accesos = await api("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({
      name: `Accesos sin configurar ${sello}`,
      capabilities: ["accesos.gestionar", "academico.ver", "contactos.ver"],
    }),
  });
  const correoC = `rol-c-${sello}@example.com`;
  const claveC = `clave-rol-c-${sello}`;
  await api("/api/settings/team", {
    method: "POST",
    body: JSON.stringify({
      name: "Accesos E2E",
      email: correoC,
      password: claveC,
      roleKey: accesos.json?.role?.key,
    }),
  });
  const comoC = conJar(BASE, { cookie: "" });
  const loginC = await comoC("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.203" },
    body: JSON.stringify({ email: correoC, password: claveC }),
  });
  ok("setup: entra una cuenta que gestiona accesos pero no configura", accesos.res.status === 201 && loginC.res.ok, `${accesos.res.status} ${loginC.res.status}`);

  const matrizC = await comoC("/api/settings/roles");
  ok("no ve la matriz de roles (403)", matrizC.res.status === 403, `${matrizC.res.status}`);
  const selectorC = await comoC("/api/settings/team/roles");
  const rolesC = selectorC.json?.roles ?? [];
  const dirC = rolesC.find((r) => r.key === "direccion");
  const rolC = rolesC.find((r) => r.id === rol?.id);
  ok(
    "pero sí el selector de Equipo, con Dirección no asignable y el rol creado asignable",
    selectorC.res.status === 200 && dirC?.assignable === false && rolC?.assignable === true,
    `${selectorC.res.status} ${JSON.stringify(rolesC.map((r) => [r.name, r.assignable]))}`
  );
  ok(
    "y el selector no trae la matriz de capacidades",
    rolesC.length > 0 && rolesC.every((r) => !("capabilities" in r)),
    JSON.stringify(rolesC[0] ?? null)
  );

  const correoD = `rol-d-${sello}@example.com`;
  const altaEscalada = await comoC("/api/settings/team", {
    method: "POST",
    body: JSON.stringify({ name: "No debería", email: correoD, password: "clave-larga-123", roleKey: "direccion" }),
  });
  ok(
    "dar de alta una cuenta con un rol que excede al propio responde 403",
    altaEscalada.res.status === 403 && altaEscalada.json?.error?.code === "escalation",
    `${altaEscalada.res.status} ${JSON.stringify(altaEscalada.json?.error)}`
  );
  const equipoTras = await api("/api/settings/team");
  ok(
    "y la cuenta no se creó",
    !(equipoTras.json?.members ?? []).some((m) => m.email === correoD),
    `${equipoTras.res.status}`
  );

  const equipoC = (await comoC("/api/settings/team")).json?.members ?? [];
  const yoC = equipoC.find((m) => m.isSelf);
  const fichaA = equipoC.find((m) => m.email === correo);
  const fichaB = equipoC.find((m) => m.email === correoB);
  const fichaOperador = equipoC.find((m) => m.role === "direccion");
  ok("la lista de equipo marca la fila propia", yoC?.email === correoC, JSON.stringify(yoC ?? null));

  const propio = await comoC(`/api/settings/team/${yoC?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ roleId: rol?.id }),
  });
  ok("cambiarse el rol propio responde 422", propio.res.status === 422 && propio.json?.error?.code === "self_change", `${propio.res.status} ${JSON.stringify(propio.json?.error)}`);

  const subir = await comoC(`/api/settings/team/${fichaA?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ roleId: dirC?.id }),
  });
  ok("asignarle a otra cuenta un rol que excede al propio responde 403", subir.res.status === 403 && subir.json?.error?.code === "escalation", `${subir.res.status} ${JSON.stringify(subir.json?.error)}`);

  const bajarSuperior = await comoC(`/api/settings/team/${fichaOperador?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ roleId: rol?.id }),
  });
  ok(
    "cambiarle el rol a alguien que puede más que uno responde 403",
    bajarSuperior.res.status === 403 && bajarSuperior.json?.error?.code === "escalation",
    `${bajarSuperior.res.status} ${JSON.stringify(bajarSuperior.json?.error)}`
  );
  const bajarB = await comoC(`/api/settings/team/${fichaB?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ roleId: rol?.id }),
  });
  ok("también a quien configura, si uno no configura (403)", bajarB.res.status === 403, `${bajarB.res.status}`);

  const inexistente = await comoC(`/api/settings/team/mem_no_existe`, {
    method: "PATCH",
    body: JSON.stringify({ roleId: rol?.id }),
  });
  ok("una cuenta inexistente responde 404", inexistente.res.status === 404, `${inexistente.res.status}`);

  // Dirección mueve a la coordinadora al rol de accesos y vuelve: rige al toque.
  const mover = await api(`/api/settings/team/${fichaA?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ roleId: accesos.json?.role?.id }),
  });
  ok("Dirección cambia el rol de una cuenta (200)", mover.res.status === 200 && mover.json?.member?.role === accesos.json?.role?.key, `${mover.res.status} ${JSON.stringify(mover.json)}`);
  const equipoA = await como("/api/settings/team");
  ok("y la cuenta gana lo del rol nuevo en el pedido siguiente (equipo 200)", equipoA.res.status === 200, `${equipoA.res.status}`);

  const sinUso = await api(`/api/settings/roles/${rol?.id}`, { method: "DELETE" });
  ok("con la cuenta movida, el rol que quedó sin uso se borra (200)", sinUso.res.status === 200, `${sinUso.res.status} ${JSON.stringify(sinUso.json)}`);

  const sistema = (lista.json?.roles ?? []).find((r) => r.system && r.id.startsWith("rol_"));
  if (sistema) {
    const borrarSistema = await api(`/api/settings/roles/${sistema.id}`, { method: "DELETE" });
    ok(
      "un rol de sistema no se borra (409)",
      borrarSistema.res.status === 409 && borrarSistema.json?.error?.code === "system_role",
      `${borrarSistema.res.status} ${JSON.stringify(borrarSistema.json?.error)}`
    );
  }

  const libre = await api("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({ name: `Rol descartable ${sello}`, capabilities: ["academico.ver"] }),
  });
  const borrarLibre = await api(`/api/settings/roles/${libre.json?.role?.id}`, { method: "DELETE" });
  ok("un rol sin cuentas se borra (200)", borrarLibre.res.status === 200, `${borrarLibre.res.status}`);
  const despues = await api("/api/settings/roles");
  ok(
    "y desaparece de la lista",
    !(despues.json?.roles ?? []).some((r) => r.id === libre.json?.role?.id),
    `${despues.res.status}`
  );
}
