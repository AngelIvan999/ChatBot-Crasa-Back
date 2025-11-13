// ==================== src/app.js ====================
import "dotenv/config";
import { createBot, createFlow } from "@builderbot/bot";
import { MetaProvider } from "@builderbot/provider-meta";
import supabaseService from "./services/supabase.js";
import { startDailyRemindersJob } from "./jobs/daily-reminders.job.js";
import {
  processReminders,
  sendManualReminder,
} from "./services/reminder.service.js";
import { sendReminderTemplate } from "./services/template.service.js";

// Flows
import welcomeFlow from "./flows/welcome.flow.js";
import orderFlows from "./flows/order.flow.js";
import aiAssistantFlow from "./flows/ai-assistant.flow.js";

const PORT = process.env.PORT || 3000;

const processedMessages = new Set();

async function main() {
  console.log("🚀 Iniciando chatbot...");
  console.log("🤖 AI Provider:", process.env.AI_PROVIDER);
  console.log("🔑 Groq API Key presente:", !!process.env.GROQ_API_KEY);

  // Verificar configuración
  if (!process.env.GROQ_API_KEY) {
    console.error("❌ Error: GROQ_API_KEY no está configurada");
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Error: Configuración de Supabase incompleta");
    process.exit(1);
  }

  // Probar Supabase
  try {
    console.log("🧪 Probando conexión con Supabase...");
    const products = await supabaseService.getProducts();
    console.log(`✅ Supabase conectada - ${products.length} productos`);
  } catch (error) {
    console.error("❌ Error con Supabase:", error.message);
  }

  // Crear flows
  const flow = createFlow([...welcomeFlow, ...orderFlows, ...aiAssistantFlow]);

  // Crear provider
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

  // ✅ CREAR BOT Y OBTENER handleCtx
  const { httpServer, handleCtx } = await createBot({
    provider,
    flow,
    database: mockDatabase,
  });

  // ✅ CONFIGURAR ENDPOINTS usando handleCtx
  const app = provider.server;

  // Middleware CORS
  app.use((req, res, next) => {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://crasabot.netlify.app/", // 👈 Reemplazar con tu URL de Netlify
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }
    next();
  });

  // 📡 Health check
  app.get("/api/health", (req, res) => {
    console.log("✅ Health check");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        message: "Servidor funcionando",
        timestamp: new Date().toISOString(),
      })
    );
  });

  // 📧 Endpoint: 📤 Enviar mensaje usando handleCtx
  app.post(
    "/api/send-message",
    handleCtx(async (bot, req, res) => {
      try {
        console.log("📨 POST /api/send-message");
        console.log("📦 Body:", req.body);

        const { phone, message } = req.body;

        if (!phone || !message) {
          console.log("❌ Faltan parámetros");
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "Faltan parámetros: phone y message son requeridos",
            })
          );
          return;
        }

        // Usar bot.sendMessage
        try {
          console.log("📤 Intentando enviar mensaje...");
          await bot.sendMessage(phone, message, {});

          // ✅ NO guardar aquí - el interceptor ya lo hace automáticamente

          console.log("✅ Mensaje enviado correctamente");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              message: "Mensaje enviado correctamente",
            })
          );
        } catch (sendError) {
          console.error("❌ Error enviando mensaje:", sendError);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: sendError.message || "Error enviando mensaje",
            })
          );
        }
      } catch (error) {
        console.error("❌ Error en endpoint:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
          })
        );
      }
    })
  );

  // 📧 Endpoint: Enviar plantilla de recordatorio
  app.post("/api/send-reminder-template", async (req, res) => {
    try {
      console.log("📨 POST /api/send-reminder-template");
      const { phone, name } = req.body;

      if (!phone) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "El parámetro 'phone' es requerido",
          })
        );
        return;
      }

      const result = await sendReminderTemplate(phone, name || "Cliente");

      if (result.success) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: "Recordatorio enviado correctamente",
            data: result.data,
          })
        );
      } else {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: result.error,
          })
        );
      }
    } catch (error) {
      console.error("❌ Error en endpoint de recordatorio:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: error.message,
        })
      );
    }
  });

  // 🔔 Endpoint: Ejecutar recordatorios manualmente
  app.post("/api/reminders/run", async (req, res) => {
    try {
      console.log("🔔 POST /api/reminders/run - Ejecución manual");

      const result = await processReminders();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: "Proceso de recordatorios completado",
          stats: result,
        })
      );
    } catch (error) {
      console.error("❌ Error ejecutando recordatorios:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: error.message,
        })
      );
    }
  });

  // 🔔 Endpoint: Enviar recordatorio a usuario específico
  app.post("/api/reminders/send-manual", async (req, res) => {
    try {
      console.log("🔔 POST /api/reminders/send-manual");
      const { userId } = req.body;

      if (!userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "El parámetro 'userId' es requerido",
          })
        );
        return;
      }

      const result = await sendManualReminder(userId);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error("❌ Error en recordatorio manual:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: error.message,
        })
      );
    }
  });

  // 📧 Endpoint: Vaciar historial de chat
  app.delete(
    "/api/chat/:userId/clear",
    handleCtx(async (bot, req, res) => {
      try {
        console.log(`🗑️ DELETE /api/chat/${req.params.userId}/clear`);

        const userId = parseInt(req.params.userId);

        if (!userId || isNaN(userId)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "userId inválido",
            })
          );
          return;
        }

        // Eliminar todos los mensajes del usuario
        await supabaseService.clearChatHistory(userId);

        console.log(`✅ Chat limpiado para usuario ${userId}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: "Historial eliminado correctamente",
          })
        );
      } catch (error) {
        console.error("❌ Error limpiando chat:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
          })
        );
      }
    })
  );

  // 📧 Endpoint: Bloquear/Desbloquear usuario
  app.post(
    "/api/user/:userId/block",
    handleCtx(async (bot, req, res) => {
      try {
        console.log(`🚫 POST /api/user/${req.params.userId}/block`);

        const userId = parseInt(req.params.userId);
        const { blocked } = req.body; // true o false

        if (!userId || isNaN(userId)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "userId inválido",
            })
          );
          return;
        }

        if (typeof blocked !== "boolean") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: "El parámetro 'blocked' debe ser true o false",
            })
          );
          return;
        }

        // Actualizar estado de bloqueo en metadata
        await supabaseService.setUserBlocked(userId, blocked);

        const action = blocked ? "bloqueado" : "desbloqueado";
        console.log(`✅ Usuario ${userId} ${action}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: `Usuario ${action} correctamente`,
            blocked: blocked,
          })
        );
      } catch (error) {
        console.error("❌ Error bloqueando usuario:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
          })
        );
      }
    })
  );

  // Interceptar mensajes entrantes
  provider.on("message", async (ctx) => {
    try {
      const messageId = `${ctx.from}_${ctx.body}_${Date.now()}`;
      if (processedMessages.has(messageId)) {
        console.log(`⏭️ Mensaje duplicado ignorado: ${ctx.body}`);
        return;
      }

      processedMessages.add(messageId);
      if (processedMessages.size > 100) {
        const firstItem = processedMessages.values().next().value;
        processedMessages.delete(firstItem);
      }

      console.log(`📨 Mensaje recibido de ${ctx.from}: "${ctx.body}"`);
      const user = await supabaseService.findOrCreateUser(ctx.from);

      const isBlocked = await supabaseService.isUserBlocked(user.id);
      if (isBlocked) {
        console.log(
          `🚫 Usuario ${user.id} (${ctx.from}) está bloqueado - mensaje ignorado`
        );
        return;
      }

      await supabaseService.saveChatMessage(
        user.id,
        ctx.body || "",
        "incoming",
        ctx
      );
      console.log(`💾 Mensaje guardado en BD`);
    } catch (err) {
      console.error("❌ Error guardando mensaje:", err);
    }
  });

  // Interceptar respuestas del bot
  const originalSendMessage = provider.sendMessage.bind(provider);
  provider.sendMessage = async function (phone, message, options) {
    try {
      console.log(`📤 Enviando mensaje a ${phone}`);
      const result = await originalSendMessage(phone, message, options);

      const user = await supabaseService.findOrCreateUser(phone);
      const messageStr =
        typeof message === "string" ? message : JSON.stringify(message);

      let rawPayload = {};
      if (options?.options?.buttons)
        rawPayload.buttons = options.options.buttons;
      else if (options?.buttons) rawPayload.buttons = options.buttons;
      if (options?.media) rawPayload.media = options.media;

      await supabaseService.saveChatMessage(
        user.id,
        messageStr,
        "outgoing",
        rawPayload
      );

      console.log(`💾 Respuesta guardada en BD`);
      return result;
    } catch (err) {
      console.error("❌ Error en sendMessage interceptado:", err);
      throw err;
    }
  };

  // 🕐 Iniciar cron job de recordatorios
  /*if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_CRON === "true"
  ) {
    startDailyRemindersJob();
  } else {
    console.log("ℹ️  Cron job deshabilitado (development mode)");
    console.log("   Usa ENABLE_CRON=true para habilitarlo");
  }*/
  console.log("⚠️  Sistema de recordatorios deshabilitado temporalmente");

  // Iniciar servidor
  httpServer(+PORT);

  console.log(`\n✅ Bot iniciado exitosamente`);
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/send-message`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook\n`);
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
