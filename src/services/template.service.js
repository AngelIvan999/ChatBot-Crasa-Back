// ==================== src/services/template.service.js ====================
import axios from "axios";
import supabaseService from "./supabase.js";
import TEMPLATES from "../config/templates.config.js";

const META_API_VERSION = process.env.META_API_VERSION || "v22.0";
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

/**
 * Envía plantilla de recordatorio de pedido
 */
export async function sendReminderTemplate(phoneNumber, userName) {
  const templateConfig = TEMPLATES.recordatorio_pedido_hoy;
  return await sendTemplate(phoneNumber, templateConfig.name, [
    userName || "Cliente",
  ]);
}

/**
 * Envía plantilla genérica (para cualquier plantilla)
 */
export async function sendTemplate(phoneNumber, templateName, parameters = []) {
  try {
    console.log(`📤 Enviando template "${templateName}" a ${phoneNumber}`);

    const templateConfig = TEMPLATES[templateName];
    if (!templateConfig) {
      throw new Error(
        `Plantilla "${templateName}" no encontrada en configuración`
      );
    }

    const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "template",
      template: {
        name: templateConfig.name,
        language: {
          code: templateConfig.language,
        },
        components: [
          {
            type: "body",
            parameters: parameters.map((text) => ({
              type: "text",
              text: text || "",
            })),
          },
        ],
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`✅ Template ${templateName} enviado:`, response.data);

    // 💾 GUARDAR EN BASE DE DATOS
    try {
      const user = await supabaseService.findOrCreateUser(phoneNumber);
      const messageText = templateConfig.getText(...parameters);

      await supabaseService.saveChatMessage(user.id, messageText, "outgoing", {
        type: "template",
        template_name: templateName,
        parameters: parameters,
        message_id: response.data.messages?.[0]?.id,
        message_status: response.data.messages?.[0]?.message_status,
        sent_at: new Date().toISOString(),
      });

      console.log(
        `💾 Template ${templateName} guardado en BD para usuario ${user.id}`
      );
    } catch (dbError) {
      console.error(`⚠️ Error guardando template en BD:`, dbError.message);
      // No fallar el envío si falla el guardado
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      `❌ Error enviando template ${templateName}:`,
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
}

export default {
  sendReminderTemplate,
  sendTemplate,
};
