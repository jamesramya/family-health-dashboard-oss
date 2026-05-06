// A small set of common Indian-market meds used by the add-medication type-ahead.
// Entries here are labelled "LIB" in the suggestion list to distinguish them from
// the user's own previously-entered medications.

export interface LibraryMed {
  brand: string;
  generic: string;
  form: "tablet" | "capsule" | "syrup" | "injection" | "cream" | "drops" | "inhaler" | "other";
  defaultDosage?: string;
  commonReason?: string;
}

export const MED_LIBRARY: LibraryMed[] = [
  { brand: "Amlodipine",              generic: "amlodipine besylate",    form: "tablet",  defaultDosage: "5 mg",   commonReason: "Blood pressure" },
  { brand: "Amlodipine + Atenolol",   generic: "amlodipine + atenolol",  form: "tablet",  defaultDosage: "5/50 mg", commonReason: "Blood pressure" },
  { brand: "Atorvastatin",            generic: "atorvastatin calcium",   form: "tablet",  defaultDosage: "20 mg",  commonReason: "Cholesterol" },
  { brand: "Losartan",                generic: "losartan potassium",     form: "tablet",  defaultDosage: "50 mg",  commonReason: "Blood pressure" },
  { brand: "Metformin",               generic: "metformin hydrochloride",form: "tablet",  defaultDosage: "500 mg", commonReason: "Type 2 diabetes" },
  { brand: "Telmisartan",             generic: "telmisartan",            form: "tablet",  defaultDosage: "40 mg",  commonReason: "Blood pressure" },
  { brand: "Paracetamol",             generic: "paracetamol",            form: "tablet",  defaultDosage: "500 mg", commonReason: "Pain / fever" },
  { brand: "Pantoprazole",            generic: "pantoprazole sodium",    form: "tablet",  defaultDosage: "40 mg",  commonReason: "Acidity" },
  { brand: "Levothyroxine",           generic: "levothyroxine sodium",   form: "tablet",  defaultDosage: "50 mcg", commonReason: "Hypothyroidism" },
  { brand: "Aspirin",                 generic: "acetylsalicylic acid",   form: "tablet",  defaultDosage: "75 mg",  commonReason: "Cardioprotection" },
  { brand: "Cetirizine",              generic: "cetirizine hydrochloride", form: "tablet", defaultDosage: "10 mg",  commonReason: "Allergies" },
  { brand: "Amoxicillin",             generic: "amoxicillin",            form: "capsule", defaultDosage: "500 mg", commonReason: "Bacterial infection" },
];

export function searchLibrary(query: string): LibraryMed[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return MED_LIBRARY.filter(
    (m) => m.brand.toLowerCase().includes(q) || m.generic.toLowerCase().includes(q)
  ).slice(0, 5);
}
