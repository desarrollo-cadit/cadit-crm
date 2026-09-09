import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 20);

const prefixes = {
  organization: "org",
  member: "mem",
  contact: "ct",
  conversation: "cv",
  message: "msg",
  course: "crs",
  cohort: "coh",
  enrollment: "enr",
  license: "lic",
  automationRule: "arule",
  stage: "stg",
  credentials: "cred",
  agentProfile: "agp",
  kbEntry: "kb",
  template: "tpl",
  testRun: "run",
  testCase: "case",
  mediaAsset: "ma",
  // 005 — gestión académica operativa (research.md DV-011)
  software: "sw",
  teacher: "tch",
  company: "cia",
  // 005 iteración 3 — formularios personalizados de captación (intake).
  intakeForm: "frm",
  // 006 — contenido comercial del curso (catálogo público).
  courseCategory: "cat",
  courseModule: "mod",
  // 008 — cobranza: la cuota que se debe y el pago que entró.
  installment: "inst",
  payment: "pay",
  // 009 — clases dictadas y asistencia por alumno.
  classSession: "cls",
  attendance: "att",
  // 010 — evaluaciones, sus resultados y el certificado.
  assessment: "asm",
  assessmentResult: "res",
  certificate: "cert",
  // 012 — identidad de portal (alumno/profesor) y roles de staff configurables.
  accountLink: "alk",
  role: "rol",
  // 013 — material de cursada (enlaces, no archivos) y avisos por cohorte.
  resource: "res",
  announcement: "anc",
  // 023 — las salas de reunión de la academia (las cuentas de Zoom).
  virtualRoom: "aula",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
