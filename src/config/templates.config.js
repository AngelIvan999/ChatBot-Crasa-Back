// ==================== src/config/templates.config.js ====================

/**
 * Configuración de plantillas de WhatsApp
 * Cada plantilla tiene su nombre, texto y función para reemplazar variables
 */
export const TEMPLATES = {
  recordatorio_pedido_hoy: {
    name: "recordatorio_pedido_hoy",
    language: "es_MX",
    getText: (userName = "Cliente") =>
      `*Hola ${userName} 👋*, Te recordamos que *hoy* es tu fecha de pedido programada 🗓️. Por favor realiza tu pedido cuanto antes para asegurar la entrega a tiempo de tus productos. _Si ya realizaste tu pedido, ignora este mensaje_ ✅. ¡Gracias por tu preferencia! 😁`,
    parameters: ["userName"],
  },

  // 🔮 Ejemplo de plantilla futura
  pedido_confirmado: {
    name: "pedido_confirmado",
    language: "es_MX",
    getText: (userName = "Cliente", orderNumber = "") =>
      `¡Hola ${userName}! 🎉 Tu pedido #${orderNumber} ha sido confirmado. Pronto lo procesaremos. ¡Gracias por tu compra! 😊`,
    parameters: ["userName", "orderNumber"],
  },
};

export default TEMPLATES;
