import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import {
  CAPABILITIES,
  sessionCapabilities,
  type Capability,
} from "@/lib/capabilities";
import { agruparCapacidades, caminoVisible, GUIA_CAPACIDADES } from "@/lib/guia";
import { listRoles } from "@/server/roles";

export const dynamic = "force-dynamic";

/**
 * 027 (US1) — La guía del staff: qué puedo hacer y dónde está cada cosa.
 *
 * El sistema ya sabía perfectamente qué puede hacer cada persona —lo decide en
 * cada request, con `requireCapability`— y no se lo decía a nadie. La
 * información existía, estaba tipada, y sólo se usaba para negar.
 *
 * Se arma con las capacidades REALES de la sesión, no con el nombre del rol:
 * los roles se renombran y se editan desde `/settings/roles`, y una guía que
 * dijera "si sos Coordinación podés…" miente en cuanto alguien toca esa
 * pantalla.
 *
 * FR-005 — El filtro corre acá, en el servidor, con la MISMA fuente que
 * alimenta el menú (`sessionCapabilities`). No se manda el mapa entero al
 * navegador para filtrarlo ahí: el filtro tiene que vivir donde vive la
 * decisión.
 *
 * FR-008 — No exige capacidad. Un manual que hay que tener permiso para leer
 * no es un manual, y quien menos permisos tiene es justamente quien más
 * necesita saber dónde termina lo suyo.
 */
export default async function GuiaPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const mias = sessionCapabilities(session);
  const propias = CAPABILITIES.filter((c) => mias.includes(c));
  const ajenas = CAPABILITIES.filter((c) => !mias.includes(c));

  /**
   * FR-007/FR-014 — La ÚNICA lectura de la pantalla, y no es de dominio: los
   * roles de la organización, para poder decir quién hace lo que yo no hago.
   * Se leen de la base y no del código, así que si el dueño le mueve las
   * capacidades a un rol la guía lo refleja sin que nadie la toque (FR-019).
   */
  const roles = await listRoles(session.organizationId, session.role);
  const rolesCon = (c: Capability) =>
    roles.filter((r) => r.capabilities.includes(c)).map((r) => r.name);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Qué podés hacer</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Esta guía sale de los mismos permisos con los que el sistema te deja
          entrar a cada pantalla, dice exactamente lo que tu cuenta
          puede hacer hoy. Si alguien cambia los permisos de tu rol, cambia sola.
        </p>

        {propias.length === 0 ? (
          <p className="mt-8 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Tu cuenta todavía no tiene ningún permiso asignado. Pedile a quien
            administra la instancia que te asigne un rol: hasta entonces vas a
            ver el panel vacío.
          </p>
        ) : (
          <div className="mt-7 space-y-7">
            {agruparCapacidades(propias).map((grupo) => (
              <section key={grupo.titulo}>
                <h2 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
                  {grupo.titulo}
                </h2>
                <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                  {grupo.capacidades.map((c) => (
                    <li key={c} className="px-4 py-3">
                      <p className="text-sm font-medium">
                        {mayuscula(GUIA_CAPACIDADES[c].que)}
                      </p>
                      {/*
                        El "dónde" se DERIVA de la declaración del menú
                        (FR-004): dice "CRM → Bandeja", que es lo que la
                        persona ve en la barra, y no una URL — nadie navega
                        escribiendo direcciones.
                      */}
                      <p className="mt-0.5 text-xs text-text-3">
                        {caminoVisible(GUIA_CAPACIDADES[c].donde)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/*
          DV-001 — Colapsada por default, y con `<details>`: sin JavaScript y
          sin una dependencia nueva (FR-013).

          Por qué existe esta sección, que es la parte discutible: ocultar lo
          que la persona no puede hacer es lo correcto en el MENÚ —un ítem que
          lleva a un 403 es una puerta cerrada con cartel de bienvenida—. Pero
          en una guía el efecto es el contrario: alguien que no encuentra
          "emitir certificados" concluye que el sistema no lo hace, y le
          pregunta al dueño. Que era el problema que vinimos a resolver.

          FR-007 — Dice QUÉ se puede hacer y QUÉ ROL lo tiene, y nada más. Sin
          enlace, porque no se ofrece una puerta que va a devolver 403; y sin
          nombres de personas, porque una guía que nombra gente es un
          directorio, y un directorio se desactualiza con cada alta y cada baja.
        */}
        {ajenas.length > 0 && (
          <details className="mt-9 rounded-md border border-border">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Esto lo hace otro rol ({ajenas.length})
            </summary>
            <div className="border-t border-border px-4 pb-4 pt-3">
              <p className="text-xs text-muted-foreground">
                El sistema hace todo esto, pero no con tu cuenta. Está acá para
                que sepas a quién pedírselo, no para que lo intentes: estas
                pantallas te van a responder que no tenés acceso.
              </p>
              <div className="mt-4 space-y-5">
                {agruparCapacidades(ajenas).map((grupo) => (
                  <section key={grupo.titulo}>
                    <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
                      {grupo.titulo}
                    </h3>
                    <ul className="mt-1.5 space-y-2">
                      {grupo.capacidades.map((c) => {
                        const quienes = rolesCon(c);
                        return (
                          <li key={c} className="text-sm">
                            <span className="text-text-2">
                              {mayuscula(GUIA_CAPACIDADES[c].que)}
                            </span>
                            <span className="block text-xs text-text-3">
                              {quienes.length > 0
                                ? `Lo hace: ${quienes.join(", ")}`
                                : "Hoy ningún rol lo tiene asignado"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Las descripciones se escriben en infinitivo y en minúscula ("emitir el
 * certificado…") porque así se leen bien adentro de una frase; en una lista
 * arrancan la línea, y ahí una minúscula parece un error de tipeo.
 */
function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
