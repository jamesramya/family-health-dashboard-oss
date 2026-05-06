import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Instrument Serif allowlist:
// Only these files may use font-serif or font-display.
// Wordmark, hero page titles, and empty states are the only legitimate uses.
const ALLOWED_FILES = new Set([
  "src/components/auth/AuthShell.tsx",          // wordmark + auth hero title
  "src/components/dashboard/DashboardHero.tsx", // dashboard hero title
  "src/components/Sidebar.tsx",                  // wordmark
  "src/components/MobileTopBar.tsx",             // wordmark
  "src/components/MobileDrawer.tsx",             // wordmark
  "src/pages/Setup.tsx",                         // onboarding hero screens
  "src/pages/ChangePassword.tsx",                // onboarding hero screen
  "src/pages/InviteAccept.tsx",                  // onboarding hero screen
  "src/pages/Notes.tsx",                         // empty state
  "src/pages/Scans.tsx",                         // empty states
]);

function getAllTsxFiles(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsxFiles(full, rel));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      results.push(rel);
    }
  }
  return results;
}

describe("typography guard — Instrument Serif allowlist", () => {
  it("font-serif and font-display only appear in allowlisted files", () => {
    // resolve src dir relative to this test file's location
    const srcDir = join(__dirname, "..");
    const files = getAllTsxFiles(srcDir, "src");

    const violations: string[] = [];

    for (const relPath of files) {
      if (ALLOWED_FILES.has(relPath)) continue;
      const content = readFileSync(join(srcDir, relPath.replace(/^src\//, "")), "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (/\bfont-serif\b|\bfont-display\b/.test(line) && !line.trimStart().startsWith("//")) {
          violations.push(`${relPath}:${idx + 1} — ${line.trim()}`);
        }
      });
    }

    expect(violations,
      `Instrument Serif found in non-allowlisted files:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});
