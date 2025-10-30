// ==================== src/utils/date.utils.js ====================
import { DateTime } from "luxon";

export const TIMEZONE = "America/Mexico_City";

/**
 * Obtiene la fecha actual en México
 */
export function getCurrentDateMX() {
  return DateTime.now().setZone(TIMEZONE);
}

/**
 * Parsea una fecha string a DateTime en zona horaria de México
 */
export function parseDateMX(dateString) {
  return DateTime.fromISO(dateString, { zone: TIMEZONE });
}

/**
 * Calcula la próxima fecha según la frecuencia
 */
export function calculateNextDate(currentDate, frequency) {
  const date =
    typeof currentDate === "string" ? parseDateMX(currentDate) : currentDate;

  switch (frequency.toLowerCase()) {
    case "semanal":
      return date.plus({ weeks: 1 });
    case "quincenal":
      return date.plus({ weeks: 2 });
    case "mensual":
      return date.plus({ months: 1 });
    default:
      throw new Error(`Frecuencia desconocida: ${frequency}`);
  }
}

/**
 * Verifica si hoy es el día del recordatorio
 */
export function isReminderDue(nextDateString) {
  const today = getCurrentDateMX().startOf("day");
  const nextDate = parseDateMX(nextDateString).startOf("day");

  return today.equals(nextDate);
}

/**
 * Calcula la primera fecha de recordatorio
 * Si startDate ya pasó, calcula la siguiente fecha según frecuencia
 */
export function calculateFirstReminderDate(startDate, frequency) {
  const today = getCurrentDateMX().startOf("day");
  let reminderDate = parseDateMX(startDate).startOf("day");

  // Si la fecha de inicio es hoy o en el futuro, usar esa fecha
  if (reminderDate >= today) {
    return reminderDate.toISODate();
  }

  // Si ya pasó, calcular la próxima fecha
  while (reminderDate < today) {
    reminderDate = calculateNextDate(reminderDate, frequency);
  }

  return reminderDate.toISODate();
}

/**
 * Formatea una fecha para display
 */
export function formatDateMX(date) {
  const dt = typeof date === "string" ? parseDateMX(date) : date;
  return dt.setLocale("es-MX").toLocaleString(DateTime.DATE_FULL);
}

export default {
  getCurrentDateMX,
  parseDateMX,
  calculateNextDate,
  isReminderDue,
  calculateFirstReminderDate,
  formatDateMX,
};
