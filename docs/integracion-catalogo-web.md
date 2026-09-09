# Integrar el catálogo de cursos en el sitio comercial

Guía para quien construya el sitio web público (humano o agente de IA). Explica
cómo consumir el catálogo del CRM para armar **la página de listado de cursos** y
**la página de detalle de un curso con sus cohortes**.

El CRM es la única fuente de verdad del catálogo. El sitio no guarda copias del
contenido: lo pide por HTTP y lo renderiza. Si alguien corrige el temario en el
CRM, el sitio lo refleja sin tocar código.

---

## 1. Los dos endpoints

Ambos son **públicos**: no llevan cookie, ni API key, ni header de
autenticación. Responden igual con sesión o sin ella. Son los únicos endpoints
del CRM pensados para consumo externo.

`<BASE>` es la URL donde está desplegado el CRM (la misma de `APP_BASE_URL`).

| Endpoint | Para qué |
|---|---|
| `GET <BASE>/api/public/courses` | Listado del catálogo + categorías |
| `GET <BASE>/api/public/courses/:idOrSlug` | Un curso con su ficha completa, temario y cohortes |

Los dos devuelven `Cache-Control: public, max-age=60`.

### 1.1 Listado — `GET /api/public/courses`

Query param opcional:

| Param | Qué hace |
|---|---|
| `categoria` | Filtra por el **slug** de la categoría. Un slug que no existe devuelve catálogo vacío, no un 404. |

Respuesta real:

```jsonc
{
  "courses": [
    {
      "id": "crs_njmypn7zabiotb76qp4i",
      "slug": "ia-automation",              // usalo para la URL: /cursos/ia-automation
      "name": "IA Automation",
      "tagline": "Automatizá tu negocio con agentes de IA",
      "imageUrl": "https://.../portada-ia.jpg",
      "category": {
        "id": "cat_vq9gzsx66rw2wb0cs3wq",
        "name": "Inteligencia Artificial",
        "slug": "inteligencia-artificial"
      },
      "level": "inicial",                    // inicial | intermedio | avanzado | null
      "modality": "en_vivo",                 // en_vivo | asincronico | presencial | null
      "durationWeeks": 12,
      "hoursPerWeek": 4,
      "nextCohorts": [
        { "id": "coh_1asacyuvben71bhoisz8", "startDate": "2026-09-15T00:00:00.000Z" }
      ]
    }
  ],
  "categories": [
    { "id": "cat_...", "name": "Inteligencia Artificial", "slug": "inteligencia-artificial" }
  ]
}
```

`categories` viene en la misma respuesta **a propósito**: es para dibujar el
filtro del catálogo sin hacer una segunda llamada. Trae todas las categorías de
la organización, no solo las de los cursos listados.

### 1.2 Detalle — `GET /api/public/courses/:idOrSlug`

El segmento acepta el **slug** (`/api/public/courses/ia-automation`) o el id
interno. Usá siempre el slug en las URLs públicas; el id sigue funcionando para
no romper enlaces viejos.

Respuesta real (trae todo lo del listado, más lo de abajo):

```jsonc
{
  "course": {
    // ... todos los campos del listado ...
    "description": "Un curso práctico para construir automatizaciones reales con IA.",
    "learningObjectives": [
      "Construir agentes",
      "Conectar APIs",
      "Medir resultados"
    ],
    "targetAudience": "Emprendedores sin experiencia previa en programación.",
    "syllabusUrl": "https://.../temario-ia.pdf",
    "modules": [
      { "title": "Fundamentos de IA", "topics": ["Qué es un LLM", "Prompting"] },
      { "title": "Automatización",    "topics": ["Webhooks", "Integraciones"] },
      { "title": "Proyecto final",    "topics": ["Armado", "Presentación"] }
    ]
  }
}
```

Errores:

| Status | `error.code` | Cuándo |
|---|---|---|
| 404 | `not_found` | El slug/id no corresponde a ningún curso |
| 422 | `invalid_query` | `categoria` presente pero vacío |

---

## 2. Qué significa cada campo

| Campo | Uso sugerido en el sitio |
|---|---|
| `slug` | La URL pública del curso. **Nunca muestres `id` en una URL.** |
| `name` | Título del curso |
| `tagline` | Frase corta para la tarjeta del catálogo y el hero |
| `description` | Cuerpo largo de la página (solo en el detalle) |
| `imageUrl` | Portada de la tarjeta y del hero |
| `category` | Chip/etiqueta + filtro del catálogo |
| `level` | Badge "Nivel: Inicial" |
| `modality` | Badge "En vivo" / "Asincrónico" / "Presencial" |
| `durationWeeks` + `hoursPerWeek` | "12 semanas · 4 h/semana" |
| `learningObjectives` | Sección "Qué vas a aprender" (lista de bullets) |
| `targetAudience` | Sección "A quién está dirigido" |
| `modules` | Temario, ideal como acordeón: `title` es el módulo, `topics` sus temas |
| `syllabusUrl` | Botón "Descargar temario (PDF)" |
| `nextCohorts` | Fechas de inicio disponibles (ver sección 4) |

