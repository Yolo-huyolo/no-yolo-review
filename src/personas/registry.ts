import type { Persona } from "../config/schema.js";
import { correctnessPersona } from "./correctness.js";
import { securityPersona } from "./security.js";
import { seoPersona } from "./seo.js";

export const BUILTIN_PERSONAS: readonly Persona[] = [
  correctnessPersona,
  securityPersona,
  seoPersona,
];

export function findBuiltinPersona(name: string): Persona | undefined {
  return BUILTIN_PERSONAS.find((p) => p.name === name);
}
