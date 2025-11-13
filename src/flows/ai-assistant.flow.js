// ==================== src/flows/ai-assistant.flow.js CORREGIDO ====================
import { addKeyword } from "@builderbot/bot";
import {
  generateAIResponse,
  parseOrderFromResponse,
  getCleanResponseText,
  isEndingOrder,
  isSimpleConfirmation,
} from "../services/ai.service.js";
import supabaseService from "../services/supabase.js";
import { checkIfBlocked } from "../utils/block.utils.js";

console.log("🔄 Cargando ai-assistant.flow.js...");

async function processAIMessage(ctx, { state, flowDynamic }) {
  const userMessage = ctx.body?.trim();

  if (!userMessage) {
    await flowDynamic("❓ No entendí tu mensaje, ¿puedes repetir?");
    return;
  }

  try {
    console.log("🔄 Enviando mensaje a IA:", userMessage);

    const currentState = state.getMyState() || {};
    let user = currentState.user;

    if (!user) {
      user = await supabaseService.findOrCreateUser(ctx.from);
      await state.update({ ...currentState, user });
    }

    /*await supabaseService.saveChatMessage(user.id, userMessage, "incoming", {
      from: ctx.from,
      timestamp: new Date().toISOString(),
    });*/

    const recentHistory = await supabaseService.getChatHistory(user.id, 6);
    const lastBotResponse =
      recentHistory.filter((h) => h.direction === "outgoing").pop()?.message ||
      "";

    console.log(
      "📖 Último mensaje del bot:",
      lastBotResponse.substring(0, 50) + "..."
    );

    // DETECCIÓN: Usuario terminando pedido
    if (isEndingOrder(userMessage)) {
      console.log("🏁 Usuario está terminando pedido - verificando carrito...");

      const sale = await supabaseService.getOpenCartForUser(user.id);

      if (!sale || sale.total_cents <= 0) {
        await flowDynamic(
          "No tienes productos en tu carrito aún. ¿Qué te gustaría pedir?"
        );
        return;
      }

      const saleItems = await supabaseService.getSaleItems(sale.id);
      console.log(`📦 Items en carrito: ${saleItems.length}`);

      if (!saleItems || saleItems.length === 0) {
        await flowDynamic(
          "No tienes productos en tu carrito aún. ¿Qué te gustaría pedir?"
        );
        return;
      }

      // Mostrar resumen con precios correctos
      let summary = "✅ *Perfecto, tu pedido está listo:*\n\n";

      saleItems.forEach((item) => {
        const saborText = item.sabor_nombre ? ` (${item.sabor_nombre})` : "";
        const itemTotal = (item.price_cents / 100).toFixed(2);
        summary += `• ${item.product_name}${saborText} x${item.quantity} - $${itemTotal}\n`;
      });

      summary += `\n💰 *Total: $${(sale.total_cents / 100).toFixed(2)}*\n\n`;
      summary += "¿Quieres confirmar tu pedido?";

      /*await supabaseService.saveChatMessage(user.id, summary, "outgoing", {
        type: "cart_summary",
        total_cents: sale.total_cents,
        items_count: saleItems.length,
      });*/

      await flowDynamic(summary, {
        buttons: [
          { body: "✅ Confirmar" },
          { body: "🛒 Ver carrito" },
          { body: "➕ Agregar" },
        ],
      });

      return;
    }

    // DETECCIÓN: Confirmación simple
    if (isSimpleConfirmation(userMessage, lastBotResponse)) {
      console.log("✅ Confirmación simple detectada");

      const sale = await supabaseService.getOpenCartForUser(user.id);
      if (sale && sale.total_cents > 0) {
        const confirmMessage =
          "¡Excelente! ¿Quieres proceder con la confirmación de tu pedido?";

        /*await supabaseService.saveChatMessage(
          user.id,
          confirmMessage,
          "outgoing",
          {
            type: "confirmation_prompt",
          }
        );*/

        await flowDynamic(confirmMessage, {
          buttons: [
            { body: "✅ Confirmar" },
            { body: "🛒 Ver carrito" },
            { body: "➕ Agregar" },
          ],
        });
        return;
      } else {
        const emptyCartMessage =
          "No tienes productos en tu carrito. ¿Qué te gustaría pedir?";
        /*await supabaseService.saveChatMessage(
          user.id,
          emptyCartMessage,
          "outgoing"
        );*/
        await flowDynamic(emptyCartMessage);
        return;
      }
    }

    // Generar respuesta de IA normal
    const aiResponse = await generateAIResponse(userMessage, user.id);

    if (!aiResponse) {
      await flowDynamic("❌ No se pudo generar respuesta, intenta de nuevo.");
      return;
    }

    console.log(
      "✅ Respuesta de IA recibida:",
      aiResponse.substring(0, 100) + "..."
    );

    // Parsear productos en la respuesta
    const orderData = parseOrderFromResponse(aiResponse);
    console.log("🔍 Items encontrados en respuesta:", orderData.items.length);

    const cleanResponseText = getCleanResponseText(aiResponse);

    /*await supabaseService.saveChatMessage(
      user.id,
      cleanResponseText,
      "outgoing",
      {
        type: "ai_response",
        has_items: orderData.items.length > 0,
        items_count: orderData.items.length,
      }
    );*/

    // Enviar respuesta limpia siempre
    await flowDynamic(cleanResponseText);

    // PROCESAMIENTO DE CARRITO MEJORADO
    if (orderData.items && orderData.items.length > 0) {
      console.log(
        "🛒 Procesando items del carrito:",
        orderData.items.length,
        "items"
      );

      try {
        // Obtener o crear carrito
        let sale = await supabaseService.getOpenCartForUser(user.id);
        if (!sale) {
          sale = await supabaseService.createSale(user.id);
          console.log("🆕 Nuevo carrito creado:", sale.id);
        } else {
          console.log("📦 Usando carrito existente:", sale.id);
        }

        // Procesar cada item individualmente
        for (const item of orderData.items) {
          const operation = item.operation || "add";

          const totalPriceCents =
            item.total_price_cents || Math.round(item.total_price * 100);
          const saborId = item.sabor_id || null;

          console.log(`🍇 Procesando item:`, {
            product_id: item.product_id,
            nombre_product: item.nombre_product,
            sabor_id: saborId,
            sabor_nombre: item.sabor_nombre,
            quantity: item.quantity,
            operation: operation,
            total_price: item.total_price,
            total_price_cents: totalPriceCents,
          });

          if (operation === "remove") {
            await supabaseService.removeSaleItem(
              sale.id,
              item.product_id,
              saborId
            );
            console.log(
              `❌ Removido: ${item.nombre_product}${
                item.sabor_nombre ? ` (${item.sabor_nombre})` : ""
              }`
            );
          } else if (operation === "add") {
            await supabaseService.addSaleItemNew(
              sale.id,
              item.product_id,
              item.quantity,
              totalPriceCents,
              saborId
            );

            const saborText = item.sabor_nombre
              ? ` (${item.sabor_nombre})`
              : "";
            console.log(
              `✅ Item procesado: ${item.nombre_product}${saborText} x${item.quantity} - Total: $${item.total_price}`
            );
          }
        }

        // Recalcular total del carrito
        const updatedSale = await supabaseService.recalculateCartTotal(sale.id);
        console.log(
          `🛒 Carrito actualizado - Total final: $${(
            updatedSale.total_cents / 100
          ).toFixed(2)}`
        );

        // Actualizar estado
        await state.update({
          ...currentState,
          user,
          currentCart: updatedSale,
        });

        // MOSTRAR BOTONES DESPUÉS DE AGREGAR PRODUCTOS
        console.log("🎯 Mostrando opciones después de agregar productos");

        await flowDynamic("¿Qué te gustaría hacer ahora?", {
          buttons: [
            { body: "✅ Confirmar" },
            { body: "🛒 Ver carrito" },
            { body: "➕ Agregar" },
          ],
        });
      } catch (dbError) {
        console.error("❌ Error procesando carrito:", dbError);
        await flowDynamic(
          "⚠️ Hubo un problema guardando tu pedido. Intenta de nuevo.",
          {
            buttons: [{ body: "🔄 Intentar de nuevo" }, { body: "🚪 Salir" }],
          }
        );
      }
    } else {
      // Si no hay items, detectar si necesita mostrar botones
      const needsButtons =
        cleanResponseText.toLowerCase().includes("algo más") ||
        cleanResponseText.toLowerCase().includes("es todo") ||
        cleanResponseText.toLowerCase().includes("agregar") ||
        cleanResponseText.toLowerCase().includes("continuar");

      if (needsButtons) {
        const sale = await supabaseService.getOpenCartForUser(user.id);
        if (sale && sale.total_cents > 0) {
          console.log("🎯 Mostrando opciones por contexto");
          await flowDynamic("¿Qué prefieres hacer?", {
            buttons: [
              { body: "✅ Confirmar" },
              { body: "🛒 Ver carrito" },
              { body: "➕ Agregar" },
            ],
          });
        }
      }
    }
  } catch (error) {
    console.error("❌ Error procesando mensaje de IA:", error);
    await flowDynamic("❌ Hubo un error procesando tu mensaje.", {
      buttons: [{ body: "🔄 Intentar de nuevo" }, { body: "🚪 Salir" }],
    });
  }
}

