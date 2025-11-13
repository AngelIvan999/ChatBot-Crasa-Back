// ==================== src/services/supabase.js CORREGIDO ====================
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default {
  supabase: supabase,
  // Users (sin cambios)
  async findOrCreateUser(phone, name = null) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      await supabase
        .from("users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", data.id);
      return data;
    }

    const { data: newUser } = await supabase
      .from("users")
      .insert({ phone, name })
      .select()
      .single();
    return newUser;
  },

  async updateUserName(phone, name) {
    const { data, error } = await supabase
      .from("users")
      .update({ name })
      .eq("phone", phone)
      .select()
      .single();

    if (error) {
      console.error("❌ Error actualizando nombre:", error.message);
      throw error;
    }

    console.log(`✅ Nombre actualizado en Supabase: ${name} (${phone})`);
    return data;
  },

  async saveChatMessage(user_id, message, direction = "incoming", raw = {}) {
    const { data, error } = await supabase
      .from("chat_history")
      .insert({
        user_id,
        message,
        direction,
        raw_payload: raw,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getChatHistory(user_id, limit = 10) {
    const { data, error } = await supabase
      .from("chat_history")
      .select("message, direction, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("❌ Error obteniendo historial:", error);
      return [];
    }

    return data || [];
  },

  // Products (sin cambios)
  async getProducts() {
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        producto_sabores!inner(
          sabores!inner(
            id,
            nombre
          )
        )
      `
      )
      .order("nombre_product");

    if (error) {
      console.error("❌ Error obteniendo productos:", error);
      throw error;
    }

    // Transformar datos para incluir sabores como string
    const products = (data || []).map((product) => {
      const saboresArray =
        product.producto_sabores?.map((ps) => ps.sabores.nombre) || [];
      return {
        ...product,
        sabores: saboresArray.join("-"), // Mantener formato original para compatibilidad
        sabores_array: saboresArray, // Array para uso más flexible
      };
    });

    return products;
  },

  async getProductWithSabores(productId) {
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        producto_sabores!inner(
          sabores!inner(
            id,
            nombre
          )
        )
      `
      )
      .eq("id", productId)
      .single();

    if (error) throw error;

    // Transformar sabores
    const saboresArray =
      data.producto_sabores?.map((ps) => ps.sabores.nombre) || [];
    return {
      ...data,
      sabores: saboresArray.join("-"),
      sabores_array: saboresArray,
    };
  },

  async findProductBySKUOrName(term) {
    const { data } = await supabase
      .from("products")
      .select(
        `
        *,
        producto_sabores!inner(
          sabores!inner(
            id,
            nombre
          )
        )
      `
      )
      .ilike("nombre_product", `%${term}%`)
      .limit(5);

    // Transformar datos
    const products = (data || []).map((product) => {
      const saboresArray =
        product.producto_sabores?.map((ps) => ps.sabores.nombre) || [];
      return {
        ...product,
        sabores: saboresArray.join("-"),
        sabores_array: saboresArray,
      };
    });

    return products;
  },

  // Sabores (sin cambios)
  async getSabores() {
    const { data, error } = await supabase
      .from("sabores")
      .select("*")
      .order("nombre");

    if (error) throw error;
    return data || [];
  },

  async getProductSabores(productId) {
    const { data, error } = await supabase
      .from("producto_sabores")
      .select(
        `
        sabores!inner(
          id,
          nombre
        )
      `
      )
      .eq("product_id", productId);

    if (error) throw error;
    return data?.map((ps) => ps.sabores) || [];
  },

  // Sales (sin cambios)
  async createSale(user_id) {
    const { data, error } = await supabase
      .from("sales")
      .insert({ user_id, status: "cart" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // FUNCIÓN CORREGIDA - SOLO UNA VERSIÓN
  async addSaleItemNew(
    sale_id,
    product_id,
    quantity,
    price_cents,
    sabor_id = null
  ) {
    try {
      console.log(
        `🔄 Agregando item: product_id=${product_id}, sabor_id=${sabor_id}, quantity=${quantity}, price=${price_cents}`
      );

      // DETECCIÓN EXACTA: Buscar item con EXACTAMENTE el mismo product_id Y sabor_id
      const existingQuery = supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", sale_id)
        .eq("product_id", product_id);

      // CRÍTICO: Manejar sabor_id null vs valor específico
      if (sabor_id !== null) {
        existingQuery.eq("sabor_id", sabor_id);
      } else {
        existingQuery.is("sabor_id", null);
      }

      const { data: existingItem } = await existingQuery.maybeSingle();

      if (existingItem) {
        // Si existe EXACTAMENTE el mismo producto+sabor, SUMAR la cantidad
        const newQuantity = existingItem.quantity + quantity;
        const newPriceCents = existingItem.price_cents + price_cents;

        console.log(
          `📦 Item exacto encontrado. Cantidad: ${existingItem.quantity} → ${newQuantity}, Precio: ${existingItem.price_cents} → ${newPriceCents}`
        );

        const { data, error } = await supabase
          .from("sale_items")
          .update({
            quantity: newQuantity,
            price_cents: newPriceCents,
          })
          .eq("id", existingItem.id)
          .select()
          .single();

        if (error) throw error;
        console.log(
          `✅ Item actualizado: ${newQuantity} unidades, $${(
            newPriceCents / 100
          ).toFixed(2)}`
        );
        return data;
      } else {
        // Si no existe, crear nuevo item
        console.log(`🆕 Creando nuevo item en carrito`);

        const { data, error } = await supabase
          .from("sale_items")
          .insert({ sale_id, product_id, sabor_id, quantity, price_cents })
          .select()
          .single();

        if (error) throw error;
        console.log(
          `✅ Nuevo item creado: ${quantity} unidades, $${(
            price_cents / 100
          ).toFixed(2)}`
        );
        return data;
      }
    } catch (error) {
      console.error(`❌ Error en addSaleItemNew:`, error);
      throw error;
    }
  },

  // Función para forzar agregado (sin combinar)
  async addSaleItemForce(
    sale_id,
    product_id,
    quantity,
    price_cents,
    sabor_id = null
  ) {
    try {
      console.log(
        `🚀 Forzando adición de item: product_id=${product_id}, sabor_id=${sabor_id}, quantity=${quantity}`
      );

      const { data, error } = await supabase
        .from("sale_items")
        .insert({ sale_id, product_id, sabor_id, quantity, price_cents })
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ Item forzado agregado: ${quantity} unidades`);
      return data;
    } catch (error) {
      console.error(`❌ Error en addSaleItemForce:`, error);
      throw error;
    }
  },

  async updateSaleTotal(sale_id, total_cents) {
    const { data, error } = await supabase
      .from("sales")
      .update({ total_cents })
      .eq("id", sale_id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateSaleStatus(sale_id, status) {
    const { data, error } = await supabase
      .from("sales")
      .update({ status })
      .eq("id", sale_id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getOpenCartForUser(user_id) {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .eq("user_id", user_id)
      .eq("status", "cart")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Sale Items con información de sabores
  async getSaleItems(sale_id) {
    const { data, error } = await supabase
      .from("sale_items")
      .select(
        `
        *,
        products!inner(nombre_product),
        sabores(id, nombre)
      `
      )
      .eq("sale_id", sale_id);

    if (error) throw error;

    return (
      data?.map((item) => ({
        ...item,
        product_name: item.products?.nombre_product || "Producto desconocido",
        sabor_nombre: item.sabores?.nombre || null,
        sabor_id: item.sabores?.id || null,
      })) || []
    );
  },

  async getUserSales(user_id, limit = 10) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        `
        *,
        sale_items(
          *,
          products(nombre_product),
          sabores(nombre)
        )
      `
      )
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async clearCartItems(sale_id) {
    try {
      console.log(`🗑️ Limpiando items del carrito ${sale_id}`);

      const { error } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", sale_id);

      if (error) throw error;

      // Resetear total a 0
      await this.updateSaleTotal(sale_id, 0);
      console.log(`✅ Carrito ${sale_id} limpiado`);
    } catch (error) {
      console.error(`❌ Error limpiando carrito:`, error);
      throw error;
    }
  },

  async recalculateCartTotal(sale_id) {
    const items = await this.getSaleItems(sale_id);

    // CORREGIDO: price_cents ya es el total del item
    const totalCents = items.reduce((sum, item) => {
      return sum + item.price_cents;
    }, 0);

    console.log(`🧮 Recalculando total del carrito ${sale_id}:`);
    console.log(`   Items: ${items.length}`);
    items.forEach((item) => {
      console.log(
        `   - ${item.product_name}${
          item.sabor_nombre ? ` (${item.sabor_nombre})` : ""
        } x${item.quantity}: ${item.price_cents} centavos`
      );
    });
    console.log(
      `   Total calculado: ${totalCents} centavos ($${(
        totalCents / 100
      ).toFixed(2)})`
    );

    return await this.updateSaleTotal(sale_id, totalCents);
  },

  // Buscar sabor por nombre
  async findSaborByName(saborName) {
    const { data, error } = await supabase
      .from("sabores")
      .select("*")
      .ilike("nombre", `%${saborName}%`)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getUsersWithReminders() {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .not("metadata", "is", null);

    if (error) {
      console.error("❌ Error obteniendo usuarios con recordatorios:", error);
      throw error;
    }

    // Filtrar solo usuarios con nextDate y frequency
    return (data || []).filter(
      (user) => user.metadata?.nextDate && user.metadata?.frequency
    );
  },

  async getUserById(userId) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data;
  },

  async updateUserMetadata(userId, metadata) {
    const { data, error } = await supabase
      .from("users")
      .update({ metadata })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error(
        `❌ Error actualizando metadata del usuario ${userId}:`,
        error
      );
      throw error;
    }

    return data;
  },

  async getSaleById(saleId) {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .eq("id", saleId)
      .single();

    if (error) throw error;
    return data;
  },

  async updateSaleTicketUrl(saleId, ticketPath) {
    const { data, error } = await supabase
      .from("sales")
      .update({ ticket_url: ticketPath })
      .eq("id", saleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async removeSaleItem(saleId, productId, saborId = null) {
    const query = supabase
      .from("sale_items")
      .delete()
      .eq("sale_id", saleId)
      .eq("product_id", productId);

    if (saborId !== null) {
      query.eq("sabor_id", saborId);
    }

    const { error } = await query;

    if (error) throw error;

    console.log(`🗑️ Item removido del carrito ${saleId}`);
  },

  async clearChatHistory(userId) {
    const { error } = await supabase
      .from("chat_history")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error(`❌ Error limpiando chat del usuario ${userId}:`, error);
      throw error;
    }

    console.log(`✅ Historial eliminado para usuario ${userId}`);
  },

  async setUserBlocked(userId, blocked) {
    const user = await this.getUserById(userId);

    if (!user) {
      throw new Error(`Usuario ${userId} no encontrado`);
    }

    const updatedMetadata = {
      ...(user.metadata || {}),
      blocked: blocked,
      blockedAt: blocked ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from("users")
      .update({ metadata: updatedMetadata })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error bloqueando usuario ${userId}:`, error);
      throw error;
    }

    console.log(
      `✅ Usuario ${userId} ${blocked ? "bloqueado" : "desbloqueado"}`
    );
    return data;
  },

  async isUserBlocked(userId) {
    const user = await this.getUserById(userId);
    return user?.metadata?.blocked === true;
  },
};
