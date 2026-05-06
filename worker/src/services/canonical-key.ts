const SPECIMEN_SUFFIXES = ["serum", "plasma", "wholeblood", "whole blood"];

// Maps abbreviations, snake_case migration names, and common variants to the
// standard Title Case canonical name used in test_definitions. Looked up by
// resolveTestSynonym() BEFORE canonicalKey() so that e.g. "mcv" resolves to
// "Mean Corpuscular Volume" instead of creating a new definition.
const SYNONYM_MAP: Record<string, string> = {
  // Abbreviation → full name
  mcv: "Mean Corpuscular Volume",
  mch: "Mean Corpuscular Haemoglobin",
  mchc: "Mean Corpuscular Haemoglobin Concentration",
  mpv: "Mean Platelet Volume",
  rdw: "Red Cell Distribution Width",
  tlc: "Total Leucocyte Count",
  wbc: "Total Leucocyte Count",
  rbc: "Red Blood Cell Count",
  alt: "Alanine Aminotransferase",
  sgpt: "Alanine Aminotransferase",
  ast: "Aspartate Aminotransferase",
  sgot: "Aspartate Aminotransferase",
  crp: "C Reactive Protein",
  esr: "Erythrocyte Sedimentation Rate",
  hct: "Haematocrit",
  hgb: "Haemoglobin",
  plt: "Platelet Count",

  // Spelling variants
  hematocrit: "Haematocrit",
  hemoglobin: "Haemoglobin",

  // Common alternate names
  "red cell count": "Red Blood Cell Count",
  "white blood cell count": "Total Leucocyte Count",
  "white cell count": "Total Leucocyte Count",
  "c reactive protein quantitative": "C Reactive Protein",

  // Staff cells / stab neutrophils → Band Neutrophils
  "staff cells": "Band Neutrophils",
  "stab neutrophils": "Band Neutrophils",
  "neutrophil staff cells": "Band Neutrophils",
  "band neutrophil": "Band Neutrophils",
  "staff cells absolute": "Band Neutrophils Absolute Count",
  "stab neutrophils absolute count": "Band Neutrophils Absolute Count",
  "stab neutrophils abs count": "Band Neutrophils Absolute Count",
  "neutrophil staff cells absolute count": "Band Neutrophils Absolute Count",
  "neutrophil staff cells abs count": "Band Neutrophils Absolute Count",

  // Segmented neutrophils
  "neutrophil segmented cells": "Segmented Neutrophils",
  "segmented neutrophil": "Segmented Neutrophils",
  "neutrophil segmented cells absolute count": "Segmented Neutrophils Absolute Count",
  "neutrophil segmented cells abs count": "Segmented Neutrophils Absolute Count",

  // Migration snake_case variants
  alt_sgpt: "Alanine Aminotransferase",
  ast_sgot: "Aspartate Aminotransferase",
  staff_cells: "Band Neutrophils",
  staff_cells_absolute: "Band Neutrophils Absolute Count",
  segmented_neutrophils_absolute: "Segmented Neutrophils Absolute Count",
  basophils_absolute: "Basophils Absolute Count",
  eosinophils_absolute: "Eosinophils Absolute Count",
  lymphocytes_absolute: "Lymphocytes Absolute Count",
  monocytes_absolute: "Monocytes Absolute Count",
  neutrophils_absolute: "Neutrophils Absolute Count",
};

/**
 * Resolve known synonyms, abbreviations, and alternate names to the standard
 * canonical name. Returns the original input unchanged if no synonym matches.
 */
export function resolveTestSynonym(input: string): string {
  if (!input || !input.trim()) return input;
  const normalized = input.toLowerCase().trim().replace(/[_]+/g, " ").replace(/\s+/g, " ");
  return SYNONYM_MAP[normalized] ?? input;
}

function stripSpecimenSuffix(s: string): string {
  let out = s;
  for (const suffix of SPECIMEN_SUFFIXES) {
    const pattern = suffix.replace(/\s/g, "\\s?");
    out = out.replace(new RegExp(`\\s*,\\s*${pattern}\\s*$`, "i"), "");
    out = out.replace(new RegExp(`_${pattern}\\s*$`, "i"), "");
  }
  return out;
}

export function canonicalKey(input: string): string {
  if (!input || !input.trim()) throw new Error("canonicalKey: empty input");
  let s = stripSpecimenSuffix(input.toLowerCase().trim());
  s = s.replace(/[\s_\-,.()]+/g, "");
  if (!s) throw new Error(`canonicalKey: input '${input}' normalizes to empty`);
  return s;
}

export function titleCaseCanonicalName(input: string): string {
  const s = stripSpecimenSuffix(input.trim());
  return s
    .replace(/[_\-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
