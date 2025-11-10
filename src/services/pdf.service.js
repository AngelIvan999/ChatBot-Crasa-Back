// ==================== src/services/pdf.service.js ====================
import PDFDocument from "pdfkit";
import supabaseService from "./supabase.js";
import { DateTime } from "luxon";

/**
 * Genera un ticket PDF para una venta
 * @param {Object} sale - Objeto de venta desde Supabase
 * @param {Array} saleItems - Items de la venta
 * @param {Object} user - Usuario que realizó la compra
 * @returns {Promise<Buffer>} Buffer del PDF generado
 */
export async function generateTicketPDF(sale, saleItems, user) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [226.77, 341.89], margin: 10 }); // Ancho de ticket térmico (80mm)
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // --- ENCABEZADO ---
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("Crasa.com", { align: "center" });
      /*doc
        .fontSize(8)
        .font("Helvetica")
        .text("C.I.F.: 01234567A", { align: "center" });*/
      //doc.text("C/ Arturo Soria, 1", { align: "center" });
      doc.text("C.P.: 62574 Progreso (Jiutepec, Mor)", { align: "center" });
      doc.text("777 271 4236", { align: "center" });
      doc.text("admin@crasa.com", { align: "center" });
      doc.moveDown(0.5);

      // --- LÍNEA SEPARADORA ---
      doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
      doc.moveDown(0.5);

      // --- INFO DE FACTURA ---
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .text(`Factura Simpl.: F2019-000001`);
      const fecha = DateTime.fromISO(sale.created_at)
        .setZone("America/Mexico_City")
        .toFormat("dd/MM/yyyy");
      doc.font("Helvetica").text(`Fecha: ${fecha}`);
      /*doc.text(`Método de pago: Tarjeta`, { continued: false });*/
      doc.moveDown(0.5);

      // --- LÍNEA SEPARADORA ---
      doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
      doc.moveDown(0.5);

      // --- TABLA DE ARTÍCULOS (ENCABEZADO) ---
      const tableTop = doc.y;
      doc.fontSize(8).font("Helvetica-Bold");
      doc.text("Artículo", 10, tableTop, { width: 100, continued: false });
      doc.text("Ud", 110, tableTop, {
        width: 25,
        align: "center",
        continued: false,
      });
      doc.text("Precio", 135, tableTop, {
        width: 40,
        align: "right",
        continued: false,
      });
      doc.text("Total", 175, tableTop, {
        width: 41,
        align: "right",
        continued: false,
      });
      doc.moveDown(0.3);

      // --- ITEMS ---
      let currentY = doc.y;
      saleItems.forEach((item) => {
        const saborText = item.sabor_nombre ? ` (${item.sabor_nombre})` : "";
        const itemTotal = (item.price_cents / 100).toFixed(2);
        const precioUnitario = (item.price_cents / 100 / item.quantity).toFixed(
          2
        );

        doc.fontSize(7).font("Helvetica");
        doc.text(`${item.product_name}${saborText}`, 10, currentY, {
          width: 100,
        });
        doc.text(`${item.quantity}`, 110, currentY, {
          width: 25,
          align: "center",
        });
        doc.text(`${precioUnitario}`, 135, currentY, {
          width: 40,
          align: "right",
        });
        doc.text(`${itemTotal}`, 175, currentY, { width: 41, align: "right" });

        currentY = doc.y + 3;
      });

      doc.moveDown(0.5);

      // --- LÍNEA SEPARADORA ---
      doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
      doc.moveDown(0.3);

      // --- TOTALES ---
      const totalSinIVA = sale.total_cents / 100;
      const iva = totalSinIVA * 0.21;
      const total = totalSinIVA;

      doc.fontSize(8).font("Helvetica");
      doc.text(`TOTAL SIN I.V.A.`, 10, doc.y, { continued: true });
      doc.text(`${totalSinIVA.toFixed(2)}`, { align: "right" });

      doc.text(`I.V.A. 21%`, 10, doc.y, { continued: true });
      doc.text(`${iva.toFixed(2)}`, { align: "right" });

      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text(`TOTAL`, 10, doc.y, { continued: true });
      doc.text(`${total.toFixed(2)}`, { align: "right" });

      doc.moveDown(0.5);

      // --- LÍNEA SEPARADORA ---
      doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
      doc.moveDown(0.5);

      // --- PIE DE PÁGINA ---
      doc
        .fontSize(7)
        .font("Helvetica")
        .text("EL PERIODO DE DEVOLUCIONES", { align: "center" });
      doc.text("CADUCA EL DÍA: 01/11/2019", { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Guarda el PDF en Supabase Storage
 * @param {Buffer} pdfBuffer - Buffer del PDF
 * @param {string} fileName - Nombre del archivo
 * @returns {Promise<Object>} Resultado con URL pública
 */
export async function uploadTicketToStorage(pdfBuffer, fileName) {
  try {
    console.log(`📤 Subiendo ticket: ${fileName}`);

    const { data, error } = await supabaseService.supabase.storage
      .from("tickets")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (error) throw error;

    console.log(`✅ Ticket subido: ${data.path}`);

    // Obtener URL firmada (válida por 1 año)
    const { data: urlData } = await supabaseService.supabase.storage
      .from("tickets")
      .createSignedUrl(data.path, 31536000); // 1 año en segundos

    return {
      success: true,
      path: data.path,
      signedUrl: urlData.signedUrl,
    };
  } catch (error) {
    console.error(`❌ Error subiendo ticket:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Genera y guarda ticket completo
 * @param {string} saleId - ID de la venta
 * @returns {Promise<Object>} Resultado con URL del ticket
 */
export async function createAndSaveTicket(saleId) {
  try {
    console.log(`🎫 Generando ticket para venta ${saleId}`);

    // Obtener datos de la venta
    const sale = await supabaseService.getSaleById(saleId);
    if (!sale) throw new Error("Venta no encontrada");

    const saleItems = await supabaseService.getSaleItems(saleId);
    const user = await supabaseService.getUserById(sale.user_id);

    // Generar PDF
    const pdfBuffer = await generateTicketPDF(sale, saleItems, user);

    // Nombre del archivo: ticket_SALEID_TIMESTAMP.pdf
    const timestamp = DateTime.now()
      .setZone("America/Mexico_City")
      .toFormat("yyyyMMdd_HHmmss");
    const fileName = `ticket_${saleId}_${timestamp}.pdf`;

    // Subir a Storage
    const uploadResult = await uploadTicketToStorage(pdfBuffer, fileName);

    if (!uploadResult.success) {
      throw new Error(uploadResult.error);
    }

    // Guardar referencia en la BD (opcional pero recomendado)
    await supabaseService.updateSaleTicketUrl(saleId, uploadResult.path);

    console.log(`✅ Ticket creado exitosamente: ${fileName}`);

    return {
      success: true,
      fileName,
      path: uploadResult.path,
      url: uploadResult.signedUrl,
    };
  } catch (error) {
    console.error(`❌ Error creando ticket:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  generateTicketPDF,
  uploadTicketToStorage,
  createAndSaveTicket,
};
