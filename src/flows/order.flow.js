// ==================== src/flows/order.flow.js ====================
import { addKeyword } from "@builderbot/bot";
import supabaseService from "../services/supabase.js";
import pdfService from "../services/pdf.service.js";

const confirmOrderFlow = addKeyword(
  [
    "✅ Confirmar",
    "CONFIRMAR_PEDIDO",
    "confirmar",
    "confirmar",
    "confirmo",
    "si confirmo",
    "finalizar pedido",
    "procesar pedido",
  ],
  { sensitive: false }
).addAction(async (ctx, { flowDynamic, state }) => {
  try {
    console.log(`🎯 Confirmando pedido para usuario: ${ctx.from}`);

    await state.update({ aiMode: false, conversationActive: false });
    console.log("🚫 Modo IA desactivado para confirmación");

    const user = await supabaseService.findOrCreateUser(ctx.from);
    const sale = await supabaseService.getOpenCartForUser(user.id);

    if (!sale) {
      await flowDynamic(
        "No tienes ningún pedido pendiente.\n\nUsa el botón para hacer un nuevo pedido.",
        {
          buttons: [{ body: "🛍 Hacer pedido" }, { body: "🏠 Inicio" }],
        }
      );
      return;
    }

    if (!sale.total_cents || sale.total_cents <= 0) {
      await flowDynamic(
        "Tu carrito está vacío.\n\nUsa el botón para hacer tu pedido.",
        {
          buttons: [{ body: "🛍 Hacer pedido" }, { body: "🏠 Inicio" }],
        }
      );
      return;
    }

    const saleItems = await supabaseService.getSaleItems(sale.id);

    if (!saleItems || saleItems.length === 0) {
      await flowDynamic(
        "No hay items en tu pedido.\n\nUsa el botón para hacer tu pedido.",
        {
          buttons: [{ body: "🛍 Hacer pedido" }, { body: "🏠 Inicio" }],
        }
      );
      return;
    }

    // Confirmar el pedido
    await supabaseService.updateSaleStatus(sale.id, "confirmed");

    console.log("🎫 Generando ticket PDF...");
    const ticketResult = await pdfService.createAndSaveTicket(sale.id);

    if (ticketResult.success) {
      console.log(`✅ Ticket generado: ${ticketResult.fileName}`);
    } else {
      console.error(`⚠️ Error generando ticket: ${ticketResult.error}`);
    }

    // Mostrar resumen más simple
    let orderSummary = "🎉 *¡PEDIDO CONFIRMADO!* 🎉\n\n";
    orderSummary += "📋 *Resumen:*\n";

    for (const item of saleItems) {
      const itemTotal = item.price_cents / 100;
      orderSummary += `• ${item.product_name} x${
        item.quantity
      } - $${itemTotal.toFixed(2)}\n`;
    }

    orderSummary += `\n💰 *Total: $${(sale.total_cents / 100).toFixed(2)}*\n\n`;

    await flowDynamic(orderSummary);

    await flowDynamic(
      "*Información del pedido:*\n" +
        `📱 WhatsApp: ${user.phone}\n` +
        `🕐 Hora: ${new Date().toLocaleString("es-MX")}\n\n` +
        "Tu pedido será procesado pronto.\n" +
        "¡Gracias por tu compra! 😃",
      {
        buttons: [{ body: "🛍️ Otro pedido" }, { body: "👨🏻‍💻 Soporte" }],
      }
    );

    // Limpiar el estado
    await state.update({
      user,
      aiMode: false,
      conversationActive: false,
    });

    console.log(`✅ Pedido ${sale.id} confirmado para usuario ${user.id}`);
  } catch (error) {
    console.error("❌ Error confirmando pedido:", error);
    await flowDynamic(
      "Hubo un error procesando tu confirmación.\nPor favor intenta de nuevo o contacta soporte.",
      {
        buttons: [{ body: "🔄 Intentar de nuevo" }, { body: "👨🏻‍💻 Soporte" }],
      }
    );
  }
});

