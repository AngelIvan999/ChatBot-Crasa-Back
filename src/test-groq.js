// ==================== test-groq.js ====================
import "dotenv/config";
import { createBot, createFlow, addKeyword } from "@builderbot/bot";
import { MetaProvider } from "@builderbot/provider-meta";
import Groq from "groq-sdk";

const PORT = process.env.PORT || 3000;

// Configurar Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Flow simple de IA
const aiTestFlow = addKeyword(["ai", "test", "groq", "pregunta"]).addAction(
  async (ctx, { flowDynamic }) => {
    try {
      console.log(`🤖 Pregunta recibida de ${ctx.from}: "${ctx.body}"`);

      await flowDynamic("🤔 Pensando...");

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente útil y amigable. Responde de manera concisa y clara.",
          },
          {
            role: "user",
            content: ctx.body,
          },
        ],
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 500,
      });

      const response = chatCompletion.choices[0]?.message?.content;

      if (response) {
        console.log(
          `✅ Respuesta generada: "${response.substring(0, 100)}..."`
        );
        await flowDynamic(response);
      } else {
        await flowDynamic(
          "❌ No pude generar una respuesta. Inténtalo de nuevo."
        );
      }
    } catch (error) {
      console.error("❌ Error con Groq API:", error.message);
      await flowDynamic(`❌ Error: ${error.message}`);
    }
  }
);

// Flow de bienvenida
const welcomeFlow = addKeyword(["hola", "hi", "hello", "start"]).addAnswer(
  [
    "¡Hola! 👋",
    "",
    "Soy un bot de prueba para Groq AI.",
    "",
    "Puedes:",
    "• Escribir *ai* seguido de tu pregunta",
    "• Escribir *test* para una prueba rápida",
    "• Hacer cualquier pregunta directamente",
    "",
    "Ejemplo: *ai ¿Qué es la inteligencia artificial?*",
  ].join("\n")
);

// Flow que captura cualquier mensaje
const catchAllFlow = addKeyword([""]).addAction(async (ctx, { gotoFlow }) => {
  // Si el mensaje no es un comando específico, tratarlo como pregunta de IA
  const message = ctx.body.toLowerCase();

  if (
    !message.includes("hola") &&
    !message.includes("hi") &&
    !message.includes("hello") &&
    !message.includes("start")
  ) {
    return gotoFlow(aiTestFlow);
  }
});

async function main() {
  console.log("🚀 Iniciando bot de prueba Groq...");
  console.log("🤖 AI Provider:", process.env.AI_PROVIDER);
  console.log("🔑 Groq API Key presente:", !!process.env.GROQ_API_KEY);
  console.log(
    "📋 Modelo:",
    process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
  );

  // Verificar que la API key esté configurada
  if (!process.env.GROQ_API_KEY) {
    console.error("❌ Error: GROQ_API_KEY no está configurada en el .env");
    process.exit(1);
  }

  // Test rápido de la API
  try {
    console.log("🧪 Probando conexión con Groq...");
    const testResponse = await groq.chat.completions.create({
      messages: [
        { role: "user", content: "Responde solo con 'OK' si puedes leerme" },
      ],
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      max_tokens: 10,
    });
    console.log(
      "✅ Groq API funcionando:",
      testResponse.choices[0]?.message?.content
    );
  } catch (error) {
    console.error("❌ Error conectando con Groq:", error.message);
    console.log("🔄 Continuando de todas formas...");
  }

  const flow = createFlow([welcomeFlow, aiTestFlow, catchAllFlow]);

  const provider = new MetaProvider({
    jwtToken: process.env.META_ACCESS_TOKEN,
    numberId: process.env.META_PHONE_NUMBER_ID,
    verifyToken: process.env.META_VERIFY_TOKEN,
    apiVersion: process.env.META_API_VERSION || "v22.0",
  });

  // Database mínima
  const mockDatabase = {
    getPrevByNumber: async () => null,
    save: async () => true,
    getList: async () => [],
    saveLog: async () => true,
  };

  // Crear bot
  const { httpServer } = await createBot({
    provider,
    flow,
    database: mockDatabase,
  });

  // Log de mensajes
  provider.on("message", (ctx) => {
    console.log(`📨 Mensaje recibido de ${ctx.from}: "${ctx.body}"`);
  });

  httpServer(+PORT);
  console.log(`🚀 Server iniciado en puerto ${PORT}`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`📱 Envía "hola" para empezar`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
