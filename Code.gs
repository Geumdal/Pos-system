/**
 * ============================================================
 * 소매점 POS + 재고관리 시스템 - 백엔드
 * ============================================================
 *
 * [필수 설정]
 *   1. 아래 SHEET_ID에 본인의 Google Sheets ID 입력
 *   2. Apps Script 에디터에서 initializeSheets() 1회 실행
 *   3. 배포 → 새 배포 → 웹 앱
 *
 * [시트 구조]
 *   Products:   제품ID | 제품명 | 카테고리 | 가격 | 재고 | 최소재고 | 활성 | 최대재고 | 판매수 | 보유수
 *   Sales:      거래번호 | 거래일시 | 항목수 | 총수량 | 총액 | 결제방법 | 받은금액 | 거스름돈 | 상태
 *   SaleItems:  거래번호 | 제품ID | 제품명 | 단가 | 수량 | 합계
 *   StockIn:    시간 | 제품ID | 제품명 | 입고량 | 입고후재고 | 비고
 * ============================================================
 */

// ⚠️ 본인 Google Sheets ID로 반드시 교체하세요!
// 시트 URL의 /d/와 /edit 사이 문자열이 ID입니다.
// 예: https://docs.google.com/spreadsheets/d/[이_부분]/edit
const SHEET_ID = '1btc4Bgvke3iuXdN0up4JEYyJGS1Ato0Hvb399WvLqYQ';

const SHEET_PRODUCTS    = 'Products';
const SHEET_SALES       = 'Sales';
const SHEET_SALE_ITEMS  = 'SaleItems';
const SHEET_OUTSTANDING = 'Outstanding';   // 외상 추적

function _checkSheetId() {
  if (!SHEET_ID || SHEET_ID === 'YOUR_GOOGLE_SHEET_ID_HERE') {
    throw new Error(
      'SHEET_ID가 설정되지 않았습니다.\n\n' +
      '1. 본인 Google Sheets URL에서 ID를 복사하세요\n' +
      '2. Code.gs 파일 상단의 SHEET_ID 값을 교체하세요\n' +
      '3. 저장 후 다시 시도하세요'
    );
  }
}


/* ─────────────────────────────────────────────
 * JSON API 진입점 (GitHub Pages 등에서 fetch로 호출)
 * ─────────────────────────────────────────────
 * 사용법:
 *   GET  /exec?action=getProducts
 *   GET  /exec?action=getStats&period=today
 *   POST /exec  body: {action:'processSale', items:[...], payment:{...}}
 * ───────────────────────────────────────────── */

const API_FUNCTIONS = {
  // 제품
  getProducts:           () => getProducts(),
  getAllProductsAdmin:   () => getAllProductsAdmin(),
  addProduct:            (p) => addProduct(p.product),
  updateProduct:         (p) => updateProduct(p.productId, p.updates),
  setProductActive:      (p) => setProductActive(p.productId, p.active),
  deleteProduct:         (p) => deleteProduct(p.productId),
  deleteMultipleProducts:(p) => deleteMultipleProducts(p.productIds),
  checkProductHasSales:  (p) => checkProductHasSales(p.productId),
  // 거래
  processSale:           (p) => processSale(p.items, p.payment),
  refundSale:            (p) => refundSale(p.transactionId),
  // 통계
  getStats:              (p) => getStats(p.period),
  getRecentSales:        (p) => getRecentSales(p.limit),
  // 입고
  recordStockIn:         (p) => recordStockIn(p.productId, p.quantity, p.note),
  getRecentStockIn:      (p) => getRecentStockIn(p.limit),
  getTodayStockInSummary:() => getTodayStockInSummary(),
  // 외부 시트 가져오기
  previewExternalSheet:  (p) => previewExternalSheet(p.url),
  importExternalSheet:   (p) => importExternalSheet(p.url, p.mapping, p.defaultStock),
  // 데이터 초기화 (위험)
  resetAllStats:         (p) => resetAllStats(p.confirmCode),
  fixCategoriesFromName: (p) => fixCategoriesFromName(p.confirmCode),
  fillEmptyCategories:   (p) => fillEmptyCategories(p.confirmCode),
  // 외상 관리
  getOutstandingList:    (p) => getOutstandingList(p),
  payOutstanding:        (p) => payOutstanding(p.saleId, p.method),
  getOutstandingDetail:  (p) => getOutstandingDetail(p.saleId),
  // 메타
  ping:                  () => ({ success: true, time: new Date().toISOString(), version: 'api-v1' })
};

function doGet(e) {
  // GET 요청: URL 파라미터에서 JSON 인코딩된 객체/배열 자동 파싱
  const params = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(key => {
      const val = e.parameter[key];
      // { 또는 [ 로 시작하면 JSON으로 파싱 시도
      if (typeof val === 'string' &&
          (val.charAt(0) === '{' || val.charAt(0) === '[')) {
        try {
          params[key] = JSON.parse(val);
        } catch (err) {
          params[key] = val;
        }
      } else {
        params[key] = val;
      }
    });
  }
  return _handleApiRequest(params);
}

function doPost(e) {
  let params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return _jsonResponse({ success: false, message: 'Invalid JSON body: ' + err.message });
  }
  // GET parameter도 병합 (action을 URL로 보내고 body로 데이터 보내는 경우)
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(k => {
      if (params[k] === undefined) params[k] = e.parameter[k];
    });
  }
  return _handleApiRequest(params);
}

function _handleApiRequest(params) {
  const action = params.action;
  if (!action) {
    return _jsonResponse({
      success: false,
      message: 'action 파라미터가 필요합니다.',
      availableActions: Object.keys(API_FUNCTIONS)
    });
  }

  const handler = API_FUNCTIONS[action];
  if (!handler) {
    return _jsonResponse({
      success: false,
      message: `알 수 없는 action: ${action}`,
      availableActions: Object.keys(API_FUNCTIONS)
    });
  }

  try {
    const result = handler(params);
    return _jsonResponse(result);
  } catch (err) {
    return _jsonResponse({
      success: false,
      message: err.message || String(err),
      action: action
    });
  }
}

function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ─────────────────────────────────────────────
 * 제품 조회
 * ───────────────────────────────────────────── */
function getProducts() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    if (!sheet) return { success: false, message: 'Products 시트가 없습니다.' };

    const data = sheet.getDataRange().getValues();
    const products = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const active = data[i][6];
      if (active === false || active === 'FALSE' || active === 'false') continue;

      products.push({
        id:       String(data[i][0]),
        name:     String(data[i][1] || ''),
        category: String(data[i][2] || '기본'),
        price:    Number(data[i][3]) || 0,
        stock:    Number(data[i][4]) || 0,
        minStock: Number(data[i][5]) || 0
      });
    }

    const categories = ['전체', ...new Set(products.map(p => p.category))];
    return { success: true, products: products, categories: categories };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


/* ─────────────────────────────────────────────
 * 결제 처리 (원자적 거래)
 *   items: [{id, qty}, ...]
 *   payment: {method:'현금'|'Venmo', tendered:받은금액}
 * ───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
 * 결제 처리 (재고 차감 + 거래 기록)
 *
 * 매개변수:
 *   items: 장바구니 항목 배열 [{id, qty}]
 *   payment: {
 *     method: '현금' | 'Venmo' | '외상',
 *     tendered: 받은금액 (외상 시 0),
 *     customerName: 고객명 (외상 시 필수),
 *     customerPhone: 연락처 (외상 시 권장),
 *     note: 메모 (배달, 대신 결제 등)
 *   }
 * ───────────────────────────────────────────── */
