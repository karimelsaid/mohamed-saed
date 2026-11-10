const { dbConnection } = require('../database/connection');
const { logger } = require('../logging/logger');

class PrintingService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  /**
   * استرجاع بيانات المحل الأساسية من الإعدادات
   */
  getStoreSettings() {
    try {
      const rows = this.dbConn.all("SELECT key, value FROM settings WHERE key LIKE 'store_%'");
      const s = {
        name: 'محل mohamed saed ',
        address: 'شارع عباس العقاد، مدينة نصر، القاهرة',
        phone: '01012345678',
        taxNumber: '345-678-901',
        commercialRegister: '128456',
        returnPolicy: 'البضاعة المباعة تستبدل وترد خلال 14 يوماً بحالتها الأصلية مصحوبة بالإيصال.'
      };

      for (const r of rows) {
        if (r.key === 'store_name') s.name = r.value;
        if (r.key === 'store_address') s.address = r.value;
        if (r.key === 'store_phone') s.phone = r.value;
        if (r.key === 'store_tax_number') s.taxNumber = r.value;
        if (r.key === 'store_return_policy') s.returnPolicy = r.value;
      }
      return s;
    } catch (_) {
      return {
        name: 'محل mohamed saed ',
        address: 'شارع عباس العقاد، مدينة نصر، القاهرة',
        phone: '01012345678',
        taxNumber: '345-678-901',
        commercialRegister: '128456',
        returnPolicy: 'البضاعة المباعة تستبدل وترد خلال 14 يوماً بحالتها الأصلية مصحوبة بالإيصال.'
      };
    }
  }

  /**
   * استرجاع الطابعات المتاحة بالنظام
   */
  async getPrinters() {
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
        const { BrowserWindow } = require('electron');
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        if (win && win.webContents && win.webContents.getPrintersAsync) {
          const printers = await win.webContents.getPrintersAsync();
          return printers;
        }
      }
    } catch (err) {
      logger.warn('Could not query Electron native printers, returning standard printers:', err.message);
    }

    return [
      { name: 'الطابعة الافتراضية للنظام (Default)', isDefault: true, status: 0 },
      { name: 'طابعة الإيصالات الحرارية (Thermal POS 80mm)', isDefault: false, status: 0 },
      { name: 'Microsoft Print to PDF', isDefault: false, status: 0 }
    ];
  }

  /**
   * 1. قالب الإيصال الحراري السريع 80mm (Thermal POS Receipt)
   */
  generateThermalReceipt80mm(data = {}) {
    const store = this.getStoreSettings();
    const receiptNumber = data.receiptNumber || data.invoiceNumber || `REC-${Date.now().toString().slice(-6)}`;
    const dateStr = data.date || new Date().toLocaleString('ar-EG');
    const cashier = data.cashierName || 'الكاشير الرئيسي';
    const customer = data.customerName ? `${data.customerName} (${data.customerPhone || ''})` : 'عميل نقدي';
    const items = data.items || [];
    const subtotal = Number(data.subtotal || data.totalAmount || 0);
    const discount = Number(data.discount || 0);
    const total = Number(data.totalAmount || (subtotal - discount));
    const paid = Number(data.paidAmount || total);
    const change = Math.max(0, paid - total);
    const paymentMethod = data.paymentMethod === 'CASH' ? 'نقدي (كاش)' : (data.paymentMethod === 'VISA' ? 'فيزا / بطاقة' : 'محفظة إلكترونية');

    const itemRows = items.map((it, idx) => `
      <tr>
        <td style="padding: 4px 0; text-align: right;">${it.name || it.product_name || `صنف #${idx + 1}`}</td>
        <td style="padding: 4px 0; text-align: center;">${it.quantity || 1}</td>
        <td style="padding: 4px 0; text-align: left; font-family: monospace;">${Number(it.unit_price || it.price || 0).toFixed(2)}</td>
        <td style="padding: 4px 0; text-align: left; font-family: monospace; font-weight: bold;">${Number(it.total || ((it.quantity || 1) * (it.unit_price || it.price || 0))).toFixed(2)}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" style="text-align: center; padding: 10px;">لا توجد أصناف</td></tr>`;

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>إيصال استلام - ${receiptNumber}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      width: 72mm;
      margin: 0 auto;
      padding: 10px 4px;
      direction: rtl;
      font-size: 12px;
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .bold { font-weight: bold; }
    .mono { font-family: 'Courier New', Courier, monospace; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .double-divider { border-top: 2px solid #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    .totals-table td { padding: 3px 0; }
    .barcode-box {
      margin: 10px 0 5px;
      text-align: center;
      letter-spacing: 4px;
      font-family: monospace;
      font-size: 14px;
      font-weight: bold;
    }
    @media print {
      body { width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="text-center">
    <h2 style="margin: 0; font-size: 16px;">${store.name}</h2>
    <div style="font-size: 10px; margin-top: 3px;">${store.address}</div>
    <div style="font-size: 10px;">هاتف: ${store.phone} | ضريبي: ${store.taxNumber}</div>
  </div>

  <div class="divider"></div>

  <div style="font-size: 11px;">
    <div><strong>رقم الإيصال:</strong> <span class="mono bold">${receiptNumber}</span></div>
    <div><strong>التاريخ:</strong> ${dateStr}</div>
    <div><strong>الكاشير:</strong> ${cashier}</div>
    <div><strong>العميل:</strong> ${customer}</div>
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr style="border-bottom: 1px solid #000; font-size: 11px;">
        <th style="text-align: right; padding-bottom: 4px;">الصنف</th>
        <th style="text-align: center; padding-bottom: 4px;">العدد</th>
        <th style="text-align: left; padding-bottom: 4px;">السعر</th>
        <th style="text-align: left; padding-bottom: 4px;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="divider"></div>

  <table class="totals-table">
    <tr>
      <td>المجموع الفرعي:</td>
      <td class="text-left mono">${subtotal.toFixed(2)} ج.م</td>
    </tr>
    ${discount > 0 ? `
    <tr>
      <td>الخصم الممنوح:</td>
      <td class="text-left mono" style="color: #000;">- ${discount.toFixed(2)} ج.م</td>
    </tr>` : ''}
    <tr class="bold" style="font-size: 14px;">
      <td>الصافي النهائي:</td>
      <td class="text-left mono">${total.toFixed(2)} ج.م</td>
    </tr>
    <tr>
      <td>طريقة الدفع:</td>
      <td class="text-left">${paymentMethod}</td>
    </tr>
    <tr>
      <td>المبلغ المدفوع:</td>
      <td class="text-left mono">${paid.toFixed(2)} ج.م</td>
    </tr>
    ${change > 0 ? `
    <tr>
      <td>المبلغ المتبقي (فكة):</td>
      <td class="text-left mono bold">${change.toFixed(2)} ج.م</td>
    </tr>` : ''}
  </table>

  <div class="double-divider"></div>

  <div class="barcode-box">
    *${receiptNumber}*
  </div>

  <div class="text-center" style="font-size: 10px; margin-top: 8px;">
    <div>${store.returnPolicy}</div>
    <div style="margin-top: 6px; font-weight: bold;">شكراً لزيارتكم ونسعد بخدمتكم دائماً! 👔</div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * 2. قالب الفاتورة الضريبية / الرسمية A4 (Official A4 Tax Invoice)
   */
  generateInvoiceA4(data = {}) {
    const store = this.getStoreSettings();
    const invoiceNumber = data.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;
    const invoiceDate = data.invoiceDate || data.date || new Date().toISOString().slice(0, 10);
    const customer = {
      name: data.customerName || 'عميل نقدي',
      phone: data.customerPhone || '01000000000',
      address: data.customerAddress || 'القاهرة، مصر',
      nationalId: data.customerNationalId || 'غير مسجل'
    };
    const items = data.items || [];
    const subtotal = Number(data.subtotal || data.totalAmount || 0);
    const discount = Number(data.discount || 0);
    const tax = Number(data.tax || 0);
    const total = Number(data.totalAmount || (subtotal - discount + tax));
    const paid = Number(data.paidAmount || total);
    const remaining = Math.max(0, total - paid);
    const paymentStatus = remaining <= 0 ? 'مسددة بالكامل (PAID)' : 'مسددة جزئياً (PARTIAL)';

    const itemRows = items.map((it, idx) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px; font-family: monospace; font-size: 11px;">${it.code || it.sku || `ITEM-${idx + 1}`}</td>
        <td style="padding: 10px; font-weight: 600;">${it.name || it.product_name}</td>
        <td style="padding: 10px; text-align: center;">${it.quantity || 1}</td>
        <td style="padding: 10px; text-align: left; font-family: monospace;">${Number(it.unit_price || it.price || 0).toFixed(2)} ج.م</td>
        <td style="padding: 10px; text-align: left; font-family: monospace;">${Number(it.discount || 0).toFixed(2)} ج.م</td>
        <td style="padding: 10px; text-align: left; font-family: monospace; font-weight: bold;">${Number(it.total || ((it.quantity || 1) * (it.unit_price || it.price || 0))).toFixed(2)} ج.م</td>
      </tr>
    `).join('') || `<tr><td colspan="7" style="text-align: center; padding: 20px;">لا توجد أصناف مدرجة بالفاتورة</td></tr>`;

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة ضريبية - ${invoiceNumber}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      font-size: 13px;
      color: #1f2937;
      background: #fff;
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .header-table {
      width: 100%;
      border-bottom: 3px double #d4af37;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .info-grid {
      display: table;
      width: 100%;
      margin-bottom: 25px;
    }
    .info-col {
      display: table-cell;
      width: 50%;
      vertical-align: top;
      background: #f9fafb;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    .items-table th {
      background: #111827;
      color: #fff;
      padding: 10px;
      font-size: 12px;
    }
    .totals-box {
      width: 320px;
      float: left;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 15px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      font-size: 13px;
    }
    .signatures {
      clear: both;
      margin-top: 80px;
      display: table;
      width: 100%;
    }
    .sig-col {
      display: table-cell;
      width: 50%;
      text-align: center;
    }
    .sig-line {
      width: 200px;
      margin: 40px auto 5px;
      border-top: 1px solid #000;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-paid { background: #d1fae5; color: #065f46; }
    .badge-partial { background: #fef3c7; color: #92400e; }
  </style>
</head>
<body>
  <!-- Header -->
  <table class="header-table">
    <tr>
      <td style="text-align: right; width: 60%;">
        <h1 style="margin: 0; font-size: 22px; color: #111827;">${store.name}</h1>
        <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">${store.address}</div>
        <div style="font-size: 12px; color: #4b5563;">هاتف: ${store.phone} | البريد: support@royal-suits.com</div>
        <div style="font-size: 12px; color: #4b5563;">البطاقة الضريبية: ${store.taxNumber} | السجل التجاري: ${store.commercialRegister}</div>
      </td>
      <td style="text-align: left; width: 40%; vertical-align: top;">
        <h2 style="margin: 0; color: #d4af37; font-size: 18px;">فاتورة مبيعات رسمية</h2>
        <div style="margin-top: 5px;"><strong>رقم الفاتورة:</strong> <span style="font-family: monospace; font-weight: bold;">${invoiceNumber}</span></div>
        <div><strong>تاريخ الإصدار:</strong> ${invoiceDate}</div>
        <div><strong>حالة السداد:</strong> <span class="badge ${remaining <= 0 ? 'badge-paid' : 'badge-partial'}">${paymentStatus}</span></div>
      </td>
    </tr>
  </table>

  <!-- Customer & Billing Info -->
  <div class="info-grid">
    <div class="info-col" style="border-left: 10px solid #fff;">
      <h4 style="margin: 0 0 10px; color: #374151; font-size: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">بيانات العميل (Customer Details)</h4>
      <div><strong>الاسم:</strong> ${customer.name}</div>
      <div><strong>رقم الهاتف:</strong> <span dir="ltr">${customer.phone}</span></div>
      <div><strong>الرقم القومي:</strong> ${customer.nationalId}</div>
      <div><strong>العنوان:</strong> ${customer.address}</div>
    </div>
    <div class="info-col">
      <h4 style="margin: 0 0 10px; color: #374151; font-size: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">بيانات العملية والمخزن (Order Info)</h4>
      <div><strong>نوع الفاتورة:</strong> مبيعات نقطة البيع المباشرة (POS)</div>
      <div><strong>طريقة السداد:</strong> ${data.paymentMethod || 'نقدي (كاش)'}</div>
      <div><strong>المخزن المنصرف منه:</strong> المخزن الرئيسي (المحل)</div>
      <div><strong>الموظف المسئول:</strong> ${data.cashierName || 'إدارة المبيعات'}</div>
    </div>
  </div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 40px;">م</th>
        <th style="width: 110px;">كود الصنف</th>
        <th style="text-align: right;">البيان والصنف</th>
        <th style="width: 50px;">الكمية</th>
        <th style="width: 90px; text-align: left;">سعر الوحدة</th>
        <th style="width: 70px; text-align: left;">الخصم</th>
        <th style="width: 100px; text-align: left;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Totals Section -->
  <div>
    <div style="float: right; width: 50%; font-size: 12px; color: #6b7280; padding-top: 15px;">
      <strong>الشروط والأحكام:</strong>
      <ul style="padding-right: 18px; margin-top: 5px;">
        <li>البضاعة المباعة ترد أو تستبدل خلال 14 يوماً من تاريخ الفاتورة بالحالة الأصلية.</li>
        <li>لا يتم استبدال أو استرجاع الإكسسوارات الشخصية بعد فتح الغلاف.</li>
        <li>تعتبر هذه الفاتورة سند استلام للبضاعة المباعة بحالة جيدة.</li>
      </ul>
    </div>

    <div class="totals-box">
      <div class="totals-row">
        <span>المجموع الفرعي:</span>
        <span style="font-family: monospace;">${subtotal.toFixed(2)} ج.م</span>
      </div>
      ${discount > 0 ? `
      <div class="totals-row" style="color: #dc2626;">
        <span>إجمالي الخصم:</span>
        <span style="font-family: monospace;">- ${discount.toFixed(2)} ج.م</span>
      </div>` : ''}
      ${tax > 0 ? `
      <div class="totals-row">
        <span>ضريبة القيمة المضافة:</span>
        <span style="font-family: monospace;">+ ${tax.toFixed(2)} ج.م</span>
      </div>` : ''}
      <div class="totals-row" style="border-top: 2px solid #111827; margin-top: 6px; padding-top: 8px; font-weight: bold; font-size: 15px;">
        <span>الصافي الإجمالي:</span>
        <span style="font-family: monospace; color: #d4af37;">${total.toFixed(2)} ج.م</span>
      </div>
      <div class="totals-row" style="font-size: 12px;">
        <span>المبلغ المسدد:</span>
        <span style="font-family: monospace; font-weight: bold;">${paid.toFixed(2)} ج.م</span>
      </div>
      ${remaining > 0 ? `
      <div class="totals-row" style="font-size: 12px; color: #dc2626; font-weight: bold;">
        <span>المتبقي المطلوب:</span>
        <span style="font-family: monospace;">${remaining.toFixed(2)} ج.م</span>
      </div>` : ''}
    </div>
  </div>

  <!-- Signatures -->
  <div class="signatures">
    <div class="sig-col">
      <div>توقيع واستلام العميل</div>
      <div class="sig-line"></div>
    </div>
    <div class="sig-col">
      <div>ختم وتوقيع إدارة المبيعات</div>
      <div class="sig-line"></div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * 3. قالب عقد تأجير البدلة وإقرار استلام الأمانات A4 (Rental Contract & Escrow Guarantee)
   */
  generateRentalContractA4(data = {}) {
    const store = this.getStoreSettings();
    const contractNumber = data.contractNumber || data.bookingNumber || `CON-${Date.now().toString().slice(-6)}`;
    const contractDate = data.contractDate || new Date().toISOString().slice(0, 10);
    const customer = {
      name: data.customerName || 'عميل محترم',
      phone: data.customerPhone || '01000000000',
      altPhone: data.customerAltPhone || 'غير مدخل',
      nationalId: data.customerNationalId || 'غير مسجل',
      address: data.customerAddress || 'جمهورية مصر العربية'
    };
    const booking = {
      eventDate: data.eventDate || 'غير محدد',
      pickupDate: data.pickupDate || 'غير محدد',
      returnDueDate: data.returnDueDate || 'غير محدد',
      notes: data.notes || 'لا توجد ملاحظات خاصة'
    };

    const items = data.items || [];
    const totalRental = Number(data.totalRental || data.finalAmount || 0);
    const paidAdvance = Number(data.paidAdvance || data.paidAmount || 0);
    const remainingRental = Math.max(0, totalRental - paidAdvance);
    const depositAmount = Number(data.totalDeposit || data.depositAmount || 0);
    const depositPaid = Number(data.depositPaid || 0);
    const lateFeePerDay = Number(data.lateFeePerDay || 300);

    const suitRows = items.map((it, idx) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px; font-weight: bold;">${it.suit_name || it.model_name || it.name || 'بدلة زفاف كاملة'}</td>
        <td style="padding: 10px; font-family: monospace;">${it.unit_barcode || it.barcode || 'SUIT-001'}</td>
        <td style="padding: 10px; text-align: center;">${it.size_name || it.size || '50'}</td>
        <td style="padding: 10px; text-align: left; font-family: monospace;">${Number(it.rental_price || 0).toFixed(2)} ج.م</td>
        <td style="padding: 10px; text-align: left; font-family: monospace; font-weight: bold; color: #b45309;">${Number(it.deposit_amount || it.deposit_price || 0).toFixed(2)} ج.م</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align: center; padding: 15px;">لا توجد قطع مؤجرة محددة</td></tr>`;

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>عقد تأجير بدلة وإقرار أمانات - ${contractNumber}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      font-size: 12px;
      color: #1f2937;
      background: #fff;
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .header-box {
      border-bottom: 2px solid #d4af37;
      padding-bottom: 10px;
      margin-bottom: 15px;
      display: table;
      width: 100%;
    }
    .header-cell {
      display: table-cell;
      vertical-align: middle;
    }
    .title-banner {
      background: #111827;
      color: #d4af37;
      text-align: center;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 15px;
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .grid-2 {
      display: table;
      width: 100%;
      margin-bottom: 15px;
    }
    .grid-col {
      display: table-cell;
      width: 50%;
      vertical-align: top;
      background: #fdfdfd;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .data-table th {
      background: #f3f4f6;
      color: #111827;
      padding: 8px 10px;
      font-size: 11px;
      border-bottom: 2px solid #d1d5db;
    }
    .escrow-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-right: 4px solid #d97706;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 15px;
      font-size: 11.5px;
      color: #78350f;
    }
    .terms-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 11px;
    }
    .terms-box ol {
      margin: 5px 0 0;
      padding-right: 20px;
    }
    .terms-box li {
      margin-bottom: 4px;
    }
    .signatures-table {
      width: 100%;
      margin-top: 25px;
    }
    .sig-block {
      width: 50%;
      text-align: center;
      vertical-align: top;
    }
    .sig-line {
      width: 180px;
      border-top: 1px solid #000;
      margin: 35px auto 4px;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header-box">
    <div class="header-cell" style="width: 60%; text-align: right;">
      <h2 style="margin: 0; font-size: 18px; color: #111827;">${store.name}</h2>
      <div style="font-size: 11px; color: #4b5563;">${store.address} | هاتف: ${store.phone}</div>
    </div>
    <div class="header-cell" style="width: 40%; text-align: left;">
      <div style="font-size: 12px;"><strong>رقم العقد:</strong> <span style="font-family: monospace; font-weight: bold; color: #d4af37;">${contractNumber}</span></div>
      <div style="font-size: 11px; color: #4b5563;">تاريخ التحرير: ${contractDate}</div>
    </div>
  </div>

  <div class="title-banner">
    عقد واتفاقية استئجار بدلة رجالي وإقرار استلام أمانات (Rental Contract & Escrow Guarantee)
  </div>

  <!-- Parties & Dates Info -->
  <div class="grid-2">
    <div class="grid-col" style="border-left: 8px solid #fff;">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">الطرف الثاني (المستأجر)</h4>
      <div><strong>الاسم الكامل:</strong> ${customer.name}</div>
      <div><strong>الرقم القومي:</strong> <span style="font-family: monospace;">${customer.nationalId}</span></div>
      <div><strong>الهاتف الأساسي:</strong> <span dir="ltr">${customer.phone}</span></div>
      <div><strong>الهاتف البديل:</strong> <span dir="ltr">${customer.altPhone}</span></div>
      <div><strong>محل الإقامة:</strong> ${customer.address}</div>
    </div>
    <div class="grid-col">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">مواعيد الحجز والمناسبة</h4>
      <div><strong>تاريخ المناسبة (الزفاف):</strong> <span style="font-weight: bold;">${booking.eventDate}</span></div>
      <div><strong>تاريخ استلام البدلة:</strong> ${booking.pickupDate}</div>
      <div><strong>تاريخ الإرجاع المحدد:</strong> <span style="font-weight: bold; color: #dc2626;">${booking.returnDueDate}</span></div>
      <div><strong>ملاحظات التجهيز:</strong> ${booking.notes}</div>
    </div>
  </div>

  <!-- Rented Items Table -->
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 30px;">#</th>
        <th style="text-align: right;">موديل البدلة / الملحقات</th>
        <th style="width: 120px;">الباركود التسلسلي</th>
        <th style="width: 60px;">المقاس</th>
        <th style="width: 100px; text-align: left;">قيمة الإيجار</th>
        <th style="width: 110px; text-align: left;">مبلغ التأمين (الأمانة)</th>
      </tr>
    </thead>
    <tbody>
      ${suitRows}
    </tbody>
    <tfoot>
      <tr style="background: #f9fafb; font-weight: bold; border-top: 2px solid #d1d5db;">
        <td colspan="4" style="padding: 10px; text-align: right;">الإجماليات التعاقدية:</td>
        <td style="padding: 10px; text-align: left; font-family: monospace;">${totalRental.toFixed(2)} ج.م</td>
        <td style="padding: 10px; text-align: left; font-family: monospace; color: #b45309;">${depositAmount.toFixed(2)} ج.م</td>
      </tr>
    </tfoot>
  </table>

  <!-- Financial Summary -->
  <div style="background: #f3f4f6; border-radius: 6px; padding: 10px 14px; margin-bottom: 15px; display: table; width: 100%;">
    <div style="display: table-cell; width: 33%;">
      <span style="color: #4b5563;">العربون المدفوع:</span>
      <strong style="font-family: monospace; color: #059669;">${paidAdvance.toFixed(2)} ج.م</strong>
    </div>
    <div style="display: table-cell; width: 33%;">
      <span style="color: #4b5563;">باقي الإيجار المستحق:</span>
      <strong style="font-family: monospace; color: #dc2626;">${remainingRental.toFixed(2)} ج.م</strong>
    </div>
    <div style="display: table-cell; width: 33%;">
      <span style="color: #4b5563;">التأمين المسدد بالدرج:</span>
      <strong style="font-family: monospace; color: #b45309;">${depositPaid.toFixed(2)} ج.م</strong>
    </div>
  </div>

  <!-- Escrow Legal Guarantee Clause (ADR-011) -->
  <div class="escrow-box">
    <strong>🛡️ إقرار أمانات واسترداد التأمين (Security Escrow Acknowledgment):</strong><br>
    يقر المستأجر المذكور أعلاه بسداد مبلغ التأمين الموضح وقدره <strong>(${depositAmount.toFixed(2)} ج.م)</strong> كأمانة نقدية تحت يد الطرف الأول، وتتعهد إدارة المحل برد هذا التأمين بالكامل فور تسليم البدلة وملحقاتها في الموعد المحدد بالحالة الأصلية السليمة.
  </div>

  <!-- Terms and Conditions -->
  <div class="terms-box">
    <strong>الشروط والأحكام والالتزامات القانونية:</strong>
    <ol>
      <li>يلتزم المستأجر بإرجاع البدلة في موعد أقصاه تاريخ الإرجاع المحدد أعلاه.</li>
      <li>في حالة التأخر عن موعد الإرجاع، تطبق غرامة تأخير قدرها <strong>(${lateFeePerDay} ج.م)</strong> عن كل يوم تأخير وتخصم تلقائياً من مبلغ التأمين.</li>
      <li>المستأجر مسئول مسئولية قانونية ومدنية كاملة عن أي تلفيات (حروق، تمزق، بقع غير قابلة للإزالة) ويلتزم بسداد قيمة الإصلاح أو تكلفة البدلة بالكامل.</li>
      <li>لا يعتد بأي تعديلات في المقاسات أو قص الأقمشة دون إشراف ترزي وموافقة إدارة المحل الرسمية.</li>
    </ol>
  </div>

  <!-- Signatures Block -->
  <table class="signatures-table">
    <tr>
      <td class="sig-block">
        <div><strong>الطرف الثاني (المستأجر المقر بما فيه)</strong></div>
        <div style="font-size: 10px; color: #6b7280;">أقر بأنني استلمت البدلة بحالة ممتازة ومطابقة للمقاس</div>
        <div class="sig-line"></div>
        <div>الاسم: .......................................</div>
      </td>
      <td class="sig-block">
        <div><strong>الطرف الأول (إدارة المحل والخزينة)</strong></div>
        <div style="font-size: 10px; color: #6b7280;">خاتم وتوقيع استلام العربون والأمانات</div>
        <div class="sig-line"></div>
        <div>التوقيع والختم: .......................................</div>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * 4. تنفيذ أمر الطباعة أو استخراج المستند
   */
  async printDocument({ html, printerName = null, silent = false, pageSize = 'A4' } = {}) {
    if (!html || !html.trim()) {
      throw new Error('محتوى المستند المراد طباعته فارغ.');
    }

    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
        const { BrowserWindow } = require('electron');
        const printWin = new BrowserWindow({
          show: false,
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        const printOptions = {
          silent: !!silent,
          printBackground: true,
          deviceName: printerName || ''
        };

        if (pageSize === '80mm') {
          printOptions.pageSize = { width: 80000, height: 297000 };
        } else {
          printOptions.pageSize = 'A4';
        }

        return new Promise((resolve) => {
          printWin.webContents.print(printOptions, (success, errorType) => {
            printWin.close();
            if (!success && errorType && errorType !== 'cancelled') {
              logger.warn(`Electron print finished with issue: ${errorType}`);
            }
            resolve({
              success: true,
              pageSize,
              printerName: printerName || 'Default',
              printedAt: new Date().toISOString()
            });
          });
        });
      }
    } catch (err) {
      logger.warn('Direct Electron silent printing not available in current environment:', err.message);
    }

    // Standard headless / simulator fallback
    return {
      success: true,
      html,
      pageSize,
      printerName: printerName || 'Default',
      printedAt: new Date().toISOString()
    };
  }
}

const printingService = new PrintingService();

module.exports = {
  PrintingService,
  printingService
};

