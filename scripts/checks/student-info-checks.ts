/**
 * Checks for src/lib/student-info.ts — UID derivation (branch/year/division/roll).
 * Run: npx tsx --env-file=.env scripts/checks/student-info-checks.ts
 */
import assert from "node:assert";
import { deriveStudentInfo, formatStudentInfo, BRANCH_CODES } from "../../src/lib/student-info";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

check("COMP UID parses fully (fused div+roll, trailing serial ignored)", () => {
  const info = deriveStudentInfo("24-COMPD13-28");
  assert.equal(info?.branchCode, "COMP");
  assert.equal(info?.branchName, "Computer Engineering");
  assert.equal(info?.yearOfAdmission, 2024);
  assert.equal(info?.currentYear, "TE");
  assert.equal(info?.division, "D");
  assert.equal(info?.rollNo, "13");
});

check("leading-zero roll is stripped", () => {
  const info = deriveStudentInfo("25-CSE-A-09");
  assert.equal(info?.rollNo, "9");
});

check("year arithmetic: 2023 admit → BE (2026)", () => {
  const info = deriveStudentInfo("23-IT-D-45");
  assert.equal(info?.yearOfAdmission, 2023);
  assert.equal(info?.currentYear, "BE");
});

check("first-year 2025 admit → SE in 2026", () => {
  const info = deriveStudentInfo("25-AI&ML-D-31");
  assert.equal(info?.currentYear, "SE");
});

check("ampersand branch codes parse", () => {
  for (const code of ["AI&ML", "AI&DS", "E&CS", "E&TC"]) {
    assert.ok(deriveStudentInfo(`24-${code}-A-01`), `branch ${code}`);
  }
});

check("BCA 3-year program caps year at TE", () => {
  const info = deriveStudentInfo("24-BCA-A-07");
  assert.equal(info?.currentYear, "TE");
  assert.equal(info?.branchName, "BCA");
});

check("unknown branch code → null", () => {
  assert.equal(deriveStudentInfo("24-XXX-A-01"), null);
});

check("malformed UIDs → null", () => {
  for (const uid of [null, "", "abc", "24-COMPD13", "COMPD13-28", "244-COMP-A-1", "24-compd13-28x"]) {
    assert.equal(deriveStudentInfo(uid), null, `uid=${String(uid)}`);
  }
});

check("branch map covers every code the form used", () => {
  const used = ["IOT", "CSE", "COMP", "AI&ML", "MME", "E&CS", "BCA", "IT", "AI&DS", "E&TC", "CIVIL", "MECH", "MCA", "BVOC"];
  for (const code of used) assert.ok(BRANCH_CODES[code], `missing ${code}`);
});

check("formatStudentInfo renders the strip line", () => {
  const line = formatStudentInfo(deriveStudentInfo("24-COMPD13-28"));
  assert.equal(line, "Computer Engineering · TE · Div D · Roll 13");
});

console.log(`\nALL CHECKS PASSED (${passed})`);
