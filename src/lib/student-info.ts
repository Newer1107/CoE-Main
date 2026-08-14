/**
 * Student info derived from a TCET portal UID.
 *
 * UID formats (both in the wild):
 *   YY-BRANCH-DIV-ROLL   e.g. "23-CSE-A-05"   (division as its own segment)
 *   YY-BRANCHDIV-ROLL    e.g. "24-COMPD13-28" (division fused onto the branch)
 *   YY  year of admission · BRANCH code · DIV division · ROLL class roll
 *
 * Pure/isomorphic: safe on the server (snapshot at registration) and on the
 * client (read-only "confirmed from your UID" strip).
 */

export const BRANCH_CODES: Record<string, string> = {
  COMP: "Computer Engineering",
  CSE: "Computer Science & Engineering",
  IT: "Information Technology",
  "AI&ML": "Artificial Intelligence & Machine Learning",
  "AI&DS": "Artificial Intelligence & Data Science",
  "E&CS": "Electronics & Computer Science",
  "E&TC": "Electronics & Telecommunication",
  ECE: "Electronics & Communication",
  IOT: "Internet of Things",
  MECH: "Mechanical Engineering",
  MME: "Mechanical (Mechatronics) Engineering",
  CIVIL: "Civil Engineering",
  BCA: "BCA",
  MCA: "MCA",
  BVOC: "B.Voc",
};

/** Program length in years — drives the current-year computation. */
const PROGRAM_YEARS: Record<string, number> = {
  BCA: 3,
  MCA: 2,
  BVOC: 3,
};

export type StudentInfo = {
  branchCode: string;
  branchName: string;
  yearOfAdmission: number; // 2024 for "24-…"
  currentYear: string; // SE | TE | BE (or FE for first years)
  division: string | null;
  rollNo: string | null;
};

export type DerivedStudentInfo = StudentInfo | null;

const YEAR_NAMES = ["FE", "SE", "TE", "BE"];

/**
 * Derive branch/year/division/roll from a TCET UID. Returns null when the UID
 * is unparseable (faculty/industry formats, missing, or malformed).
 */
export function deriveStudentInfo(uid: string | null | undefined): DerivedStudentInfo {
  if (!uid) return null;
  const parts = uid.trim().toUpperCase().split("-");
  if (parts.length < 3 || parts.length > 4) return null;
  const [yy, ...rest] = parts;
  if (!/^\d{2}$/.test(yy)) return null;

  const yearOfAdmission = 2000 + Number(yy);
  if (yearOfAdmission > new Date().getFullYear() + 1) return null;

  // Two real-world shapes:
  //   3 parts: YY - BRANCH+DIV+ROLL - serial   ("24-COMPD13-28" → COMP, Div D, Roll 13)
  //   4 parts: YY - BRANCH - DIV - ROLL        ("23-CSE-A-05"    → CSE, Div A, Roll 5)
  let body: string;
  let division: string | null = null;
  let roll: string | null = null;

  if (parts.length === 4) {
    body = rest[0];
    division = rest[1];
    roll = rest[2];
    if (!/^\d{1,3}$/.test(roll ?? "")) return null;
  } else {
    body = rest[0];
    const serial = rest[1];
    if (!/^\d{1,4}$/.test(serial)) return null;
    // trailing serial is not the roll — the roll is fused with division
  }

  // Longest known branch code that is a prefix of the middle segment
  let branchCode: string | null = null;
  for (const code of Object.keys(BRANCH_CODES)) {
    if (body === code || body.startsWith(code)) {
      if (branchCode === null || code.length > branchCode.length) branchCode = code;
    }
  }
  if (!branchCode) return null;
  const branchName = BRANCH_CODES[branchCode];

  if (parts.length === 3) {
    // fused: remainder = division letters + roll digits ("D13" → D, 13)
    const remainder = body.slice(branchCode.length);
    const divMatch = /^([A-Z]+?)(\d{1,3})$/.exec(remainder);
    if (divMatch) {
      division = divMatch[1];
      roll = divMatch[2];
    } else if (/^[A-Z]+$/.test(remainder)) {
      division = remainder;
    } else if (/^\d{1,3}$/.test(remainder)) {
      roll = remainder;
    } else {
      return null;
    }
  }

  const programYears = PROGRAM_YEARS[branchCode] ?? 4;
  const yearIndex = new Date().getFullYear() - yearOfAdmission; // 0 = first year
  const currentYear = YEAR_NAMES[Math.min(Math.max(yearIndex, 0), programYears - 1)];

  return {
    branchCode,
    branchName,
    yearOfAdmission,
    currentYear,
    division,
    rollNo: roll ? String(Number(roll)) : null, // strip leading zeros ("09" → "9")
  };
}

/** Human-readable one-liner for the "Confirmed from your UID" strip. */
export function formatStudentInfo(info: DerivedStudentInfo): string | null {
  if (!info) return null;
  const bits = [info.branchName, info.currentYear];
  if (info.division) bits.push(`Div ${info.division}`);
  if (info.rollNo) bits.push(`Roll ${info.rollNo}`);
  return bits.join(" · ");
}