function processSale(items, payment) {
  if (!items || items.length === 0) {
    return { success: false, message: '장바구니가 비어있습니다.' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: '다른 거래 처리 중입니다. 잠시 후 다시 시도하세요.' };
  }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const productsSheet = ss.getSheetByName(SHEET_PRODUCTS);

    let salesSheet     = ss.getSheetByName(SHEET_SALES);
    let saleItemsSheet = ss.getSheetByName(SHEET_SALE_ITEMS);
    if (!salesSheet || !saleItemsSheet) {
      _ensureSalesSheets(ss);
      salesSheet     = ss.getSheetByName(SHEET_SALES);
      saleItemsSheet = ss.getSheetByName(SHEET_SALE_ITEMS);
    }

    // Sales 시트 헤더 확장 (메모/고객 컬럼이 없으면 자동 추가)
    _ensureSalesExtendedColumns(salesSheet);

    const data = productsSheet.getDataRange().getValues();
    const indexMap = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) indexMap[String(data[i][0]).trim()] = i;
    }

    // 1단계: 모든 항목의 재고 검증
    const validated = [];
    let totalAmount   = 0;
    let totalQuantity = 0;

    for (const item of items) {
      const cleanId = String(item.id).trim();
      const rowIdx  = indexMap[cleanId];
      if (rowIdx === undefined) {
        return { success: false, message: `제품을 찾을 수 없음: ${cleanId}` };
      }

      const name         = String(data[rowIdx][1]);
      const price        = Number(data[rowIdx][3]) || 0;
      const currentStock = Number(data[rowIdx][4]) || 0;
      const qty          = Number(item.qty) || 0;

      if (qty <= 0) {
        return { success: false, message: `${name}의 수량이 잘못되었습니다.` };
      }
      if (currentStock < qty) {
        return {
          success: false,
          message: `${name} 재고 부족 (현재 ${currentStock}개, 요청 ${qty}개)`
        };
      }

      const subtotal = price * qty;
      validated.push({
        id: cleanId, name: name, price: price, qty: qty,
        subtotal: subtotal, rowIdx: rowIdx, newStock: currentStock - qty
      });
      totalAmount   += subtotal;
      totalQuantity += qty;
    }

    // 2단계: 결제 검증
    const rawMethod = payment && payment.method ? String(payment.method) : '현금';
    let method;
    if (rawMethod === 'Venmo' || rawMethod === 'venmo') method = 'Venmo';
    else if (rawMethod === '외상' || rawMethod === 'credit') method = '외상';
    else method = '현금';

    const tendered = Number(payment.tendered) || 0;
    const change   = method === '현금' ? Math.max(0, tendered - totalAmount) : 0;
    const note     = payment.note ? String(payment.note).trim() : '';
    const customerName  = payment.customerName ? String(payment.customerName).trim() : '';
    const customerPhone = payment.customerPhone ? String(payment.customerPhone).trim() : '';

    // 외상이 아닐 경우만 받은 금액 검증
    if (method !== '외상' && tendered < totalAmount) {
      return {
        success: false,
        message: `받은 금액이 부족합니다 (총액 $${totalAmount.toFixed(2)}, 받음 $${tendered.toFixed(2)})`
      };
    }

    // 외상은 고객명 필수
    if (method === '외상' && !customerName) {
      return {
        success: false,
        message: '외상은 고객명이 필수입니다.'
      };
    }

    // 3단계: 거래번호 생성
    const now = new Date();
    const ts = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const saleId = `T-${ts}-${rand}`;

    // 4단계: 재고 차감
    for (const v of validated) {
      productsSheet.getRange(v.rowIdx + 1, 5).setValue(v.newStock);
    }

    // 5단계: Sales 시트 기록 (확장된 컬럼: 9~12 = 상태, 메모, 고객명, 고객연락처)
    const status = method === '외상' ? '외상' : '완료';
    salesSheet.appendRow([
      saleId, now, validated.length, totalQuantity,
      totalAmount, method, tendered, change, status,
      note, customerName, customerPhone
    ]);

    // 6단계: SaleItems 추가
    const itemRows = validated.map(v => [saleId, v.id, v.name, v.price, v.qty, v.subtotal]);
    saleItemsSheet.getRange(saleItemsSheet.getLastRow() + 1, 1, itemRows.length, 6)
      .setValues(itemRows);

    // 7단계: 외상이면 Outstanding 시트에도 기록
    if (method === '외상') {
      const outstandingSheet = _ensureOutstandingSheet(ss);
      outstandingSheet.appendRow([
        saleId, now, customerName, customerPhone,
        totalAmount, '미결제', '', '', note
      ]);
    }

    return {
      success: true,
      receipt: {
        saleId: saleId,
        timestamp: now.toISOString(),
        items: validated.map(v => ({
          id: v.id, name: v.name, price: v.price, qty: v.qty, subtotal: v.subtotal
        })),
        itemCount:    validated.length,
        totalQty:     totalQuantity,
        totalAmount:  totalAmount,
        method:       method,
        tendered:     tendered,
        change:       change,
        status:       status,
        note:         note,
        customerName: customerName,
        customerPhone: customerPhone
      }
    };
  } catch (err) {
    return { success: false, message: '거래 처리 오류: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}


/* Sales 시트의 확장 컬럼 (메모, 고객명, 고객연락처) 자동 추가 */
function _ensureSalesExtendedColumns(salesSheet) {
  const lastCol = salesSheet.getLastColumn();
  if (lastCol < 12) {
    // 헤더 추가
    if (lastCol < 10) salesSheet.getRange(1, 10).setValue('메모');
    if (lastCol < 11) salesSheet.getRange(1, 11).setValue('고객명');
    if (lastCol < 12) salesSheet.getRange(1, 12).setValue('고객연락처');

    salesSheet.getRange(1, 1, 1, 12)
      .setFontWeight('bold').setBackground('#1d1d1f').setFontColor('#ffffff');
  }
}


/* Outstanding 시트가 없으면 생성 */
function _ensureOutstandingSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_OUTSTANDING);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_OUTSTANDING);
    sheet.getRange(1, 1, 1, 9).setValues([
      ['거래번호', '거래일시', '고객명', '고객연락처', '금액', '상태', '결제일시', '결제방법', '메모']
    ]);
    sheet.getRange(1, 1, 1, 9)
      .setFontWeight('bold').setBackground('#ff3b30').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(7, 160);
  }
  return sheet;
}


/* ─────────────────────────────────────────────
 * 환불 처리 (재고 복원 + 상태 변경)
 * ───────────────────────────────────────────── */
function refundSale(saleId) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (e) { return { success: false, message: '잠시 후 다시 시도하세요.' }; }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const salesSheet     = ss.getSheetByName(SHEET_SALES);
    const itemsSheet     = ss.getSheetByName(SHEET_SALE_ITEMS);
    const productsSheet  = ss.getSheetByName(SHEET_PRODUCTS);

    const sales = salesSheet.getDataRange().getValues();
    let saleRow = -1;
    for (let i = 1; i < sales.length; i++) {
      if (String(sales[i][0]) === saleId) { saleRow = i; break; }
    }
    if (saleRow < 0) return { success: false, message: '거래를 찾을 수 없습니다.' };
    if (sales[saleRow][8] === '환불됨') {
      return { success: false, message: '이미 환불된 거래입니다.' };
    }

    const items = itemsSheet.getDataRange().getValues();
    const products = productsSheet.getDataRange().getValues();
    const productIdx = {};
    for (let i = 1; i < products.length; i++) {
      if (products[i][0]) productIdx[String(products[i][0])] = i;
    }

    for (let i = 1; i < items.length; i++) {
      if (String(items[i][0]) === saleId) {
        const pid = String(items[i][1]);
        const qty = Number(items[i][4]) || 0;
        const r   = productIdx[pid];
        if (r !== undefined) {
          const currentStock = Number(products[r][4]) || 0;
          productsSheet.getRange(r + 1, 5).setValue(currentStock + qty);
        }
      }
    }

    salesSheet.getRange(saleRow + 1, 9).setValue('환불됨');
    return { success: true, saleId: saleId };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}