// FLOW PRINCIPAL: Capturar mensajes en modo IA
export const aiCatchAllFlow = addKeyword([/[\s\S]*/], { regex: true })
  .addAction(async (ctx, { state, endFlow }) => {
    if (await checkIfBlocked(ctx, endFlow)) return;

    const currentState = state.getMyState() || {};

    if (!currentState.aiMode) {
      return null;
    }

    const ignoredCommands = [
      "hola",
      "✅ confirmar",
      "🛒 ver carrito",
      "🗑️ borrar pedido",
      "🚪 salir",
      "🏠 Inicio",
      "❓ Ayuda",
      "📋 Ver menú",
      "➕ agregar",
      "👨🏻‍💻 Soporte",
      "🔄 intentar de nuevo",
      "confirmar",
      "carrito",
      "borrar",
      "hola",
      "ayuda",
      "soporte",
    ];

    const message = ctx.body?.toLowerCase().trim();

    if (ignoredCommands.some((cmd) => message.includes(cmd.toLowerCase()))) {
      console.log("🔄 Delegando a otro flow:", message);
      return null;
    }

    console.log("🤖 [AI] Procesando:", ctx.body);
  })
  .addAction(processAIMessage);

const aiErrorFlow = addKeyword(["error", "problema", "falla"]).addAction(
  async (ctx, { state, flowDynamic }) => {
    const currentState = state.getMyState() || {};

    if (!currentState.aiMode) {
      return null;
    }

    console.log("🔧 Manejando error en modo IA");

    await flowDynamic("Parece que hubo un problema. ¿Qué te gustaría hacer?", {
      buttons: [
        { body: "🔄 Intentar de nuevo" },
        { body: "🛒 Ver carrito" },
        { body: "🚪 Salir" },
      ],
    });
  }
);

const aiSpecialCommandsFlow = addKeyword([
  "🔄 intentar de nuevo",
  "intentar de nuevo",
  "reintentar",
]).addAction(async (ctx, { state, flowDynamic }) => {
  const currentState = state.getMyState() || {};

  if (!currentState.aiMode) {
    return null;
  }

  console.log("🔄 Reintentando en modo IA");

  await flowDynamic("Perfecto, vamos de nuevo. ¿Qué te gustaría pedir?", {
    buttons: [{ body: "🛒 Ver carrito" }, { body: "🚪 Salir" }],
  });
});

console.log("✅ ai-assistant.flow.js cargado completamente");

export default [aiCatchAllFlow, aiErrorFlow, aiSpecialCommandsFlow];
