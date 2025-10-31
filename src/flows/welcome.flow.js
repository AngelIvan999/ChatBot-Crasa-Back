// ==================== src/flows/welcome.flow.js ====================
import { addKeyword } from "@builderbot/bot";
import supabaseService from "../services/supabase.js";
import { aiCatchAllFlow } from "./ai-assistant.flow.js";

// Flow para keywords de inicio
const keywordFlow = addKeyword([
  "hola",
  "hi",
  "hello",
  "start",
  "inicio",
  "empezar",
  "comenzar",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
])
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const currentState = state.getMyState() || {};
    if (currentState.aiMode) {
      console.log("🤖 Modo IA activo - redirigiendo a AI flow");
      return gotoFlow(aiCatchAllFlow); // El primer flow es aiCatchAllFlow
    }

    console.log("🔑 Keyword flow activado, desactivando IA si estaba activa");
    const user = await supabaseService.findOrCreateUser(ctx.from);
    await state.update({ user, aiMode: false, conversationActive: false });

    if (!user?.name || user.name === "") {
      await flowDynamic("¡Hola! Bienvenido a nuestro servicio de pedidos.");
      // Esto hace que no siga con las siguientes respuestas del flujo
      //return endFlow();
    }

    if (user?.name) {
      await flowDynamic(`¡Hola ${user.name}! 👋 Bienvenido.`);
    }
  })
  .addAnswer("¿Qué te gustaría hacer?", {
    buttons: [
      { body: "🛍 Hacer pedido" },
      { body: "📋 Ver menú" },
      { body: "❓ Ayuda" },
    ],
  });

// Flow para botón de asistente
const assistantButtonFlow = addKeyword([
  "🛍 Hacer pedido",
  "HABLAR_CON_PERSONA",
]).addAnswer(
  "¡Hola! ¿En qué puedo ayudarte?",
  {
    buttons: [{ body: "🚪 Salir" }],
  },
  async (ctx, { state }) => {
    console.log("🤖 Modo asistente activado para:", ctx.from);
    const user = await supabaseService.findOrCreateUser(ctx.from);
    await state.update({
      user,
      aiMode: true,
      conversationActive: true,
    });
  }
);

// Flow para salir del modo asistente
const exitAssistantFlow = addKeyword(["🚪 Salir", "SALIR_ASISTENTE"])
  .addAction(async (ctx, { state }) => {
    await state.update({ aiMode: false, conversationActive: false });
  })
  .addAnswer("👋 Has salido del asistente.\n\n¿Qué te gustaría hacer?", {
    buttons: [
      { body: "🛍 Hacer pedido" },
      { body: "📋 Ver menú" },
      { body: "❓ Ayuda" },
    ],
  });

// Flow para mostrar menú
const menuButtonFlow = addKeyword(["📋 Ver menú", "VER_MENU"]).addAction(
  async (ctx, { state, flowDynamic }) => {
    console.log("🎯 Usuario eligió Ver menú");

    try {
      const user = await supabaseService.findOrCreateUser(ctx.from);
      await state.update({ user, aiMode: false });

      const products = await supabaseService.getProducts();

      if (!products || products.length === 0) {
        await flowDynamic("No hay productos disponibles por el momento.");
        await flowDynamic("Usa el botón para hablar con nuestro asistente.", {
          buttons: [{ body: "🛍 Hacer pedido" }],
        });
        return;
      }

      // Agrupar productos por marca (JUMEX, BIDA)
      const jumexProducts = products.filter((p) =>
        p.nombre_product.includes("JUMEX")
      );
      const bidaProducts = products.filter((p) =>
        p.nombre_product.includes("BIDA")
      );

      let text = "🍹 *NUESTRO MENÚ* 🍹\n\n";

      // Mostrar productos JUMEX
      if (jumexProducts.length > 0) {
        text += "*🧊 JUGOS JUMEX*\n";
        jumexProducts.forEach((p) => {
          const priceDisplay = (parseFloat(p.prc_menudeo) || 0).toFixed(2);
          // Usar sabores_array del nuevo schema
          const saboresDisplay = p.sabores_array
            ? p.sabores_array.join(", ")
            : "N/A";
          text += `• ${p.nombre_product}\n`;
          text += `Sabores: ${saboresDisplay}\n`;
          text += `Paquete de ${p.pzs_caja}: $${priceDisplay}\n\n`;
        });
      }

      // Mostrar productos BIDA
      if (bidaProducts.length > 0) {
        text += "*🥤 JUGOS BIDA*\n";
        bidaProducts.forEach((p) => {
          const priceDisplay = (parseFloat(p.prc_menudeo) || 0).toFixed(2);
          // Usar sabores_array del nuevo schema
          const saboresDisplay = p.sabores_array
            ? p.sabores_array.join(", ")
            : "N/A";
          text += `• ${p.nombre_product}\n`;
          text += `Sabores: ${saboresDisplay}\n`;
          text += `Paquete de ${p.pzs_caja}: $${priceDisplay}\n\n`;
        });
      }
      await flowDynamic(text);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await flowDynamic("¿Qué te gustaría hacer?", {
        buttons: [
          { body: "🏠 Inicio" },
          { body: "🛍 Hacer pedido" },
          { body: "❓ Ayuda" },
        ],
      });

      console.log("✅ Menú enviado correctamente");
    } catch (error) {
      console.error("❌ Error obteniendo productos:", error);
      await flowDynamic("Error obteniendo el menú. Intenta más tarde.");
      await flowDynamic("Usa el botón para hablar con nuestro asistente.", {
        buttons: [{ body: "🛍 Hacer pedido" }],
      });
    }
  }
);

// Flow para volver al inicio
const backToStartFlow = addKeyword(["🏠 Inicio", "INICIO"])
  .addAction(async (ctx, { state }) => {
    const user = await supabaseService.findOrCreateUser(ctx.from);
    await state.update({ user, aiMode: false, conversationActive: false });
  })
  .addAnswer("🏠 ¿Qué te gustaría hacer?", {
    buttons: [
      { body: "🛍 Hacer pedido" },
      { body: "📋 Ver menú" },
      { body: "❓ Ayuda" },
    ],
  });

// Flow para ayuda
const helpFlow = addKeyword(["❓ Ayuda", "ayuda", "help", "AYUDA"])
  .addAnswer(
    "🤔 ¿Necesitas ayuda?:\n\n" +
      "*🛍 Hacer pedido*\n" +
      "• Habla con el asistente y pide naturalmente.\n" +
      "• Ej: 'Quiero un paquete de jumex lb 460, 3 de manzana y 3 de mango'\n\n" +
      "📋 *Ver menú*\n" +
      "• Muestra todos los productos, sabores y precios por paquete.\n\n" +
      "💡 *Consejo*\n" +
      "• Puedes combinar sabores dentro de un mismo paquete.\n"
  )
  .addAnswer("🏠 ¿Qué te gustaría hacer?", {
    buttons: [
      { body: "🏠 Inicio" },
      { body: "🛍 Hacer pedido" },
      { body: "👨🏻‍💻 Soporte" },
    ],
  });

console.log("✅ Welcome flows cargados");

export default [
  keywordFlow,
  assistantButtonFlow,
  exitAssistantFlow,
  menuButtonFlow,
  backToStartFlow,
  helpFlow,
];
