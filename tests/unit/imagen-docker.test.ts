import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La imagen de producción solo lleva lo que el `Dockerfile` copia a la etapa
 * `runner`. El trazado de Next (`output: "standalone"`) NO sigue un
 * `readFileSync` con ruta armada en runtime, así que todo archivo que el
 * servidor lea así tiene que copiarse a mano.
 *
 * Pasó: `docs/email-templates/` no se copiaba, y en producción los correos de
 * términos, bienvenida y acceso al portal caían con ENOENT → 500 desde el
 * primer deploy. En desarrollo nunca se vio, porque `next dev` corre sobre el
 * repo entero.
 */

const ROOT = path.resolve(__dirname, "../..");
const dockerfile = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");

function etapaRunner(contenido: string): string {
  const inicio = contenido.search(/^FROM .* AS runner$/m);
  expect(inicio, "el Dockerfile tiene que tener una etapa `runner`").toBeGreaterThanOrEqual(0);
  return contenido.slice(inicio);
}

describe("imagen Docker de producción", () => {
  it("copia las plantillas de correo que lee src/server/email/templates.ts", () => {
    const templates = readFileSync(
      path.join(ROOT, "src/server/email/templates.ts"),
      "utf8"
    );
    // Si la carpeta se muda, este test tiene que mudarse con ella.
    expect(templates).toContain('path.join(process.cwd(), "docs", "email-templates")');

    expect(etapaRunner(dockerfile)).toMatch(
      /^COPY --from=builder\b.*\/app\/docs\/email-templates \.\/docs\/email-templates$/m
    );
  });

  /**
   * Pasó en producción: sin `MEDIA_DIR`, la app guardaba fotos de software y
   * adjuntos de WhatsApp en `./.dev-media`, ADENTRO del contenedor. Cada deploy
   * crea uno nuevo y vacío, así que los archivos desaparecían mientras la base
   * seguía diciendo que existían. La imagen trae el valor correcto por defecto;
   * el volumen que lo vuelve persistente lo declara quien despliega.
   */
  it("guarda los archivos subidos en /data/media, no adentro del contenedor", () => {
    const runner = etapaRunner(dockerfile);
    expect(runner).toMatch(/^ENV MEDIA_DIR=\/data\/media$/m);
    expect(runner).toMatch(/mkdir -p \/data\/media/);
  });

  it("docker compose monta /data/media en un volumen con nombre", () => {
    const compose = readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    expect(compose).toMatch(/^\s+- vocero_media:\/data\/media$/m);
    expect(compose).toMatch(/^\s+vocero_media:\s*$/m);
  });

  it("no deja las plantillas afuera del contexto de build (.dockerignore)", () => {
    // Si `.dockerignore` excluye la carpeta, el COPY de arriba ni siquiera
    // encuentra el origen y el build falla. `docs` se excluye entero salvo
    // las plantillas.
    const reglas = readFileSync(path.join(ROOT, ".dockerignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    expect(reglas).not.toContain("docs");
    expect(reglas).toContain("!docs/email-templates");
    expect(reglas.indexOf("!docs/email-templates")).toBeGreaterThan(reglas.indexOf("docs/*"));
  });
});