**Valores de `level` y `modality`:** vienen como identificadores en snake_case
(`en_vivo`), no como texto para mostrar. Traducilos en el sitio:

```ts
const NIVEL = { inicial: "Inicial", intermedio: "Intermedio", avanzado: "Avanzado" };
const MODALIDAD = { en_vivo: "En vivo", asincronico: "Asincrónico", presencial: "Presencial" };
```

---

## 3. Regla de oro: casi todo puede venir `null`

Todos los campos de la ficha comercial son **opcionales** en el CRM. Un curso
cargado a medias es normal, no un error. Este es el caso real de otro curso del
mismo catálogo:

```jsonc
{
  "id": "crs_7a5x00ey34htsem1aitv",
  "slug": "civil-3d",
  "name": "Civil 3D",
  "tagline": null,
  "imageUrl": null,
  "category": null,
  "level": null,
  "modality": null,
  "durationWeeks": null,
  "hoursPerWeek": null,
  "nextCohorts": []
}
```

Sólo `id`, `slug` y `name` están garantizados. `learningObjectives` y `modules`
siempre son arrays (vacíos si no se cargaron), nunca `null`.

**Qué implica para el sitio:**

- No asumas que hay imagen: prevé un placeholder o una tarjeta sin foto.
- Ocultá las secciones vacías en vez de renderizar títulos huérfanos ("Qué vas a
  aprender" seguido de nada).
- `category: null` significa "sin categoría", no un objeto a medias. No leas
  `category.name` sin chequear.
- Una fila de badges (nivel, modalidad, duración) puede quedar completamente
  vacía. Que el layout lo tolere.

---

## 4. Cohortes: lo que hay y lo que no

`nextCohorts` es el listado de **próximas fechas de inicio**, ordenadas de la más
cercana a la más lejana:

```jsonc
"nextCohorts": [
  { "id": "coh_1asacyuvben71bhoisz8", "startDate": "2026-09-15T00:00:00.000Z" },
  { "id": "coh_awjgwnk1ooo83omd34pf", "startDate": "2026-10-01T00:00:00.000Z" },
  { "id": "coh_wlitju6x0lmi5nlsplcg", "startDate": "2027-01-01T00:00:00.000Z" }
]
```

Tres cosas importantes:

**1. Sólo incluye cohortes que todavía no empezaron** (`start_date > ahora`). Una
cohorte en curso o finalizada no aparece. Esto es intencional: el sitio ofrece
fechas a las que alguien todavía se puede anotar.

**2. Un array vacío es un estado normal y frecuente.** Significa "este curso no
tiene fechas abiertas ahora mismo", no que el curso no exista. Manejalo con un
mensaje del estilo *"Próximamente nuevas fechas — dejanos tus datos"* y un
formulario de contacto, en vez de esconder el curso.

**3. Por ahora cada cohorte trae únicamente `id` y `startDate`.** No hay horario,
días de cursada, fecha de fin, cupo, precio ni profesor. Eso es deliberado: el
contrato público excluye explícitamente costo, cupo, aula, profesor y cualquier
dato de alumnos.

> **Si necesitás mostrar más por cohorte** (por ejemplo "martes y jueves de 18:30
> a 20:30" o el precio), hay que ampliar el endpoint público del CRM y decidir
> antes qué es seguro publicar. Pedilo como cambio en el CRM; **no** intentes
> sacarlo de otra ruta: el resto de la API exige autenticación y no es para el
> sitio público.

Formateo de fechas: `startDate` es ISO 8601 en UTC. Formateala en la zona del
negocio, no en la del visitante, para que no se corra un día.

```ts
new Intl.DateTimeFormat("es-UY", {
  day: "2-digit", month: "long", year: "numeric", timeZone: "America/Montevideo",
}).format(new Date(cohorte.startDate));
```

---

## 5. Armar la página de listado

1. `GET /api/public/courses` (o con `?categoria=<slug>` si hay filtro activo).
2. Renderizá `categories` como filtro. El estado "Todos" simplemente omite el
   parámetro.
3. Por cada curso, una tarjeta con: `imageUrl`, `name`, `tagline`, chip de
   `category`, badges de `level`/`modality`/duración, y la fecha de inicio más
   próxima (`nextCohorts[0]`) si existe.
4. La tarjeta enlaza a `/cursos/{slug}`.

El filtro por categoría conviene resolverlo del lado del servidor (pasando
`?categoria=`) para que la URL sea compartible e indexable.

---

## 6. Armar la página de detalle

Ruta sugerida: `/cursos/[slug]`.

1. `GET /api/public/courses/{slug}`.
2. Si responde 404, devolvé un 404 real del sitio (no una página vacía con 200).
3. Estructura sugerida, saltando cada bloque que venga vacío:

| Bloque | De dónde sale |
|---|---|
| Hero | `imageUrl`, `name`, `tagline`, badges de `category`/`level`/`modality`/duración |
| Fechas de inicio | `nextCohorts` — o el mensaje de "próximamente" si está vacío |
| Sobre el curso | `description` |
| Qué vas a aprender | `learningObjectives` |
| A quién está dirigido | `targetAudience` |
| Temario | `modules` (acordeón: `title` + lista de `topics`) |
| Descargar temario | botón a `syllabusUrl` |
| CTA de inscripción | tu formulario / WhatsApp, pasando el `id` de la cohorte elegida |

**SEO:** usá `name` + `tagline` para el `<title>` y la meta description, e
`imageUrl` para `og:image`. El slug ya es amigable, no lo transformes.

---

## 7. Tipos TypeScript

Copiá esto en el sitio. Refleja el contrato actual:

```ts
export type Categoria = { id: string; name: string; slug: string };

export type Cohorte = {
  id: string;
  /** ISO 8601 en UTC. Sólo cohortes que aún no empezaron. */
  startDate: string;
};

export type CursoListado = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  imageUrl: string | null;
  category: Categoria | null;
  level: "inicial" | "intermedio" | "avanzado" | null;
  modality: "en_vivo" | "asincronico" | "presencial" | null;
  durationWeeks: number | null;
  hoursPerWeek: number | null;
  nextCohorts: Cohorte[];
};

export type Modulo = { title: string; topics: string[] };

export type CursoDetalle = CursoListado & {
  description: string | null;
  /** Siempre array; vacío si no se cargó. */
  learningObjectives: string[];
  targetAudience: string | null;
  syllabusUrl: string | null;
  /** Siempre array; en orden de cursada. */
  modules: Modulo[];
};
```

Ejemplo de acceso a datos:

```ts
const BASE = process.env.CRM_BASE_URL!; // ej. https://crm.tudominio.com

export async function listarCursos(categoriaSlug?: string) {
  const url = new URL("/api/public/courses", BASE);
  if (categoriaSlug) url.searchParams.set("categoria", categoriaSlug);

  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Catálogo no disponible (${res.status})`);
  return res.json() as Promise<{ courses: CursoListado[]; categories: Categoria[] }>;
}