/* ─────────────────────────────────────────────
 * 통계 집계
 * ───────────────────────────────────────────── */
function getStats(period) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const salesSheet = ss.getSheetByName(SHEET_SALES);
    const itemsSheet = ss.getSheetByName(SHEET_SALE_ITEMS);

    if (!salesSheet) return _emptyStats();

    const sales = salesSheet.getDataRange().getValues();
    const items = itemsSheet ? itemsSheet.getDataRange().getValues() : [[]];

    const now = new Date();
    const tz  = Session.getScriptTimeZone();

    // 기간 필터: 'today' | 'week' | 'month' | 'year'
    const range = _periodRange(period, now);

    const validSales = [];
    for (let i = 1; i < sales.length; i++) {
      if (!sales[i][0]) continue;
      if (sales[i][8] === '환불됨') continue;
      const d = sales[i][1] instanceof Date ? sales[i][1] : new Date(sales[i][1]);
      if (d < range.start || d > range.end) continue;
      validSales.push({
        id: String(sales[i][0]),
        date: d,
        amount: Number(sales[i][4]) || 0,
        method: String(sales[i][5] || '현금')
      });
    }

    const validIds = new Set(validSales.map(s => s.id));

    const summary = {
      totalAmount: validSales.reduce((s, x) => s + x.amount, 0),
      totalCount:  validSales.length,
      avgTicket:   0,
      cashAmount:  validSales.filter(s => s.method === '현금').reduce((s,x) => s+x.amount, 0),
      venmoAmount: validSales.filter(s => s.method === 'Venmo').reduce((s,x) => s+x.amount, 0)
    };
    summary.avgTicket = summary.totalCount > 0 ? Math.round(summary.totalAmount / summary.totalCount) : 0;

    // 일별 추이 (해당 기간 내)
    const dailyMap = {};
    validSales.forEach(s => {
      const key = Utilities.formatDate(s.date, tz, 'yyyy-MM-dd');
      if (!dailyMap[key]) dailyMap[key] = { date: key, amount: 0, count: 0 };
      dailyMap[key].amount += s.amount;
      dailyMap[key].count  += 1;
    });
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // 시간대별 (24시간)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, amount: 0, count: 0 }));
    validSales.forEach(s => {
      const h = s.date.getHours();
      hourly[h].amount += s.amount;
      hourly[h].count  += 1;
    });

    // 상품별 TOP
    const productMap = {};
    for (let i = 1; i < items.length; i++) {
      if (!items[i] || !items[i][0]) continue;
      const saleId = String(items[i][0]);
      if (!validIds.has(saleId)) continue;
      const pid    = String(items[i][1]);
      const pname  = String(items[i][2]);
      const qty    = Number(items[i][4]) || 0;
      const amount = Number(items[i][5]) || 0;
      if (!productMap[pid]) productMap[pid] = { id: pid, name: pname, qty: 0, amount: 0 };
      productMap[pid].qty    += qty;
      productMap[pid].amount += amount;
    }
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      success: true,
      period: period,
      summary: summary,
      daily: daily,
      hourly: hourly,
      topProducts: topProducts,
      paymentMix: {
        cash:  summary.cashAmount,
        venmo: summary.venmoAmount
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function _emptyStats() {
  return {
    success: true,
    summary: { totalAmount: 0, totalCount: 0, avgTicket: 0, cashAmount: 0, venmoAmount: 0 },
    daily: [], hourly: [], topProducts: [],
    paymentMix: { cash: 0, venmo: 0 }
  };
}

function _periodRange(period, now) {
  const start = new Date(now);
  const end   = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { start: start, end: end };
}


/* ─────────────────────────────────────────────
 * 최근 거래 내역
 * ───────────────────────────────────────────── */
function getRecentSales(limit) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_SALES);
    if (!sheet) return { success: true, sales: [] };

    const data = sheet.getDataRange().getValues();
    const max = Number(limit) || 20;
    const sales = [];

    for (let i = data.length - 1; i >= 1 && sales.length < max; i--) {
      if (!data[i][0]) continue;
      sales.push({
        id:        String(data[i][0]),
        date:      data[i][1] instanceof Date ? data[i][1].toISOString() : String(data[i][1]),
        itemCount: Number(data[i][2]) || 0,
        totalQty:  Number(data[i][3]) || 0,
        amount:    Number(data[i][4]) || 0,
        method:    String(data[i][5] || ''),
        status:    String(data[i][8] || '완료')
      });
    }
    return { success: true, sales: sales };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


/* ─────────────────────────────────────────────
 * 제품 관리 (Admin)
 * ───────────────────────────────────────────── */

function getAllProductsAdmin() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    if (!sheet) return { success: false, message: 'Products 시트가 없습니다.' };

    const data = sheet.getDataRange().getValues();
    const products = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const active = data[i][6];
      const isActive = !(active === false || active === 'FALSE' || active === 'false');

      products.push({
        id:        String(data[i][0]),
        name:      String(data[i][1] || ''),
        category:  String(data[i][2] || '기본'),
        price:     Number(data[i][3]) || 0,
        stock:     Number(data[i][4]) || 0,
        minStock:  Number(data[i][5]) || 0,
        active:    isActive,
        maxStock:  Number(data[i][7]) || 0,
        soldCount: Number(data[i][8]) || 0,
        remaining: Number(data[i][9]) || 0
      });
    }

    const categories = [...new Set(products.map(p => p.category))].filter(c => c);
    return { success: true, products: products, categories: categories };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function addProduct(product) {
  if (!product || !product.id || !product.name) {
    return { success: false, message: '제품ID와 제품명은 필수입니다.' };
  }

  const cleanId = String(product.id).trim();
  if (!cleanId) {
    return { success: false, message: '제품ID는 비어있을 수 없습니다.' };
  }
  if (/[\s,]/.test(cleanId)) {
    return { success: false, message: '제품ID에는 공백이나 쉼표를 사용할 수 없습니다.' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { success: false, message: '잠시 후 다시 시도하세요.' }; }

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === cleanId) {
        return { success: false, message: `제품ID "${cleanId}"는 이미 존재합니다.` };
      }
    }

    const price    = Number(product.price);
    const stock    = Number(product.stock);
    const minStock = Number(product.minStock);
    if (isNaN(price) || price < 0) {
      return { success: false, message: '가격은 0 이상의 숫자여야 합니다.' };
    }
    if (isNaN(stock) || stock < 0) {
      return { success: false, message: '재고는 0 이상의 숫자여야 합니다.' };
    }

    sheet.appendRow([
      cleanId,
      String(product.name).trim(),
      String(product.category || '기본').trim(),
      price,
      stock,
      isNaN(minStock) ? 0 : minStock,
      product.active === false ? false : true,
      Number(product.maxStock) || 0,
      Number(product.soldCount) || 0,
      Number(product.remaining) || 0
    ]);

    return { success: true, productId: cleanId };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

