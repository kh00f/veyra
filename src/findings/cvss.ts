// CVSS v3.1 base score calculation. Vector format:
// CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H

export interface CvssVector {
  AV: "N" | "A" | "L" | "P";       // Attack Vector
  AC: "L" | "H";                    // Attack Complexity
  PR: "N" | "L" | "H";              // Privileges Required
  UI: "N" | "R";                    // User Interaction
  S: "U" | "C";                     // Scope
  C: "H" | "L" | "N";               // Confidentiality
  I: "H" | "L" | "N";               // Integrity
  A: "H" | "L" | "N";               // Availability
}

export type Severity = "None" | "Low" | "Medium" | "High" | "Critical";

const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC: Record<string, number> = { L: 0.77, H: 0.44 };
const UI: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0.0 };

export function parseVector(vector: string): CvssVector {
  const s = vector.trim().replace(/^CVSS:3\.1\//, "");
  const parts = Object.fromEntries(
    s.split("/").map((p) => {
      const [k, v] = p.split(":");
      return [k, v];
    }),
  );
  const required = ["AV", "AC", "PR", "UI", "S", "C", "I", "A"];
  for (const k of required) if (!parts[k]) throw new Error(`CVSS vector missing ${k}`);
  return parts as unknown as CvssVector;
}

export function baseScore(v: CvssVector): number {
  const scopeChanged = v.S === "C";

  // Privileges Required depends on Scope
  const PR = scopeChanged
    ? { N: 0.85, L: 0.68, H: 0.5 }[v.PR]
    : { N: 0.85, L: 0.62, H: 0.27 }[v.PR];

  const iss = 1 - (1 - CIA[v.C]) * (1 - CIA[v.I]) * (1 - CIA[v.A]);

  const impact = scopeChanged
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;

  if (impact <= 0) return 0;

  const exploitability = 8.22 * AV[v.AV] * AC[v.AC] * PR * UI[v.UI];

  const raw = scopeChanged
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);

  // Round up to one decimal per spec
  return Math.ceil(raw * 10) / 10;
}

export function severityOf(score: number): Severity {
  if (score === 0) return "None";
  if (score < 4.0) return "Low";
  if (score < 7.0) return "Medium";
  if (score < 9.0) return "High";
  return "Critical";
}

export function scoreVector(vector: string): { score: number; severity: Severity } {
  const v = parseVector(vector);
  const score = baseScore(v);
  return { score, severity: severityOf(score) };
}
