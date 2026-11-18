import { defineSchedule } from "eve/schedules";
import { OWNER_APPROVED_WORK_LOOP_PROMPT } from "../prompts/owner-approved-work-loop";

export default defineSchedule({
  // This Vercel Hobby project permits only one Cron Job run per day.
  cron: "0 14 * * *",
  content: OWNER_APPROVED_WORK_LOOP_PROMPT,
});