const viewCartFlow = addKeyword(
  [
    "🛒 Ver carrito",
    "VER_CARRITO",
    "carrito",
    "ver carrito",
    "mi carrito",
    "pedido actual",
    "ver pedido",
  ],
  { sensitive: false }
).addAction(async (ctx, { flowDynamic }) => {
  try {
    console.log(`🛒 Mostrando carrito para usuario: ${ctx.from}`);

    const user = await supabaseService.findOrCreateUser(ctx.from);
    const sale = await supabaseService.getOpenCartForUser(user.id);

    if (!sale || !sale.total_cents || sale.total_cents <= 0) {
      await flowDynamic(
        "🛒 Tu carrito está vacío.\n\nUsa el botón para hacer tu pedido.",
        {
          buttons: [{ body: "🛍 Hacer pedido" }, { body: "🏠 Inicio" }],
        }
      );
      return;
    }

    const saleItems = await supabaseService.getSaleItems(sale.id);

    if (!saleItems || saleItems.length === 0) {
      await flowDynamic(
        "🛒 No hay items en tu carrito.\n\nUsa el botón para agregar productos.",
        {
          buttons: [{ body: "🛍 Hacer pedido" }, { body: "🏠 Inicio" }],
        }
      );
      return;
    }

    const grouped = {};

    for (const item of saleItems) {
      const key = item.product_name || `product_${item.product_id}`;

      if (!grouped[key]) {
        grouped[key] = {
          product_name: item.product_name || `Producto ${item.product_id}`,
          total_quantity: 0,
          total_price_cents: 0,
          sabores_map: {}, // <-- corregido
        };
      }

      grouped[key].total_quantity += item.quantity || 0;
      grouped[key].total_price_cents += item.price_cents || 0;

      const saborNombre =
        item.sabor_nombre || item.sabor_name || item.flavor_name || null;

      if (saborNombre) {
        const s = saborNombre.toString().toUpperCase();
        grouped[key].sabores_map[s] =
          (grouped[key].sabores_map[s] || 0) + (item.quantity || 0);
      }
    }

    let cartSummary = "🛒 *TU CARRITO ACTUAL* 🛒\n\n";
    cartSummary += "📋 *Items:*\n";

    for (const key in grouped) {
      if (!Object.prototype.hasOwnProperty.call(grouped, key)) continue;

      const g = grouped[key];
      const totalPrice = g.total_price_cents / 100;

      const saboresKeys = Object.keys(g.sabores_map);

      if (saboresKeys.length > 1) {
        const saboresDisplay = saboresKeys
          .map((name) => `${g.sabores_map[name]} ${name}`)
          .join(", ");
        cartSummary += `• ${g.product_name} x${
          g.total_quantity
        } (${saboresDisplay}) - $${totalPrice.toFixed(2)}\n`;
      } else {
        cartSummary += `• ${g.product_name} x${
          g.total_quantity
        } - $${totalPrice.toFixed(2)}\n`;
      }
    }

    cartSummary += `\n💰 *Total: $${(sale.total_cents / 100).toFixed(2)}*\n\n`;
    cartSummary += "¿Qué quieres hacer?";

    await flowDynamic(cartSummary, {
      buttons: [
        { body: "✅ Confirmar" },
        { body: "➕ Agregar" },
        { body: "🗑️ Borrar pedido" },
      ],
    });
  } catch (error) {
    console.error("❌ Error mostrando carrito:", error);
    await flowDynamic(
      "Error mostrando tu carrito.\nPor favor intenta de nuevo.",
      {
        buttons: [{ body: "🔄 Intentar de nuevo" }, { body: "🏠 Inicio" }],
      }
    );
  }
});