function updateProduct(productId, updates) {
  if (!productId) {
    return { success: false, message: '제품ID가 필요합니다.' };
  }
  if (!updates || typeof updates !== 'object') {
    return { success: false, message: '수정 내용이 없습니다.' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { success: false, message: '잠시 후 다시 시도하세요.' }; }

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    const data = sheet.getDataRange().getValues();
    const cleanId = String(productId).trim();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === cleanId) {
        const row = i + 1;
        if (updates.name !== undefined) {
          const name = String(updates.name).trim();
          if (!name) return { success: false, message: '제품명은 비어있을 수 없습니다.' };
          sheet.getRange(row, 2).setValue(name);
        }
        if (updates.category !== undefined) {
          sheet.getRange(row, 3).setValue(String(updates.category || '기본').trim());
        }
        if (updates.price !== undefined) {
          const price = Number(updates.price);
          if (isNaN(price) || price < 0) {
            return { success: false, message: '가격은 0 이상의 숫자여야 합니다.' };
          }
          sheet.getRange(row, 4).setValue(price);
        }
        if (updates.stock !== undefined) {
          const stock = Number(updates.stock);
          if (isNaN(stock) || stock < 0) {
            return { success: false, message: '재고는 0 이상의 숫자여야 합니다.' };
          }
          sheet.getRange(row, 5).setValue(stock);
        }
        if (updates.minStock !== undefined) {
          const ms = Number(updates.minStock);
          sheet.getRange(row, 6).setValue(isNaN(ms) ? 0 : ms);
        }
        if (updates.active !== undefined) {
          sheet.getRange(row, 7).setValue(Boolean(updates.active));
        }
        if (updates.maxStock !== undefined) {
          const v = Number(updates.maxStock);
          sheet.getRange(row, 8).setValue(isNaN(v) ? 0 : v);
        }
        if (updates.soldCount !== undefined) {
          const v = Number(updates.soldCount);
          sheet.getRange(row, 9).setValue(isNaN(v) ? 0 : v);
        }
        if (updates.remaining !== undefined) {
          const v = Number(updates.remaining);
          sheet.getRange(row, 10).setValue(isNaN(v) ? 0 : v);
        }
        return { success: true };
      }
    }
    return { success: false, message: `제품ID "${cleanId}"를 찾을 수 없습니다.` };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

function setProductActive(productId, active) {
  return updateProduct(productId, { active: Boolean(active) });
}

function deleteProduct(productId) {
  if (!productId) {
    return { success: false, message: '제품ID가 필요합니다.' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { success: false, message: '잠시 후 다시 시도하세요.' }; }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const productsSheet = ss.getSheetByName(SHEET_PRODUCTS);
    const data = productsSheet.getDataRange().getValues();
    const cleanId = String(productId).trim();

    let salesCount = 0;
    const saleItemsSheet = ss.getSheetByName(SHEET_SALE_ITEMS);
    if (saleItemsSheet) {
      const siData = saleItemsSheet.getDataRange().getValues();
      for (let i = 1; i < siData.length; i++) {
        if (String(siData[i][1]).trim() === cleanId) salesCount++;
      }
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === cleanId) {
        productsSheet.deleteRow(i + 1);
        return {
          success: true,
          deletedId: cleanId,
          hadSales: salesCount > 0,
          salesCount: salesCount
        };
      }
    }
    return { success: false, message: `제품ID "${cleanId}"를 찾을 수 없습니다.` };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

function checkProductHasSales(productId) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_SALE_ITEMS);
    if (!sheet) return { success: true, hasSales: false, count: 0 };

    const data = sheet.getDataRange().getValues();
    const cleanId = String(productId).trim();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === cleanId) count++;
    }
    return { success: true, hasSales: count > 0, count: count };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function deleteMultipleProducts(productIds) {
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return { success: false, message: '삭제할 제품ID가 없습니다.' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (e) { return { success: false, message: '잠시 후 다시 시도하세요.' }; }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const productsSheet = ss.getSheetByName(SHEET_PRODUCTS);
    const data = productsSheet.getDataRange().getValues();

    const idsToDelete = new Set(productIds.map(id => String(id).trim()));
    const rowsToDelete = [];

    for (let i = 1; i < data.length; i++) {
      if (idsToDelete.has(String(data[i][0]).trim())) {
        rowsToDelete.push(i + 1);
      }
    }

    rowsToDelete.sort((a, b) => b - a);
    for (const row of rowsToDelete) {
      productsSheet.deleteRow(row);
    }

    return {
      success: true,
      deletedCount: rowsToDelete.length,
      requestedCount: productIds.length
    };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}


/* ─────────────────────────────────────────────
 * 외부 Google Sheets에서 제품 가져오기
 * ───────────────────────────────────────────── */

function previewExternalSheet(url) {
  const parsed = _parseSheetUrl(url);
  if (!parsed.success) return parsed;

  try {
    const ss = SpreadsheetApp.openById(parsed.sheetId);
    let targetSheet = null;

    if (parsed.gid !== null) {
      const sheets = ss.getSheets();
      for (const s of sheets) {
        if (s.getSheetId() === parsed.gid) { targetSheet = s; break; }
      }
    }
    if (!targetSheet) targetSheet = ss.getSheets()[0];

    const data = targetSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: false, message: '시트에 데이터가 없습니다 (헤더 + 최소 1행 필요).' };
    }

    const headers = data[0].map(h => String(h || ''));
    const previewRows = data.slice(1, 11).map(row =>
      row.map(c => c instanceof Date ? c.toISOString().slice(0, 10) : String(c == null ? '' : c))
    );

    const mapping = _autoDetectMapping(headers);

    return {
      success:    true,
      sheetName:  targetSheet.getName(),
      headers:    headers,
      preview:    previewRows,
      totalRows:  data.length - 1,
      mapping:    mapping
    };
  } catch (err) {
    return {
      success: false,
      message: '시트에 접근할 수 없습니다. URL이 정확하고 본인 계정에 접근 권한이 있는지 확인하세요.\n(' + err.message + ')'
    };
  }
}

