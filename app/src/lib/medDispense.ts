export type Slot = "morning" | "afternoon" | "evening" | "night" | "bedtime" | "as_needed";

export type DispenseMap = Record<string, boolean>;

function key(personId: string, date: string): string {
  return `meds.dispense.${personId}.${date}`;
}

export function getDispensations(personId: string, date: string): DispenseMap {
  try {
    return JSON.parse(localStorage.getItem(key(personId, date)) ?? "{}");
  } catch {
    return {};
  }
}

export function setDispensation(
  personId: string,
  date: string,
  medId: string,
  slot: Slot | string,
  taken: boolean
): void {
  const map = getDispensations(personId, date);
  const k = `${medId}:${slot}`;
  if (taken) map[k] = true;
  else delete map[k];
  localStorage.setItem(key(personId, date), JSON.stringify(map));
}

export function toggleDispensation(
  personId: string,
  date: string,
  medId: string,
  slot: Slot | string
): boolean {
  const map = getDispensations(personId, date);
  const k = `${medId}:${slot}`;
  const next = !map[k];
  setDispensation(personId, date, medId, slot, next);
  return next;
}

export function toggleDispensationByKey(
  personId: string,
  date: string,
  dispenseKey: string
): boolean {
  const map = getDispensations(personId, date);
  const next = !map[dispenseKey];
  if (next) map[dispenseKey] = true;
  else delete map[dispenseKey];
  localStorage.setItem(`meds.dispense.${personId}.${date}`, JSON.stringify(map));
  return next;
}