export async function obtenerCurso(slug: string) {
  const res = await fetch(new URL(`/api/public/courses/${slug}`, BASE), {
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null; // el sitio debe responder 404
  if (!res.ok) throw new Error(`Curso no disponible (${res.status})`);
  const { course } = (await res.json()) as { course: CursoDetalle };
  return course;
}
```

---

## 8. Errores que no hay que cometer

- **No hardcodees contenido del curso en el sitio.** Si falta un dato, cargalo en
  el CRM; no lo escribas en el HTML. Se desincroniza y nadie se entera.
- **No uses el `id` en URLs públicas.** Para eso está el `slug`.
- **No renderices `level`/`modality` crudos.** `en_vivo` no es texto para el
  usuario final.
- **No trates `nextCohorts: []` como error.** Es el estado normal entre cohortes.
- **No consumas otras rutas del CRM.** Todo lo que no sea `/api/public/*` exige
  sesión y puede exponer datos de alumnos; no está pensado para el sitio.
- **No caches indefinidamente.** El CRM ya sugiere 60 s; respetalo para que una
  corrección se vea rápido.
- **No confíes en que `imageUrl`/`syllabusUrl` apunten a un host tuyo.** Son URLs
  que carga un operador del CRM; el CRM valida que sean `http(s)`, pero el
  dominio es libre. Tenelo en cuenta si configurás dominios permitidos para
  imágenes (por ejemplo `next.config.js` → `images.remotePatterns`).

---

## 9. Cómo probar

Con el CRM corriendo:

```bash
# Catálogo completo
curl -s <BASE>/api/public/courses | jq

# Filtrado por categoría
curl -s "<BASE>/api/public/courses?categoria=inteligencia-artificial" | jq

# Detalle por slug
curl -s <BASE>/api/public/courses/ia-automation | jq

# 404 esperado
curl -s -o /dev/null -w "%{http_code}\n" <BASE>/api/public/courses/no-existe
```

Ninguno necesita credenciales. Si alguno pide autenticación, estás llamando a la
ruta equivocada.

---

## 10. Referencia

El contrato formal, con las garantías de privacidad y el detalle de errores, está
en [`specs/005-gestion-academica-operativa/contracts/public-courses.md`](../specs/005-gestion-academica-operativa/contracts/public-courses.md).
Ante cualquier diferencia, ese documento manda.