function importExternalSheet(url, mapping, defaultStock) {
  const parsed = _parseSheetUrl(url);
  if (!parsed.success) return parsed;

  // mapping.id === -2 → ID 자동 생성 (P001, P002, ...)
  // mapping.id >= 0  → 지정된 컬럼 사용
  // 그 외          → 에러
  const autoGenerateId = (mapping != null && mapping.id === -2);

  if (!autoGenerateId && (mapping == null || mapping.id == null || mapping.id < 0)) {
    return { success: false, message: '제품ID 컬럼을 선택하거나 자동 생성을 활성화하세요.' };
  }
  if (mapping.name == null || mapping.name < 0) {
    return { success: false, message: '제품명 컬럼은 필수입니다.' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (e) { return { success: false, message: '잠시 후 다시 시도하세요.' }; }

  try {
    const sourceSs = SpreadsheetApp.openById(parsed.sheetId);
    let sourceSheet = null;
    if (parsed.gid !== null) {
      for (const s of sourceSs.getSheets()) {
        if (s.getSheetId() === parsed.gid) { sourceSheet = s; break; }
      }
    }
    if (!sourceSheet) sourceSheet = sourceSs.getSheets()[0];

    const sourceData = sourceSheet.getDataRange().getValues();
    if (sourceData.length < 2) {
      return { success: false, message: '시트에 데이터가 없습니다.' };
    }

    const ourSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    const ourData  = ourSheet.getDataRange().getValues();

    const existingIds = new Set();
    for (let i = 1; i < ourData.length; i++) {
      if (ourData[i][0]) existingIds.add(String(ourData[i][0]).trim());
    }

    const toAdd = [];
    let skipped    = 0;
    let duplicated = 0;
    const fallbackStock = Number(defaultStock) || 0;
    let autoIdCounter = 1;

    for (let i = 1; i < sourceData.length; i++) {
      const row = sourceData[i];
      let id;

      if (autoGenerateId) {
        // 사용 가능한 ID 찾을 때까지 카운터 증가
        do {
          id = 'P' + String(autoIdCounter).padStart(3, '0');
          autoIdCounter++;
        } while (existingIds.has(id));
      } else {
        id = String(row[mapping.id] == null ? '' : row[mapping.id]).trim();
      }

      const name = String(row[mapping.name] == null ? '' : row[mapping.name]).trim();

      if (!id || !name) { skipped++; continue; }
      if (existingIds.has(id)) { duplicated++; continue; }

      const category = (mapping.category != null && mapping.category >= 0)
        ? String(row[mapping.category] || '기본').trim() : '기본';
      const price = (mapping.price != null && mapping.price >= 0)
        ? (Number(String(row[mapping.price]).replace(/[^0-9.-]/g, '')) || 0) : 0;

      // 보유수가 매핑됐다면 추출
      const remainingValue = (mapping.remaining != null && mapping.remaining >= 0)
        ? (Number(row[mapping.remaining]) || 0) : null;

      // 재고: 명시적 매핑 → 보유수 → 기본값 순으로 폴백
      const stock = (mapping.stock != null && mapping.stock >= 0)
        ? (Number(row[mapping.stock]) || 0)
        : (remainingValue !== null ? remainingValue : fallbackStock);

      const minStock = (mapping.minStock != null && mapping.minStock >= 0)
        ? (Number(row[mapping.minStock]) || 0) : 0;
      const maxStock = (mapping.maxStock != null && mapping.maxStock >= 0)
        ? (Number(row[mapping.maxStock]) || 0) : 0;
      const soldCount = (mapping.soldCount != null && mapping.soldCount >= 0)
        ? (Number(row[mapping.soldCount]) || 0) : 0;
      const remaining = remainingValue !== null ? remainingValue : 0;

      toAdd.push([id, name, category, price, stock, minStock, true, maxStock, soldCount, remaining]);
      existingIds.add(id);
    }

    if (toAdd.length > 0) {
      const startRow = ourSheet.getLastRow() + 1;
      ourSheet.getRange(startRow, 1, toAdd.length, 10).setValues(toAdd);
    }

    return {
      success:    true,
      imported:   toAdd.length,
      skipped:    skipped,
      duplicated: duplicated,
      total:      sourceData.length - 1
    };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

function _parseSheetUrl(url) {
  if (!url || typeof url !== 'string') {
    return { success: false, message: 'URL이 비어있습니다.' };
  }
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    return {
      success: false,
      message: '올바른 Google Sheets URL이 아닙니다.\n예: https://docs.google.com/spreadsheets/d/...'
    };
  }
  const sheetId = match[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? parseInt(gidMatch[1], 10) : null;
  return { success: true, sheetId: sheetId, gid: gid };
}

function _autoDetectMapping(headers) {
  const mapping = {
    id: -1, name: -1, category: -1, price: -1, stock: -1, minStock: -1,
    maxStock: -1, soldCount: -1, remaining: -1
  };
  const lower = headers.map(h => String(h).toLowerCase().trim());

  // 'status' 같이 우리 시스템에 매핑하면 안 되는 헤더는 명시적으로 제외
  const skipKeywords = ['status', '상태'];

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i];
    if (skipKeywords.includes(h)) continue;

    if (mapping.id < 0 && (
      h === '제품id' || h === 'id' || h === '코드' || h === 'sku' ||
      h === '바코드' || h === 'code' || h === 'product id' || h === '품번' ||
      h === 'item id' || h === 'item code' || h === '품목코드' || h === '제품코드'
    )) mapping.id = i;
    else if (mapping.name < 0 && (
      h.includes('제품명') || h.includes('상품명') || h === '이름' ||
      h === 'name' || h === 'product' || h === 'product name' || h === '품목' ||
      h === 'item' || h === 'item name' || h === '품명' || h === '제품' || h === '상품'
    )) mapping.name = i;
    else if (mapping.category < 0 && (
      h === '카테고리' || h === '분류' || h === 'category' || h === 'type' ||
      h === '구분' || h === 'group' || h === '그룹' || h === '종류'
    )) mapping.category = i;
    else if (mapping.price < 0 && (
      h === '가격' || h === '단가' || h === '판매가' || h === 'price' ||
      h === 'unit price' || h === 'cost' || h === '금액'
    )) mapping.price = i;
    else if (mapping.maxStock < 0 && (
      h === '최대재고' || h === '최대수량' || h === 'max qty' ||
      h === 'max quantity' || h === 'max stock' || h === 'maximum' ||
      h === 'max' || h === 'maximum stock' || h === 'maximum qty'
    )) mapping.maxStock = i;
    else if (mapping.minStock < 0 && (
      h === '최소재고' || h === '최소수량' || h === 'min stock' ||
      h === 'minimum' || h === 'min qty' || h === 'minimum stock' ||
      h === 'min' || h === 'minimum qty' || h === 'reorder point'
    )) mapping.minStock = i;
    else if (mapping.soldCount < 0 && (
      h === '판매수' || h === '판매량' || h === '주문수' || h === 'ordered' ||
      h === 'sold' || h === 'sales' || h === 'sold count' || h === 'sold qty'
    )) mapping.soldCount = i;
    else if (mapping.remaining < 0 && (
      h === '보유수' || h === '잔여수량' || h === 'remaining' || h === 'available'
    )) mapping.remaining = i;
    else if (mapping.stock < 0 && (
      h === '재고' || h === '수량' || h === 'stock' || h === 'quantity' ||
      h === 'qty' || h === 'on hand' || h === '잔여' || h === '잔량' ||
      h === '현재재고' || h === 'current stock'
    )) mapping.stock = i;
  }
  return mapping;
}


/* ─────────────────────────────────────────────
 * 입고 처리 (Stock-In)
 * ───────────────────────────────────────────── */

const SHEET_STOCK_IN = 'StockIn';

function recordStockIn(productId, quantity, note) {
  if (!productId) return { success: false, message: '제품ID가 필요합니다.' };
  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    return { success: false, message: '수량은 1 이상의 숫자여야 합니다.' };
  }
  if (qty > 10000) {
    return { success: false, message: '한 번에 입고할 수량이 너무 많습니다 (최대 10,000개).' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { success: false, message: '잠시 후 다시 시도하세요.' }; }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const productsSheet = ss.getSheetByName(SHEET_PRODUCTS);
    const data = productsSheet.getDataRange().getValues();
    const cleanId = String(productId).trim();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === cleanId) {
        const name = String(data[i][1]);
        const currentStock = Number(data[i][4]) || 0;
        const newStock = currentStock + qty;

        productsSheet.getRange(i + 1, 5).setValue(newStock);

        let stockInSheet = ss.getSheetByName(SHEET_STOCK_IN);
        if (!stockInSheet) {
          stockInSheet = _ensureStockInSheet(ss);
        }

        stockInSheet.appendRow([
          new Date(), cleanId, name, qty, newStock, note || ''
        ]);

        return {
          success: true,
          product: {
            id:            cleanId,
            name:          name,
            previousStock: currentStock,
            quantityAdded: qty,
            newStock:      newStock
          }
        };
      }
    }
    return { success: false, message: '제품을 찾을 수 없습니다: ' + cleanId };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

function getRecentStockIn(limit) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_STOCK_IN);
    if (!sheet) return { success: true, stockIns: [] };

    const data = sheet.getDataRange().getValues();
    const max = Number(limit) || 30;
    const result = [];

    for (let i = data.length - 1; i >= 1 && result.length < max; i--) {
      if (!data[i][0]) continue;
      result.push({
        date:     data[i][0] instanceof Date ? data[i][0].toISOString() : String(data[i][0]),
        id:       String(data[i][1]),
        name:     String(data[i][2]),
        quantity: Number(data[i][3]) || 0,
        newStock: Number(data[i][4]) || 0,
        note:     String(data[i][5] || '')
      });
    }
    return { success: true, stockIns: result };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function getTodayStockInSummary() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_STOCK_IN);
    if (!sheet) return { success: true, count: 0, totalQty: 0 };

    const data = sheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();
    const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    let count = 0;
    let totalQty = 0;

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const d = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
      const dateStr = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      if (dateStr === todayStr) {
        count++;
        totalQty += Number(data[i][3]) || 0;
      }
    }
    return { success: true, count: count, totalQty: totalQty };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function _ensureStockInSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_STOCK_IN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_STOCK_IN);
    sheet.getRange(1, 1, 1, 6).setValues([
      ['시간', '제품ID', '제품명', '입고량', '입고후재고', '비고']
    ]);
    sheet.getRange(1, 1, 1, 6)
      .setFontWeight('bold').setBackground('#1d1d1f').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 200);
  }
  return sheet;
}


