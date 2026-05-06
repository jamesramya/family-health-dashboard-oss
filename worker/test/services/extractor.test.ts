import { describe, it, expect } from "vitest";
import { PROMPT_BLOOD_REPORT, PROMPT_CULTURE } from "../../src/services/extractor";

describe("extractor prompt", () => {
  it("requires Title Case canonical_name", () => {
    expect(PROMPT_BLOOD_REPORT).toMatch(/Title Case/);
  });
  it("forbids snake_case", () => {
    expect(PROMPT_BLOOD_REPORT).toMatch(/never.*snake_case/i);
  });
  it("forbids specimen suffixes", () => {
    expect(PROMPT_BLOOD_REPORT).toMatch(/never append.*(Serum|specimen)/i);
  });
});

describe("PROMPT_CULTURE", () => {
  it("instructs the LLM to return specimen_type", () => {
    expect(PROMPT_CULTURE).toMatch(/specimen_type/);
  });
  it("includes all valid result_status values", () => {
    expect(PROMPT_CULTURE).toMatch(/no_growth/);
    expect(PROMPT_CULTURE).toMatch(/contaminated/);
  });
  it("instructs S/I/R sensitivity extraction", () => {
    expect(PROMPT_CULTURE).toMatch(/"S"\s*\|\s*"I"\s*\|\s*"R"/);
  });
});
