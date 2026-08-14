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
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