/* ─────────────────────────────────────────────
 * 시트 초기화 (1회 수동 실행)
 * ───────────────────────────────────────────── */
function initializeSheets() {
  _checkSheetId();
  const ss = SpreadsheetApp.openById(SHEET_ID);

  const PRODUCT_HEADERS = [
    '제품ID', '제품명', '카테고리', '가격', '재고', '최소재고', '활성',
    '최대재고', '판매수', '보유수'
  ];

  let products = ss.getSheetByName(SHEET_PRODUCTS);
  if (!products) products = ss.insertSheet(SHEET_PRODUCTS);

  const firstCellValue = products.getRange(1, 1).getValue();
  const currentColCount = products.getLastColumn();

  if (firstCellValue !== '제품ID') {
    // 새 시트
    products.getRange(1, 1, 1, PRODUCT_HEADERS.length).setValues([PRODUCT_HEADERS]);
    products.getRange(1, 1, 1, PRODUCT_HEADERS.length)
      .setFontWeight('bold').setBackground('#1d1d1f').setFontColor('#ffffff');

    products.getRange(2, 1, 6, PRODUCT_HEADERS.length).setValues([
      ['P001', '아메리카노', '음료', 4500, 100, 20, true, 150,  0,  100],
      ['P002', '카페라떼',   '음료', 5000,  80, 20, true, 120,  0,   80],
      ['P003', '녹차',       '음료', 4000,  50, 10, true,  80,  0,   50],
      ['P004', '샌드위치',   '간식', 6500,  30,  5, true,  50,  0,   30],
      ['P005', '쿠키',       '간식', 3000,  60, 10, true, 100,  0,   60],
      ['P006', '생수',       '음료', 1500, 200, 30, true, 300,  0,  200]
    ]);

    products.setColumnWidths(1, PRODUCT_HEADERS.length, 100);
    products.setColumnWidth(2, 200);
  } else if (currentColCount < PRODUCT_HEADERS.length) {
    // 기존 7컬럼 시트 → 10컬럼으로 확장 (데이터 보존)
    products.getRange(1, 1, 1, PRODUCT_HEADERS.length).setValues([PRODUCT_HEADERS]);
    products.getRange(1, 1, 1, PRODUCT_HEADERS.length)
      .setFontWeight('bold').setBackground('#1d1d1f').setFontColor('#ffffff');

    // 기존 데이터 행에 새 컬럼 H/I/J 기본값 0 채움
    const lastRow = products.getLastRow();
    if (lastRow >= 2) {
      const fillRange = products.getRange(2, 8, lastRow - 1, 3);
      const filled = [];
      for (let i = 0; i < lastRow - 1; i++) filled.push([0, 0, 0]);
      fillRange.setValues(filled);
    }
  }

  _ensureSalesSheets(ss);
  _ensureStockInSheet(ss);

  Logger.log('✅ 시트 초기화 완료! Products: 10 columns');

  // UI alert는 시트 메뉴에서 실행할 때만 작동. Apps Script 에디터에서 실행 시 무시.
  try {
    SpreadsheetApp.getUi().alert(
      '✅ 시트 초기화 완료!\n\n' +
      'Products 시트에 10개 컬럼이 준비되었습니다:\n' +
      '제품ID, 제품명, 카테고리, 가격, 재고, 최소재고, 활성,\n' +
      '최대재고, 판매수, 보유수\n\n' +
      '배포 → 새 배포 → 웹 앱으로 배포하세요.'
    );
  } catch (e) {
    // Apps Script 에디터에서 직접 실행 시 UI 없음 - 정상
  }
}

function _ensureSalesSheets(ss) {
  let sales = ss.getSheetByName(SHEET_SALES);
  if (!sales) {
    sales = ss.insertSheet(SHEET_SALES);
    sales.getRange(1, 1, 1, 9).setValues([
      ['거래번호', '거래일시', '항목수', '총수량', '총액', '결제방법', '받은금액', '거스름돈', '상태']
    ]);
    sales.getRange(1, 1, 1, 9)
      .setFontWeight('bold').setBackground('#1d1d1f').setFontColor('#ffffff');
    sales.setColumnWidth(1, 180);
    sales.setColumnWidth(2, 160);
  }

  let items = ss.getSheetByName(SHEET_SALE_ITEMS);
  if (!items) {
    items = ss.insertSheet(SHEET_SALE_ITEMS);
    items.getRange(1, 1, 1, 6).setValues([
      ['거래번호', '제품ID', '제품명', '단가', '수량', '합계']
    ]);
    items.getRange(1, 1, 1, 6)
      .setFontWeight('bold').setBackground('#1d1d1f').setFontColor('#ffffff');
    items.setColumnWidth(1, 180);
    items.setColumnWidth(3, 200);
  }
}


/**
 * resetAllStats - 모든 거래 기록과 통계를 초기화
 *
 * 삭제 대상:
 *   - Sales 시트의 모든 거래 행 (헤더 유지)
 *   - SaleItems 시트의 모든 항목 행 (헤더 유지)
 *   - StockIn 시트의 모든 입고 행 (헤더 유지)
 *
 * 리셋 대상:
 *   - Products 시트의 '판매수' 컬럼 → 모두 0
 *   - Products 시트의 '보유수' 컬럼 → 모두 '재고' 컬럼 값으로 복원
 *
 * 유지:
 *   - Products 시트의 제품 목록 자체
 *   - 재고 (실제 물리적 수량이므로 그대로)
 *
 * @param {string} confirmCode - 'RESET-CONFIRM-2026' 정확히 입력해야 실행
 */
