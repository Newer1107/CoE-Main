/**
 * Checks for src/lib/problem-similarity.ts — open-innovation duplicate detection.
 * Run: npx tsx --env-file=.env scripts/checks/problem-similarity-checks.ts
 */
import assert from "node:assert";
import { findSimilarProblems, isDuplicateProblem, normalizeProblemTitle, titleOverlap } from "../../src/lib/problem-similarity";

const CATALOGUE = [
  { id: 1, title: "Transformer based end-to-end Web Application Firewall (WAF) pipeline" },
  { id: 2, title: "Conversational SIEM Assistant for Investigation and Automated Threat Reporting using NLP" },
  { id: 3, title: "Develop a blockchain-based system for botanical traceability of Ayurvedic herbs" },
  { id: 4, title: "AI-powered crop disease detection for small farms" },
];

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

check("normalize strips punctuation and case", () => {
  assert.equal(normalizeProblemTitle("  AI-Powered Crop Disease Detection!!! "), "ai powered crop disease detection");
});

check("overlap: identical titles", () => {
  assert.equal(titleOverlap("Transformer based end-to-end Web Application Firewall pipeline", "Transformer based end-to-end Web Application Firewall pipeline"), 1);
});

check("overlap: unrelated titles", () => {
  assert.equal(titleOverlap("AI-powered crop disease detection for small farms", "Conversational SIEM Assistant using NLP"), 0);
});

check("exact duplicate found (score 100)", () => {
  const dup = isDuplicateProblem(CATALOGUE, "Transformer based end-to-end Web Application Firewall pipeline!");
  assert.ok(dup);
  assert.equal(dup.id, 1);
});

check("near-duplicate (one contains the other) found", () => {
  const dup = isDuplicateProblem(CATALOGUE, "End-to-end Web Application Firewall (WAF) pipeline transformer based");
  assert.ok(dup);
});

check("similar-but-new is NOT a hard duplicate", () => {
  const dup = isDuplicateProblem(CATALOGUE, "Blockchain traceability of medicinal herbs from collectors to pharma");
  assert.equal(dup, null);
});

check("similar results surfaced with scores", () => {
  const sims = findSimilarProblems(CATALOGUE, "AI powered crop disease detection for small farms");
  assert.ok(sims.length >= 1);
  assert.equal(sims[0].id, 4);
  assert.equal(sims[0].score, 100);
});

check("partial overlap surfaces as similar (>=50%)", () => {
  const sims = findSimilarProblems(CATALOGUE, "Web Application Firewall for end-to-end protection");
  assert.ok(sims.some((s) => s.id === 1));
});

check("empty/whitespace title yields nothing", () => {
  assert.deepEqual(findSimilarProblems(CATALOGUE, "   "), []);
  assert.equal(isDuplicateProblem(CATALOGUE, ""), null);
});

check("short tokens (<3 chars) ignored", () => {
  assert.equal(titleOverlap("AB CD EF", "AB CD EF"), 0); // all tokens are 2 chars
});

console.log(`\nALL CHECKS PASSED (${passed})`);
