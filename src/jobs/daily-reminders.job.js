// ==================== src/jobs/daily-reminders.job.js ====================
import cron from "node-cron";
import { processReminders } from "../services/reminder.service.js";
import { TIMEZONE } from "../utils/date.utils.js";

let cronJob = null;

/**
 * Inicia el cron job de recordatorios diarios
 * Se ejecuta todos los días a las 10:00 AM hora de México
 */
export function startDailyRemindersJob() {
  if (cronJob) {
    console.log("⚠️  Cron job de recordatorios ya está corriendo");
    return;
  }

  // Cron: "0 10 * * *" = Todos los días a las 10:00 AM
  cronJob = cron.schedule(
    "0 10 * * *",
    async () => {
      console.log("\n⏰ CRON JOB ACTIVADO - Recordatorios diarios");
      try {
        await processReminders();
      } catch (error) {
        console.error("❌ Error en cron job de recordatorios:", error);
      }
    },
    {
      timezone: TIMEZONE,
      scheduled: true,
    }
  );

  console.log("✅ Cron job de recordatorios iniciado");
  console.log(`⏰ Se ejecutará diariamente a las 10:00 AM (${TIMEZONE})`);
}

/**
 * Detiene el cron job
 */
export function stopDailyRemindersJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("🛑 Cron job de recordatorios detenido");
  }
}

export default {
  startDailyRemindersJob,
  stopDailyRemindersJob,
};