function resetAllStats(confirmCode) {
  // 안전장치: 정확한 확인 코드 필요
  if (confirmCode !== 'RESET-CONFIRM-2026') {
    return {
      success: false,
      message: '확인 코드가 올바르지 않습니다. "RESET-CONFIRM-2026"을 정확히 입력하세요.'
    };
  }

  // 동시 접근 방지
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, message: '다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.' };
  }

  try {
    _checkSheetId();
    const ss = SpreadsheetApp.openById(SHEET_ID);

    const result = {
      salesCleared: 0,
      saleItemsCleared: 0,
      stockInCleared: 0,
      productsReset: 0
    };

    // 1. Sales 시트 초기화 (헤더 1행 제외)
    const salesSheet = ss.getSheetByName(SHEET_SALES);
    if (salesSheet) {
      const lastRow = salesSheet.getLastRow();
      if (lastRow > 1) {
        salesSheet.deleteRows(2, lastRow - 1);
        result.salesCleared = lastRow - 1;
      }
    }

    // 2. SaleItems 시트 초기화
    const itemsSheet = ss.getSheetByName(SHEET_SALE_ITEMS);
    if (itemsSheet) {
      const lastRow = itemsSheet.getLastRow();
      if (lastRow > 1) {
        itemsSheet.deleteRows(2, lastRow - 1);
        result.saleItemsCleared = lastRow - 1;
      }
    }

    // 3. StockIn 시트 초기화
    const stockSheet = ss.getSheetByName(SHEET_STOCK_IN);
    if (stockSheet) {
      const lastRow = stockSheet.getLastRow();
      if (lastRow > 1) {
        stockSheet.deleteRows(2, lastRow - 1);
        result.stockInCleared = lastRow - 1;
      }
    }

    // 4. Products 시트의 판매수/보유수 리셋
    const productsSheet = ss.getSheetByName(SHEET_PRODUCTS);
    if (productsSheet) {
      const data = productsSheet.getDataRange().getValues();
      if (data.length > 1) {
        const headers = data[0].map(h => String(h).trim());
        const stockCol  = headers.indexOf('재고');       // 0-indexed
        const soldCol   = headers.indexOf('판매수');
        const heldCol   = headers.indexOf('보유수');

        const lastRow = productsSheet.getLastRow();

        // 판매수 → 모두 0
        if (soldCol >= 0 && lastRow > 1) {
          const range = productsSheet.getRange(2, soldCol + 1, lastRow - 1, 1);
          const zeros = [];
          for (let i = 0; i < lastRow - 1; i++) zeros.push([0]);
          range.setValues(zeros);
        }

        // 보유수 → 재고 값으로 복원 (= 시작 재고로 리셋)
        if (heldCol >= 0 && stockCol >= 0 && lastRow > 1) {
          const stockValues = productsSheet.getRange(2, stockCol + 1, lastRow - 1, 1).getValues();
          productsSheet.getRange(2, heldCol + 1, lastRow - 1, 1).setValues(stockValues);
        }

        result.productsReset = lastRow - 1;
      }
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: '모든 거래 기록이 초기화되었습니다.',
      details: result
    };
  } catch (err) {
    return {
      success: false,
      message: '초기화 실패: ' + (err.message || err)
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * fixCategoriesFromName - 제품명에서 카테고리 자동 추출하여 시트 업데이트
 *
 * 동작:
 *   - 제품명 형식: "[카테고리명] [...]" 또는 "카테고리명 [...]"
 *   - 첫 번째 단어 또는 첫 번째 [] 앞 단어를 카테고리로 사용
 *   - "기본"이라고 잘못 분류된 모든 제품을 자동 수정
 *
 * 매핑 규칙 (시트의 실제 카테고리 명에 맞게 조정):
 *   "장류"       → "장류"
 *   "양념류"     → "조미료/양념류"
 *   "가루류"     → "가루류"
 *   "곡류"       → "곡류"
 *   "면류"       → "면류"
 *   "콩류"       → "콩류"
 *   "견과류"     → "씨앗/견과류"
 *   "건조식"     → "건조식재료"
 *   "김치류"     → "김치류"
 *   "쌈장류"     → "쌈장류"
 *   "나물/무침류" → "나물/무침류"
 *   "조림류"     → "조림류"
 *   "묵/전류"    → "묵/전류"
 *   "젓갈류"     → "젓갈류"
 *   "고기류"     → "고기류"
 *   "기타"       → "기타 & 해산물류"
 */
function fixCategoriesFromName(confirmCode) {
  // 안전장치
  if (confirmCode !== 'FIX-CATEGORIES-2026') {
    return {
      success: false,
      message: '확인 코드가 올바르지 않습니다. "FIX-CATEGORIES-2026"을 정확히 입력하세요.'
    };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, message: '다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.' };
  }

  // 제품명 첫 단어 → 정식 카테고리명 매핑
  const CATEGORY_MAP = {
    '장류':         '장류',
    '양념류':       '조미료/양념류',
    '가루류':       '가루류',
    '곡류':         '곡류',
    '면류':         '면류',
    '콩류':         '콩류',
    '견과류':       '씨앗/견과류',
    '건조식':       '건조식재료',
    '김치류':       '김치류',
    '쌈장류':       '쌈장류',
    '나물/무침류':  '나물/무침류',
    '조림류':       '조림류',
    '묵/전류':      '묵/전류',
    '젓갈류':       '젓갈류',
    '고기류':       '고기류',
    '기타':         '기타 & 해산물류'
  };

  try {
    _checkSheetId();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_PRODUCTS);
    if (!sheet) return { success: false, message: 'Products 시트를 찾을 수 없습니다.' };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, message: '제품이 없습니다.' };

    const headers = data[0].map(h => String(h).trim());
    const idCol       = headers.indexOf('제품ID');
    const nameCol     = headers.indexOf('제품명');
    const categoryCol = headers.indexOf('카테고리');

    if (idCol < 0 || nameCol < 0 || categoryCol < 0) {
      return {
        success: false,
        message: `필수 컬럼 누락: 제품ID(${idCol}), 제품명(${nameCol}), 카테고리(${categoryCol})`
      };
    }

    const updates = [];   // 변경된 행 정보
    const skipped = [];   // 매핑 못 찾은 제품
    const noChange = [];  // 변경 불필요한 제품

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const productId = String(row[idCol]).trim();
      const productName = String(row[nameCol]).trim();
      const currentCategory = String(row[categoryCol]).trim();

      if (!productId || !productName) continue;

      // 제품명에서 첫 단어 추출 (공백 또는 [ 까지)
      const match = productName.match(/^([^\s\[]+)/);
      if (!match) {
        skipped.push({ id: productId, name: productName, reason: '제품명 형식 인식 실패' });
        continue;
      }

      const firstWord = match[1];
      const correctCategory = CATEGORY_MAP[firstWord];

      if (!correctCategory) {
        skipped.push({ id: productId, name: productName, reason: `매핑 없음: "${firstWord}"` });
        continue;
      }

      if (currentCategory === correctCategory) {
        noChange.push({ id: productId });
        continue;
      }

      // 변경 필요
      updates.push({
        rowIndex: i + 1,  // 1-indexed for setValue
        id: productId,
        name: productName,
        oldCategory: currentCategory,
        newCategory: correctCategory
      });
    }

    // 일괄 업데이트
    updates.forEach(u => {
      sheet.getRange(u.rowIndex, categoryCol + 1).setValue(u.newCategory);
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      message: `카테고리 ${updates.length}개 수정 완료`,
      details: {
        updated: updates.length,
        unchanged: noChange.length,
        skipped: skipped.length,
        updates: updates,
        skipped_items: skipped
      }
    };
  } catch (err) {
    return {
      success: false,
      message: '실행 실패: ' + (err.message || err)
    };
  } finally {
    lock.releaseLock();
  }
}


/* ─────────────────────────────────────────────
 * 외상 목록 조회
 * ───────────────────────────────────────────── */
function getOutstandingList(filter) {
  try {
    _checkSheetId();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = _ensureOutstandingSheet(ss);
    const data = sheet.getDataRange().getValues();

    const filterStatus = filter && filter.status ? String(filter.status) : 'all';

    const items = [];
    let totalUnpaid = 0;
    let totalPaid   = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;

      const status = String(row[5] || '').trim();
      const item = {
        saleId:        String(row[0]),
        timestamp:     row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
        customerName:  String(row[2] || ''),
        customerPhone: String(row[3] || ''),
        amount:        Number(row[4]) || 0,
        status:        status,
        paidAt:        row[6] instanceof Date ? row[6].toISOString() : (row[6] ? String(row[6]) : ''),
        paidMethod:    String(row[7] || ''),
        note:          String(row[8] || ''),
        rowIndex:      i + 1
      };

      if (status === '미결제') totalUnpaid += item.amount;
      if (status === '결제완료') totalPaid += item.amount;

      // 필터 적용
      if (filterStatus === 'all' ||
          (filterStatus === 'unpaid' && status === '미결제') ||
          (filterStatus === 'paid' && status === '결제완료')) {
        items.push(item);
      }
    }

    // 미결제가 위에, 그 다음 최신 순
    items.sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === '미결제') return -1;
        if (b.status === '미결제') return 1;
      }
      return b.timestamp.localeCompare(a.timestamp);
    });

    return {
      success: true,
      items: items,
      summary: {
        totalCount:   items.length,
        unpaidAmount: totalUnpaid,
        paidAmount:   totalPaid,
        unpaidCount:  items.filter(i => i.status === '미결제').length,
        paidCount:    items.filter(i => i.status === '결제완료').length
      }
    };
  } catch (err) {
    return { success: false, message: '외상 조회 실패: ' + err.message };
  }
}


