// ==================== src/utils/block.utils.js ====================
import supabaseService from "../services/supabase.js";

/**
 * Verifica si un usuario está bloqueado y detiene el flow si lo está
 * @returns {boolean} true si está bloqueado (debe detener flow)
 */
export async function checkIfBlocked(ctx, endFlow) {
  try {
    const user = await supabaseService.findOrCreateUser(ctx.from);
    const isBlocked = await supabaseService.isUserBlocked(user.id);

    if (isBlocked) {
      console.log(
        `🚫 Usuario ${user.id} (${ctx.from}) bloqueado - flow detenido`
      );
      endFlow();
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Error verificando bloqueo:", error);
    return false;
  }
}

export default { checkIfBlocked };
