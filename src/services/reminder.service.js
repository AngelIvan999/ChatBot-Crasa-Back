// ==================== src/services/reminder.service.js ====================
import supabaseService from "./supabase.js";
import { sendReminderTemplate } from "./template.service.js";
import {
  isReminderDue,
  calculateNextDate,
  parseDateMX,
  getCurrentDateMX,
} from "../utils/date.utils.js";

/**
 * Procesa recordatorios para todos los usuarios
 */
export async function processReminders() {
  console.log("\n🔔 ===== INICIANDO PROCESO DE RECORDATORIOS =====");
  console.log(`⏰ Fecha/Hora: ${getCurrentDateMX().toISO()}`);

  try {
    // Obtener todos los usuarios con metadata configurada
    const users = await supabaseService.getUsersWithReminders();

    console.log(`👥 Usuarios encontrados: ${users.length}`);

    if (users.length === 0) {
      console.log("ℹ️  No hay usuarios con recordatorios configurados");
      return { sent: 0, errors: 0, skipped: 0 };
    }

    let sent = 0;
    let errors = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        const result = await processUserReminder(user);

        if (result.sent) sent++;
        else if (result.error) errors++;
        else skipped++;
      } catch (error) {
        console.error(`❌ Error procesando usuario ${user.id}:`, error.message);
        errors++;
      }
    }

    console.log("\n📊 RESUMEN:");
    console.log(`   ✅ Enviados: ${sent}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`   ⏭️  Omitidos: ${skipped}`);
    console.log("🔔 ===== FIN PROCESO DE RECORDATORIOS =====\n");

    return { sent, errors, skipped };
  } catch (error) {
    console.error("❌ Error general en processReminders:", error);
    throw error;
  }
}

/**
 * Procesa recordatorio para un usuario individual
 */
async function processUserReminder(user) {
  const { id, phone, name, metadata } = user;

  console.log(`\n👤 Procesando: ${name || phone}`);

  // Validar metadata
  if (!metadata?.nextDate || !metadata?.frequency) {
    console.log(`   ⚠️  Sin configuración de recordatorio`);
    return { sent: false, error: false };
  }

  const { nextDate, frequency } = metadata;

  console.log(`   📅 Próxima fecha: ${nextDate}`);
  console.log(`   🔄 Frecuencia: ${frequency}`);

  // Verificar si es el día del recordatorio
  if (!isReminderDue(nextDate)) {
    console.log(`   ⏭️  No es su día de recordatorio`);
    return { sent: false, error: false };
  }

  console.log(`   🎯 ¡Es su día de recordatorio!`);

  // Enviar recordatorio
  const result = await sendReminderTemplate(phone, name || "Cliente");

  if (!result.success) {
    console.log(`   ❌ Error al enviar: ${result.error}`);
    return { sent: false, error: true };
  }

  console.log(`   ✅ Recordatorio enviado exitosamente`);

  // Calcular y actualizar próxima fecha
  const currentNextDate = parseDateMX(nextDate);
  const newNextDate = calculateNextDate(currentNextDate, frequency);
  const newNextDateISO = newNextDate.toISODate();

  console.log(`   📅 Nueva próxima fecha: ${newNextDateISO}`);

  const updatedMetadata = {
    ...metadata,
    nextDate: newNextDateISO,
    lastReminderSent: getCurrentDateMX().toISO(),
  };

  await supabaseService.updateUserMetadata(id, updatedMetadata);
  console.log(`   💾 Metadata actualizada`);

  return { sent: true, error: false };
}

/**
 * Envía recordatorio manual a un usuario específico
 */
export async function sendManualReminder(userId) {
  console.log(`\n🔔 Enviando recordatorio manual para usuario ${userId}`);

  try {
    const user = await supabaseService.getUserById(userId);

    if (!user) {
      throw new Error(`Usuario ${userId} no encontrado`);
    }

    const result = await processUserReminder(user);

    if (result.sent) {
      return { success: true, message: "Recordatorio enviado exitosamente" };
    } else if (result.error) {
      return { success: false, message: "Error al enviar recordatorio" };
    } else {
      return { success: false, message: "Usuario sin configuración válida" };
    }
  } catch (error) {
    console.error("❌ Error en recordatorio manual:", error);
    throw error;
  }
}

export default {
  processReminders,
  sendManualReminder,
};