/* ─────────────────────────────────────────────
 * 외상 결제 완료 처리
 * ───────────────────────────────────────────── */
function payOutstanding(saleId, method) {
  if (!saleId) return { success: false, message: '거래번호가 필요합니다.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, message: '잠시 후 다시 시도하세요.' };
  }

  try {
    _checkSheetId();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = _ensureOutstandingSheet(ss);
    const data = sheet.getDataRange().getValues();

    const cleanMethod = (method === 'Venmo' || method === 'venmo') ? 'Venmo' : '현금';

    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(saleId).trim()) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow < 0) {
      return { success: false, message: '외상 거래를 찾을 수 없습니다: ' + saleId };
    }

    const currentStatus = String(data[foundRow - 1][5] || '').trim();
    if (currentStatus === '결제완료') {
      return { success: false, message: '이미 결제 완료된 외상입니다.' };
    }

    const now = new Date();

    // Outstanding 시트 업데이트
    sheet.getRange(foundRow, 6).setValue('결제완료');
    sheet.getRange(foundRow, 7).setValue(now);
    sheet.getRange(foundRow, 8).setValue(cleanMethod);

    // Sales 시트 상태도 '완료'로 변경 + 결제수단 업데이트
    const salesSheet = ss.getSheetByName(SHEET_SALES);
    if (salesSheet) {
      const salesData = salesSheet.getDataRange().getValues();
      for (let i = 1; i < salesData.length; i++) {
        if (String(salesData[i][0]).trim() === String(saleId).trim()) {
          salesSheet.getRange(i + 1, 9).setValue('완료');     // 상태
          salesSheet.getRange(i + 1, 6).setValue(cleanMethod); // 결제방법 갱신
          // 받은금액도 총액으로 업데이트
          const totalAmount = Number(salesData[i][4]) || 0;
          salesSheet.getRange(i + 1, 7).setValue(totalAmount);
          break;
        }
      }
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: '외상 결제 완료',
      saleId: saleId,
      method: cleanMethod,
      paidAt: now.toISOString()
    };
  } catch (err) {
    return { success: false, message: '결제 처리 실패: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}


/* ─────────────────────────────────────────────
 * 외상 거래 상세 조회 (영수증 정보)
 * ───────────────────────────────────────────── */
function getOutstandingDetail(saleId) {
  try {
    _checkSheetId();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const salesSheet = ss.getSheetByName(SHEET_SALES);
    const itemsSheet = ss.getSheetByName(SHEET_SALE_ITEMS);

    if (!salesSheet || !itemsSheet) {
      return { success: false, message: '시트를 찾을 수 없습니다.' };
    }

    // 거래 정보
    const salesData = salesSheet.getDataRange().getValues();
    let saleInfo = null;
    for (let i = 1; i < salesData.length; i++) {
      if (String(salesData[i][0]).trim() === String(saleId).trim()) {
        saleInfo = {
          saleId:        String(salesData[i][0]),
          timestamp:     salesData[i][1] instanceof Date ? salesData[i][1].toISOString() : String(salesData[i][1]),
          itemCount:     Number(salesData[i][2]) || 0,
          totalQty:      Number(salesData[i][3]) || 0,
          totalAmount:   Number(salesData[i][4]) || 0,
          method:        String(salesData[i][5] || ''),
          tendered:      Number(salesData[i][6]) || 0,
          change:        Number(salesData[i][7]) || 0,
          status:        String(salesData[i][8] || ''),
          note:          String(salesData[i][9] || ''),
          customerName:  String(salesData[i][10] || ''),
          customerPhone: String(salesData[i][11] || '')
        };
        break;
      }
    }

    if (!saleInfo) {
      return { success: false, message: '거래를 찾을 수 없습니다: ' + saleId };
    }

    // 항목 목록
    const itemsData = itemsSheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < itemsData.length; i++) {
      if (String(itemsData[i][0]).trim() === String(saleId).trim()) {
        items.push({
          id:       String(itemsData[i][1]),
          name:     String(itemsData[i][2]),
          price:    Number(itemsData[i][3]) || 0,
          qty:      Number(itemsData[i][4]) || 0,
          subtotal: Number(itemsData[i][5]) || 0
        });
      }
    }

    return {
      success: true,
      sale: saleInfo,
      items: items
    };
  } catch (err) {
    return { success: false, message: '조회 실패: ' + err.message };
  }
}


/**
 * fillEmptyCategories - A 컬럼(카테고리)의 빈 셀을 위 행 값으로 자동 채움
 *
 * 시트 구조 가정:
 *   Products 시트의 카테고리 컬럼이 그룹 헤더 형태로 비어있는 경우
 *   장류
 *   (빈)  ← 이 행도 "장류"로 채움
 *   (빈)  ← 이 행도 "장류"로 채움
 *   조미료/양념류
 *   (빈)  ← 이 행도 "조미료/양념류"로 채움
 *
 * @param {string} confirmCode - 'FILL-CATEGORIES-2026'
 */
function fillEmptyCategories(confirmCode) {
  if (confirmCode !== 'FILL-CATEGORIES-2026') {
    return {
      success: false,
      message: '확인 코드가 올바르지 않습니다. "FILL-CATEGORIES-2026"을 입력하세요.'
    };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, message: '잠시 후 다시 시도하세요.' };
  }

  try {
    _checkSheetId();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_PRODUCTS);
    if (!sheet) return { success: false, message: 'Products 시트를 찾을 수 없습니다.' };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, message: '제품이 없습니다.' };

    const headers = data[0].map(h => String(h).trim());
    const categoryCol = headers.indexOf('카테고리');

    if (categoryCol < 0) {
      return {
        success: false,
        message: '카테고리 컬럼을 찾을 수 없습니다. 헤더: ' + headers.join(', ')
      };
    }

    let lastCategory = '';
    const updates = [];

    // 각 행을 검사하여 빈 카테고리는 위 행의 값으로 채움
    for (let i = 1; i < data.length; i++) {
      const current = String(data[i][categoryCol] || '').trim();

      if (current && current !== '기본') {
        // 카테고리 값이 있으면 → 새로운 카테고리 시작
        lastCategory = current;
      } else if (lastCategory) {
        // 빈 셀 또는 "기본" → 위 카테고리로 채움
        updates.push({
          rowIndex: i + 1,  // 1-indexed
          oldValue: current,
          newValue: lastCategory
        });
      }
    }

    // 일괄 업데이트
    updates.forEach(u => {
      sheet.getRange(u.rowIndex, categoryCol + 1).setValue(u.newValue);
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      message: `카테고리 ${updates.length}개 자동 채움 완료`,
      details: {
        filled: updates.length,
        updates: updates.slice(0, 20)  // 처음 20개만 반환
      }
    };
  } catch (err) {
    return {
      success: false,
      message: '실행 실패: ' + (err.message || err)
    };
  } finally {
    lock.releaseLock();
  }
}
