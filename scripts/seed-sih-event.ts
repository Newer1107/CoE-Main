/**
 * Seed the SIH 2026 internal hackathon on the DEV database.
 *
 * Creates (idempotently):
 *  - the event (registration open, PPT required, submissions lock Sunday 23:59:59 IST)
 *  - the 4-parameter SIH evaluation rubric (25/30/25/20)
 *  - all problem statements from the SIH catalogue (scripts/data-sih-2026-problems.json)
 *
 * Run: npx tsx --env-file=.env scripts/seed-sih-event.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";

const p = new PrismaClient();

const EVENT_TITLE = "SIH 2026 — Internal Hackathon";
const EVENT_DESCRIPTION = `Smart India Hackathon (SIH) 2026 — Internal Round at TCET.

The internal hackathon is the college-level screening for SIH 2026. Teams select one problem statement from the official SIH catalogue (500+ statements across Cybersecurity, Space Technology, MedTech & BioTech, Robotics & Drones, Smart Automation, Renewable Energy, Smart Education, Agriculture and more), build a working solution, and present it to a judging panel.

How it works:
• Form a team of up to 6 members (solo participation allowed) with an @tcetmumbai.in student as the team lead.
• Choose your problem statement — search the full catalogue right on this page.
• Upload your team presentation (PPT / PPTX / PDF) during registration — it is required.
• Presentations lock on Sunday night at 11:59 PM; registration closes with the lock.
• The internal round is evaluated on four parameters: Problem Understanding & Impact (25%), Innovation & Technical Excellence (30%), Feasibility, Practicability & Scalability (25%), and Solution Quality & Presentation (20%).
• Top teams are recommended for the SIH 2026 national submission.

Please complete registration before the deadline — late submissions will not be accepted.`;
const RUBRICS = [
  { key: "problem_understanding", label: "Problem Understanding & Impact", weight: 25, order: 1 },
  { key: "innovation_technical", label: "Innovation & Technical Excellence", weight: 30, order: 2 },
  { key: "feasibility_scalability", label: "Feasibility, Practicability & Scalability", weight: 25, order: 3 },
  { key: "solution_quality", label: "Solution Quality & Presentation", weight: 20, order: 4 },
];

/** Sunday 23:59:59 Asia/Kolkata of the CURRENT week (before Monday morning). */
function nextSundayLock(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = (7 - day) % 7;
  const sunday = new Date(now.getTime() + daysUntilSunday * 86400_000);
  // 23:59:59 IST = 18:29:59 UTC
  sunday.setUTCHours(18, 29, 59, 0);
  return sunday;
}

const psData = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/data-sih-2026-problems.json"), "utf8"),
) as { title: string; source: string; domain: string }[];

(async () => {
  const admin = await p.user.findFirst({ where: { role: "ADMIN" }, orderBy: { id: "asc" } });
  if (!admin) throw new Error("no ADMIN user in this database");

  // 1) event (idempotent; keeps dates/lock in sync on re-runs)
  let event = await p.hackathonEvent.findFirst({ where: { title: EVENT_TITLE } });
  const lock = nextSundayLock();
  if (!event) {
    const start = new Date();
    const end = new Date(start.getTime() + 14 * 86400_000);
    event = await p.hackathonEvent.create({
      data: {
        title: EVENT_TITLE,
        description: EVENT_DESCRIPTION,
        startTime: start,
        endTime: end,
        submissionLockAt: lock,
        status: "UPCOMING",
        registrationOpen: true,
        createdById: admin.id,
        eventType: "hackathon",
        config: {
          registration: {
            requiresPpt: true,
            requiresProblemSelection: true,
            minTeamSize: 1,
            maxTeamSize: 6,
            allowSolo: true,
          },
        },
      },
    });
    console.log("event created:", event.id, "| PPT lock:", event.submissionLockAt?.toISOString());
  } else {
    event = await p.hackathonEvent.update({
      where: { id: event.id },
      data: {
        description: EVENT_DESCRIPTION,
        submissionLockAt: lock,
        registrationOpen: true,
        config: {
          ...((event.config ?? {}) as Record<string, unknown>),
          registration: {
            requiresPpt: true,
            requiresProblemSelection: true,
            minTeamSize: 1,
            maxTeamSize: 6,
            allowSolo: true,
          },
        },
      },
    });
    console.log("event exists — description/lock refreshed:", event.id);
  }

  // 2) rubrics (upsert by key)
  for (const r of RUBRICS) {
    const existing = await p.rubricCategory.findFirst({ where: { eventId: event.id, key: r.key } });
    if (existing) {
      await p.rubricCategory.update({ where: { id: existing.id }, data: r });
    } else {
      await p.rubricCategory.create({ data: { ...r, eventId: event.id } });
    }
  }
  console.log("rubrics:", RUBRICS.map((r) => `${r.label} ${r.weight}`).join(" | "));

  // 3) problems (skip existing titles)
  const existingTitles = new Set(
    (await p.problem.findMany({ where: { eventId: event.id }, select: { title: true } })).map((x) => x.title.trim().toLowerCase()),
  );
  let created = 0;
  for (const ps of psData) {
    // MySQL varchar limit — keep the full text in description
    const title = ps.title.trim().slice(0, 180);
    const key = title.toLowerCase();
    if (existingTitles.has(key)) continue;
    await p.problem.create({
      data: {
        eventId: event.id,
        title,
        description: ps.source ? `${ps.title}\n\nSource: ${ps.source}` : ps.title,
        createdById: admin.id,
        status: "OPENED",
        problemType: "OPEN",
        mode: "OPEN",
        tags: ps.domain || null,
      },
    });
    existingTitles.add(key);
    created += 1;
  }
  console.log(`problems: ${created} created, ${existingTitles.size} total on event`);

  console.log("done.");
  await p.$disconnect();
})();
