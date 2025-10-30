// ==================== src/services/meta.service.js ====================
import axios from "axios";

const META_API_VERSION = process.env.META_API_VERSION || "v22.0";
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

export async function sendWhatsAppMessage(phoneNumber, messageText) {
  try {
    console.log(`📤 Enviando mensaje a ${phoneNumber}:`, messageText);

    const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "text",
      text: { body: messageText },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Mensaje enviado:", response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Error enviando mensaje:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
}

export default { sendWhatsAppMessage };
