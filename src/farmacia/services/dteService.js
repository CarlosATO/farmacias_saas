/**
 * dteService.js
 * Internal DTE rendering and output service.
 *
 * Responsibilities:
 *   - printInternalDte(dteDoc, saleItems)  → window.print() (ready for ESC/POS adapter)
 *   - downloadDtePdf(dteDoc, saleItems)    → browser-based HTML→PDF via print dialog
 *   - buildDteHtml(dteDoc, saleItems)      → returns a full HTML string (re-usable)
 *
 * NOT responsible for:
 *   - SII communication
 *   - CAF / digital signature
 *   - XML generation
 *   - External APIs
 */

const formatCLP = (v) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(v || 0));

const formatDate = (v) => {
  if (!v) return '-';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v));
};

/**
 * Builds a printable/saveable HTML document for the internal DTE.
 */
export function buildDteHtml(dteDoc, saleItems = []) {
  const folio = dteDoc?.folio ?? 'S/N';
  const dteType = dteDoc?.dte_type ?? 'BOLETA';
  const issuedAt = formatDate(dteDoc?.issued_at);
  const patientName = dteDoc?.patient?.full_name ?? 'CLIENTE GENERAL';
  const patientRut = dteDoc?.patient?.rut ?? '-';
  const saleDocNumber = dteDoc?.sale?.document_number ?? '-';
  const subtotal = formatCLP(dteDoc?.subtotal);
  const taxAmount = formatCLP(dteDoc?.tax_amount);
  const totalAmount = formatCLP(dteDoc?.total_amount);

  const rows = saleItems.map((item) => `
    <tr>
      <td style="padding:8px 12px;font-size:12px;text-transform:uppercase;font-weight:600;">${item.product?.name ?? 'PRODUCTO'}</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px;">${item.quantity}</td>
      <td style="padding:8px 12px;text-align:right;font-size:12px;">${formatCLP(item.unit_price)}</td>
      <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:700;">${formatCLP(item.subtotal)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>DTE Interno — Folio ${folio}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;color:#1f2937;padding:32px;max-width:680px;margin:auto;}
    .badge-warning{background:#fef2f2;border:2px solid #ef4444;color:#b91c1c;padding:8px 16px;text-align:center;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;margin-bottom:24px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4C3073;padding-bottom:16px;margin-bottom:20px;}
    .brand{font-size:28px;font-weight:900;color:#4C3073;letter-spacing:-.03em;text-transform:uppercase;}
    .brand-sub{font-size:10px;color:#9ca3af;letter-spacing:.25em;text-transform:uppercase;margin-top:2px;}
    .folio-box{border:3px solid #dc2626;padding:12px 18px;text-align:right;}
    .folio-type{color:#dc2626;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;}
    .folio-num{color:#dc2626;font-size:26px;font-weight:900;letter-spacing:-.02em;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;}
    .info-block label{font-size:9px;font-weight:900;color:#9ca3af;text-transform:uppercase;letter-spacing:.2em;}
    .info-block p{font-size:13px;font-weight:700;color:#111827;margin-top:2px;}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    thead tr{background:#f9fafb;border-bottom:2px solid #e5e7eb;}
    th{padding:8px 12px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.15em;color:#6b7280;text-align:left;}
    th:nth-child(2){text-align:center;} th:nth-child(3),th:nth-child(4){text-align:right;}
    tbody tr{border-bottom:1px solid #f3f4f6;}
    .totals{display:flex;justify-content:flex-end;}
    .totals-table{width:220px;}
    .totals-row{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;}
    .totals-row.total{border-top:2px solid #4C3073;padding-top:10px;margin-top:6px;}
    .totals-row.total span:first-child{font-weight:900;font-size:13px;color:#1f2937;}
    .totals-row.total span:last-child{font-weight:900;font-size:18px;color:#4C3073;}
    .footer{margin-top:28px;border-top:2px dashed #e5e7eb;padding-top:16px;text-align:center;}
    .timbre-placeholder{background:#f3f4f6;border:1px solid #e5e7eb;padding:20px;font-size:9px;color:#9ca3af;font-family:monospace;letter-spacing:.1em;text-transform:uppercase;}
    @media print{body{padding:0;max-width:none;} .badge-warning{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  </style>
</head>
<body>
  <div class="badge-warning">⚠ DOCUMENTO INTERNO — NO VÁLIDO TRIBUTARIAMENTE — MODO SIMULACIÓN</div>
  <div class="header">
    <div>
      <div class="brand">FarmaDATIX</div>
      <div class="brand-sub">Sistema de Gestión Farmacéutica</div>
      <div style="margin-top:16px;">
        <div class="info-block">
          <label>Cliente</label>
          <p>${patientName}</p>
        </div>
        <div class="info-block" style="margin-top:8px;">
          <label>RUT</label>
          <p>${patientRut}</p>
        </div>
      </div>
    </div>
    <div class="folio-box">
      <div class="folio-type">${dteType}</div>
      <div class="folio-num">N° ${folio}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:4px;">S.I.I. — Ambiente Simulación</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-block"><label>Fecha de Emisión</label><p>${issuedAt}</p></div>
    <div class="info-block"><label>Folio de Venta POS</label><p>${saleDocNumber}</p></div>
  </div>

  <table>
    <thead><tr><th>Producto</th><th>Cant.</th><th>P. Unitario</th><th>Subtotal</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;">Sin detalle de productos</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div class="totals-table">
      <div class="totals-row"><span>Neto</span><span>${subtotal}</span></div>
      <div class="totals-row"><span>IVA (19%)</span><span>${taxAmount}</span></div>
      <div class="totals-row total"><span>Total</span><span>${totalAmount}</span></div>
    </div>
  </div>

  <div class="footer">
    <p style="font-size:9px;color:#9ca3af;letter-spacing:.2em;text-transform:uppercase;margin-bottom:12px;">Timbre Electrónico S.I.I.</p>
    <div class="timbre-placeholder">[ CÓDIGO PDF417 — SIMULADO — AMBIENTE DE PRUEBAS ]</div>
    <p style="font-size:9px;color:#d1d5db;margin-top:12px;">Generado por FarmaDATIX SaaS v1.0 — Folio interno ${folio}</p>
  </div>
</body>
</html>`;
}

/**
 * Opens a print dialog showing the internal DTE document.
 * Designed to be replaced by an ESC/POS adapter in future iterations.
 *
 * @param {object} dteDoc  - DTE document record from dte_documents
 * @param {Array}  saleItems - sale_items rows with product relation
 */
export function printInternalDte(dteDoc, saleItems = []) {
  const html = buildDteHtml(dteDoc, saleItems);
  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) {
    // Fallback: inject into hidden iframe and print
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

/**
 * Triggers a browser "Save as PDF" flow for the internal DTE.
 * No external library required — uses the browser's print-to-PDF.
 *
 * @param {object} dteDoc
 * @param {Array}  saleItems
 */
export function downloadDtePdf(dteDoc, saleItems = []) {
  const folio = dteDoc?.folio ?? 'SN';
  const html = buildDteHtml(dteDoc, saleItems);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  iframe.src = url;
  iframe.onload = () => {
    // Prompt print-to-PDF with suggested filename
    try {
      iframe.contentWindow.document.title = `DTE_INTERNO_FOLIO_${folio}`;
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 3000);
    }
  };
}
