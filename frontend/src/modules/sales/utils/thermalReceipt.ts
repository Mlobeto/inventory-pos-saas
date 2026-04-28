import type { Sale } from '../api/salesApi';
import logoUrl from '@/assets/dalevir.png';

const STORE_NAME = 'Dale Vir!';
const STORE_SUBTITLE = 'Tienda de regalos';
const STORE_CUIT = '27-28570590-3';

interface ReceiptOptions {
  sale: Sale;
  cashierName: string;
  discountAmount?: number;
}

function fmtAR(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

export function printThermalReceipt({ sale, cashierName, discountAmount = 0 }: ReceiptOptions) {
  const date = new Date(sale.createdAt);
  const dateStr = date.toLocaleDateString('es-AR');
  const timeStr = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const itemsHtml = (sale.details ?? [])
    .map(
      (item) => `
      <tr>
        <td class="td-name">${item.product.name}<br/><span class="code">${item.product.internalCode}</span></td>
        <td class="td-qty">${item.quantity}</td>
        <td class="td-price">${fmtAR(parseFloat(item.subtotal))}</td>
      </tr>`,
    )
    .join('');

  const paymentsHtml = sale.payments
    .map(
      (p) => `
      <tr>
        <td class="td-name">${p.paymentMethod.name}</td>
        <td class="td-price">${fmtAR(parseFloat(p.amount))}</td>
      </tr>`,
    )
    .join('');

  const subtotal = parseFloat(sale.subtotal);
  const total = parseFloat(sale.totalAmount);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Recibo ${sale.saleNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 0; size: 58mm auto; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 8.5px;
      width: 56mm;
      padding: 2mm 1mm;
      color: #000;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .sep-solid { border-top: 1px solid #000; margin: 2mm 0; }
    .sep-dash  { border-top: 1px dashed #000; margin: 2mm 0; }
    .store-logo { display: block; width: 22mm; height: 22mm; object-fit: contain; margin: 0 auto 1.5mm; }
    .store-name { font-size: 10.5px; font-weight: bold; text-align: center; line-height: 1.3; }
    .store-subtitle { font-size: 8.5px; text-align: center; margin-top: 0.5mm; }
    .sale-num { font-size: 9.5px; font-weight: bold; text-align: center; margin: 1mm 0 0.5mm; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 0.8mm 0; vertical-align: top; }
    .td-name { width: 62%; }
    .td-qty  { width: 10%; text-align: center; }
    .td-price { width: 28%; text-align: right; }
    .th-row td { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 1mm; }
    .code { font-size: 7px; color: #555; }
    .total-row td { font-size: 10px; font-weight: bold; padding-top: 1.5mm; }
    .grand-total td { font-size: 12px; font-weight: bold; padding-top: 1mm; border-top: 1px solid #000; }
    .footer { text-align: center; margin-top: 3mm; font-size: 8px; }
  </style>
</head>
<body>
  <img src="${logoUrl}" alt="Dale Vir!" class="store-logo" />
  <div class="store-name">${STORE_NAME}</div>
  <div class="store-subtitle">${STORE_SUBTITLE}</div>
  <div class="center">CUIT: ${STORE_CUIT}</div>
  <div class="sep-solid"></div>

  <div class="sale-num">RECIBO Nro ${sale.saleNumber}</div>
  <div class="center">${dateStr}  ${timeStr}</div>
  <div class="center">Cajero: ${cashierName}</div>
  <div class="sep-solid"></div>

  <table>
    <thead>
      <tr class="th-row">
        <td class="td-name">Descripción</td>
        <td class="td-qty">Ct</td>
        <td class="td-price">Importe</td>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="sep-dash"></div>

  <table>
    ${discountAmount > 0 ? `<tr><td class="td-name">Subtotal</td><td class="td-price">${fmtAR(subtotal)}</td></tr>` : ''}
    ${discountAmount > 0 ? `<tr><td class="td-name">Descuento</td><td class="td-price">-${fmtAR(discountAmount)}</td></tr>` : ''}
    <tr class="grand-total">
      <td class="td-name">TOTAL</td>
      <td class="td-price">${fmtAR(total)}</td>
    </tr>
  </table>

  <div class="sep-solid"></div>

  <div class="bold" style="margin-bottom:1mm">Forma de pago:</div>
  <table>
    <tbody>${paymentsHtml}</tbody>
  </table>

  <div class="sep-dash"></div>
  <div class="footer">¡Muchas gracias por su compra!</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=240,height=700,toolbar=0,menubar=0');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Habilitá los pop-ups para imprimir.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Dar tiempo al navegador para renderizar antes de imprimir
  setTimeout(() => {
    win.print();
    win.close();
  }, 400);
}