const cancelOrderFlow = addKeyword(
  [
    "🗑️ Borrar pedido",
    "🗑️ Cancelar pedido",
    "CANCELAR_PEDIDO",
    "cancelar",
    "cancelar pedido",
    "vaciar carrito",
    "borrar pedido",
    "eliminar pedido",
  ],
  { sensitive: false }
).addAction(async (ctx, { flowDynamic, state }) => {
  try {
    console.log(`🗑️ Cancelando pedido para usuario: ${ctx.from}`);

    const user = await supabaseService.findOrCreateUser(ctx.from);
    const sale = await supabaseService.getOpenCartForUser(user.id);

    if (!sale) {
      await flowDynamic("No tienes ningún pedido activo para cancelar.", {
        buttons: [{ body: "🛍 Hacer pedido" }, { body: "🏠 Inicio" }],
      });
      return;
    }

    // Cambiar status a cancelado
    await supabaseService.updateSaleStatus(sale.id, "cancelled");

    await flowDynamic(
      "🗑️ *Pedido cancelado correctamente*\n\nTu carrito ha sido vaciado.",
      {
        buttons: [{ body: "🛍️ Hacer nuevo pedido" }, { body: "🏠 Inicio" }],
      }
    );

    // Limpiar estado
    await state.update({
      user,
      aiMode: false,
      conversationActive: false,
    });

    console.log(`✅ Pedido ${sale.id} cancelado para usuario ${user.id}`);
  } catch (error) {
    console.error("❌ Error cancelando pedido:", error);
    await flowDynamic(
      "Error cancelando el pedido.\nPor favor intenta de nuevo.",
      {
        buttons: [{ body: "🔄 Intentar de nuevo" }, { body: "🏠 Inicio" }],
      }
    );
  }
});

// Flow para agregar productos
const addMoreProductsFlow = addKeyword([
  "➕ Agregar",
  "AGREGAR_MAS",
  "🛍️ Otro pedido",
  "🛍️ Nuevo pedido",
  "HACER_PEDIDO",
]).addAnswer(
  "🛍️ Te conecta con nuestro asistente para que puedas agregar productos.",
  {
    buttons: [{ body: "🚪 Salir" }],
  },
  async (ctx, { state }) => {
    console.log("🤖 Activando asistente para agregar productos:", ctx.from);
    const user = await supabaseService.findOrCreateUser(ctx.from);
    await state.update({
      user,
      aiMode: true,
      conversationActive: true,
    });
  }
);

// Flow para contactar soporte
const contactSupportFlow = addKeyword([
  "👨🏻‍💻 Soporte",
  "CONTACTAR_SOPORTE",
  "soporte",
  "ayuda",
  "problema",
]).addAnswer(
  "📞 *Contactar Soporte*\n\n" +
    "Si tienes algún problema con tu pedido o necesitas mayor ayuda:\n\n" +
    "📱 WhatsApp: +52 777 412 0544\n" +
    "📧 Email: admin@crasa.com\n" +
    "🕐 Horario: Lun-Dom 9:00-22:00\n\n" +
    "¡Estamos aquí para ayudarte!",
  {
    buttons: [{ body: "🏠 Inicio" }],
  }
);

// Flow para intentar de nuevo
const retryFlow = addKeyword(["🔄 Intentar de nuevo", "REINTENTAR"])
  .addAction(async (ctx, { state }) => {
    const user = await supabaseService.findOrCreateUser(ctx.from);
    await state.update({ user, aiMode: false, conversationActive: false });
  })
  .addAnswer("🔄 Empecemos de nuevo. ¿Qué te gustaría hacer?", {
    buttons: [
      { body: "🛍 Hacer pedido" },
      { body: "📋 Ver menú" },
      { body: "🛒 Ver carrito" },
    ],
  });

export default [
  confirmOrderFlow,
  viewCartFlow,
  cancelOrderFlow,
  addMoreProductsFlow,
  contactSupportFlow,
  retryFlow,
];
