/**
 * Comprobación del correo transaccional de Microsoft 365.
 *
 * Aísla la configuración de M365 del resto del sistema: no toca la base, no
 * lee inscripciones y no le manda nada a ningún alumno. Si esto falla, el
 * problema está en Azure o en el `.env`, en ningún otro lado.
 *
 *   pnpm verificar-correo tu-cuenta@dominio.com
 *
 * El destinatario es OBLIGATORIO y se pasa por argumento a propósito: un
 * destinatario por defecto es la forma de mandarle una prueba a alguien real
 * sin querer.
 *
 * Ver docs/correo-microsoft-365.md.
 */
import { getM365Config, sendMail } from "@/lib/m365/client";

const destino = process.argv[2];

if (!destino || !destino.includes("@")) {
  console.error("\n  Falta el destinatario.\n");
  console.error("    pnpm verificar-correo tu-cuenta@dominio.com\n");
  console.error("  Usá una casilla tuya: esto manda un correo de verdad.\n");
  process.exit(1);
}

console.log("\n  === Configuración ===\n");

const config = getM365Config();

/** Nunca imprime un valor: solo si está y cuánto mide. */
function estado(nombre: string, valor: string | undefined): void {
  const marca = valor ? "OK  " : "FALTA";
  const detalle = valor ? `${valor.length} caracteres` : "sin definir";
  console.log(`    ${marca}  ${nombre.padEnd(20)} ${detalle}`);
}

estado("M365_TENANT_ID", process.env.M365_TENANT_ID);
estado("M365_CLIENT_ID", process.env.M365_CLIENT_ID);
estado("M365_CLIENT_SECRET", process.env.M365_CLIENT_SECRET);
estado("M365_SENDER", process.env.M365_SENDER);
estado("M365_BCC", process.env.M365_BCC);

if (!config) {
  console.error(
    "\n  M365 no está configurado: faltan una o más de las cuatro obligatorias."
  );
  console.error("  El buzón emisor (M365_SENDER) tiene que ser un email válido.\n");
  process.exit(1);
}

// El tenant y el client son los dos un GUID y se confunden todo el tiempo.
if (config.tenantId === config.clientId) {
  console.error(
    "\n  M365_TENANT_ID y M365_CLIENT_ID tienen el MISMO valor.\n"
  );
  console.error("  Son cosas distintas: el tenant es la organización, el client es esta");
  console.error("  aplicación. Revisá cuál copiaste de cada pantalla.\n");
  process.exit(1);
}

console.log(`\n    buzón emisor: ${config.sender}`);
console.log(`    destinatario: ${destino}`);

console.log("\n  === Envío ===\n");

const resultado = await sendMail({
  to: destino,
  subject: "Prueba de correo — CadIT CRM",
  html: `
    <p>Si estás leyendo esto, el correo transaccional quedó configurado.</p>
    <p>Salió del buzón <strong>${config.sender}</strong> vía Microsoft Graph.</p>
    <p style="color:#666;font-size:13px">
      Enviado por <code>pnpm verificar-correo</code>. Es una prueba: no hace falta responder.
    </p>
  `,
  bcc: process.env.M365_BCC,
});

if (resultado.ok) {
  console.log("    Microsoft aceptó el envío (202).");
  console.log(`\n    Revisá la bandeja de ${destino}.`);
  console.log(`    Y "Elementos enviados" de ${config.sender}: tiene que estar la copia.\n`);
  process.exit(0);
}

console.error(`    FALLÓ (${resultado.code})\n`);
console.error(`    Microsoft dijo: ${resultado.message}\n`);
console.error("  Las causas más frecuentes:\n");
console.error("    401 / invalid_client       El secreto está mal o venció. ¿Copiaste el");
console.error("                               *Value* y no el *Secret ID*?");
console.error("    404 / ResourceNotFound     M365_SENDER no es un buzón real. Un ALIAS no");
console.error("                               sirve: tiene que ser la dirección principal");
console.error("                               (un buzón compartido va perfecto).");
console.error("    403 / ErrorAccessDenied    Falta el 'Grant admin consent' del permiso");
console.error("                               Mail.Send, o la Application Access Policy no");
console.error("                               incluye este buzón.");
console.error("    AADSTS700016               El M365_CLIENT_ID no existe en ese tenant:");
console.error("                               revisá que los dos GUID no estén cruzados.\n");
console.error("  El detalle completo está en docs/correo-microsoft-365.md\n");
process.exit(1);
