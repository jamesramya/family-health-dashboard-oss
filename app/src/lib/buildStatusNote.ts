export function buildStatusNote(activeMedCount: number, alertCount: number): string {
  const labPart =
    alertCount > 0
      ? `${alertCount} lab result${alertCount === 1 ? "" : "s"} outside the normal range.`
      : "Recent labs look good.";

  if (activeMedCount === 0) {
    return alertCount === 0 ? "Doing well overall." : labPart;
  }

  return `Taking ${activeMedCount} medication${activeMedCount === 1 ? "" : "s"}. ${labPart}`;
}
