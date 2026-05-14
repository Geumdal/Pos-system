/* ============================================================
 * POS 시스템 - API 클라이언트 헬퍼
 * ============================================================
 * 사용법:
 *   const res = await api('getProducts');
 *   const res = await api('processSale', { items, payment });
 *
 * Apps Script + GitHub Pages CORS 처리:
 *   - 작은 데이터: GET + URL 파라미터 (CORS preflight 안 발생)
 *   - 큰 데이터(items, mapping 등): POST + text/plain body
 * ============================================================ */

if (typeof window.API_URL === 'undefined') {
  console.error('⚠️ config.js에서 API_URL을 설정하세요!');
}

async function api(action, params) {
  if (!window.API_URL || window.API_URL.indexOf('YOUR_') === 0) {
    return {
      success: false,
      message: '⚠️ config.js에서 API_URL을 설정하세요'
    };
  }

  params = params || {};

  // 데이터 크기 추정 - 작으면 GET, 크면 POST
  const jsonStr = JSON.stringify(params);
  const useGet = jsonStr.length < 1500 && !_hasComplexData(params);

  try {
    let response;

    if (useGet) {
      // GET 요청 - URL 파라미터 (CORS preflight 안 일어남)
      const url = _buildGetUrl(action, params);
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow'
      });
    } else {
      // POST 요청 - body에 JSON, text/plain으로 preflight 회피
      const body = Object.assign({ action: action }, params);
      response = await fetch(window.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });
    }

    if (!response.ok) {
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      return {
        success: false,
        message: 'JSON 파싱 실패: ' + text.substring(0, 200)
      };
    }
  } catch (err) {
    return {
      success: false,
      message: '네트워크 오류: ' + (err.message || err)
    };
  }
}

function _buildGetUrl(action, params) {
  const url = new URL(window.API_URL);
  url.searchParams.set('action', action);

  for (const key in params) {
    const val = params[key];
    if (val === undefined || val === null) continue;

    if (typeof val === 'object') {
      url.searchParams.set(key, JSON.stringify(val));
    } else {
      url.searchParams.set(key, String(val));
    }
  }
  return url.toString();
}

function _hasComplexData(params) {
  for (const key in params) {
    const val = params[key];
    if (Array.isArray(val) && val.length > 5) return true;
    if (typeof val === 'object' && val !== null) {
      for (const k in val) {
        if (typeof val[k] === 'object' && val[k] !== null) return true;
      }
    }
  }
  return false;
}

function fmtUSD(amount) {
  const n = Number(amount) || 0;
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * 제품명에서 카테고리/가격 부분을 제거해 깔끔한 이름만 반환
 * 예: "장류 [된장 ($40)]" -> "된장"
 *     "양념류 [고운 고추가루 ($30)]" -> "고운 고추가루"
 *     "된장" -> "된장" (이미 깔끔하면 그대로)
 */
function cleanProductName(name) {
  if (!name) return '';
  let s = String(name).trim();
  // 패턴: "카테고리 [제품명 ($가격)]" - 대괄호 안 추출
  const bracketMatch = s.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    s = bracketMatch[1].trim();
  }
  // 끝에 ($숫자) 또는 (숫자원) 같은 가격 표시 제거
  s = s.replace(/\s*\([\$₩￦]?\s*[\d,]+\.?\d*\s*[원$￦]?\)\s*$/i, '').trim();
  return s || name;  // 비어있으면 원본 반환
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function escapeAttr(str) {
  return String(str).replace(/['"\\]/g, m => '\\' + m);
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  setTimeout(() => t.classList.remove('show'), 2500);
}


/* ============================================================
 * 고객 합산 팝업 (공유 컴포넌트)
 * ============================================================
 * 사용법:
 *   showCustomerPopup('703-555-1234', () => loadOutstanding());
 *
 * - 페이지에 자동으로 모달 HTML 삽입
 * - 연락처 기준으로 모든 거래(외상/현금/Venmo/선주문) 합산
 * - 미결제 일괄 결제 가능
 * ============================================================ */

let _customerPopupInjected = false;

function _injectCustomerPopup() {
  if (_customerPopupInjected) return;
  _customerPopupInjected = true;

  const html = `
    <div class="modal-bd" id="customerPopup" onclick="closeCustomerPopup(event)">
      <div class="modal" id="customerPopupModal" onclick="event.stopPropagation()" style="max-width:680px;">
        <div id="customerPopupBody">
          <div style="text-align:center; padding:40px;">⏳ 불러오는 중...</div>
        </div>
      </div>
    </div>
    <div class="modal-bd" id="bulkPayModal" onclick="closeBulkPay(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:420px;">
        <h2 style="margin-bottom:16px;">💰 외상 일괄 결제</h2>
        <div id="bulkPayInfo" style="background:#f5f5f7; border-radius:10px; padding:14px; margin-bottom:16px;"></div>
        <div style="font-size:13px; color:#666; margin-bottom:8px;">결제 방법:</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;">
          <button class="bulk-pm-btn active" id="bulkPmCash" onclick="selectBulkMethod('현금')">💵 현금</button>
          <button class="bulk-pm-btn" id="bulkPmVenmo" onclick="selectBulkMethod('Venmo')">💸 Venmo</button>
        </div>
        <div id="bulkVenmoBox" style="display:none; background:linear-gradient(135deg,#3D95CE,#2a7ab0); color:white; padding:14px 16px; border-radius:12px; margin-bottom:14px; text-align:center;">
          <div style="font-size:11px; opacity:0.85;">VENMO로 송금</div>
          <div style="font-size:22px; font-weight:700; margin-top:4px;">@Garden-Church</div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button class="cust-btn-cancel" onclick="closeBulkPay()">취소</button>
          <button class="cust-btn-confirm" id="bulkPayBtn" onclick="confirmBulkPay()">✅ 일괄 결제</button>
        </div>
      </div>
    </div>

    <div class="modal-bd" id="popupPickupModal" onclick="closePopupPickup(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:420px;">
        <h2 style="margin-bottom:16px;">🛍️ 선주문 픽업 결제</h2>
        <div id="popupPickupInfo" style="background:#f5f5f7; border-radius:10px; padding:14px; margin-bottom:16px;"></div>
        <div style="font-size:13px; color:#666; margin-bottom:8px;">결제 방법:</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:14px;">
          <button class="bulk-pm-btn active" id="popupPickupCash" onclick="selectPopupPickupMethod('현금')">💵 현금</button>
          <button class="bulk-pm-btn" id="popupPickupVenmo" onclick="selectPopupPickupMethod('Venmo')">💸 Venmo</button>
          <button class="bulk-pm-btn" id="popupPickupCredit" onclick="selectPopupPickupMethod('외상')" style="background:#fff5f5; color:#c62828;">📝 외상</button>
        </div>

        <div id="popupPickupCashBox" style="background:#f0fdf4; border:1px solid #bbf7d0; padding:14px; border-radius:12px; margin-bottom:14px;">
          <div style="font-size:13px; color:#1c7c2f; font-weight:600; margin-bottom:8px;">💵 현금 받은 금액</div>
          <input type="number" id="popupPickupTendered" placeholder="받은 금액 입력 (예: 100)" min="0" step="0.01"
                 oninput="updatePopupPickupChange()"
                 style="width:100%; padding:12px 14px; border:1px solid #bbf7d0; border-radius:8px; font-size:16px; font-family:inherit; box-sizing:border-box; background:white;">
          <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
            <button type="button" onclick="setPopupPickupTendered('exact')" style="padding:6px 12px; background:white; border:1px solid #bbf7d0; border-radius:6px; font-size:12px; cursor:pointer; color:#1c7c2f; font-weight:600; font-family:inherit;">정확히</button>
            <button type="button" onclick="setPopupPickupTendered(20)" style="padding:6px 12px; background:white; border:1px solid #bbf7d0; border-radius:6px; font-size:12px; cursor:pointer; color:#1c7c2f; font-family:inherit;">$20</button>
            <button type="button" onclick="setPopupPickupTendered(50)" style="padding:6px 12px; background:white; border:1px solid #bbf7d0; border-radius:6px; font-size:12px; cursor:pointer; color:#1c7c2f; font-family:inherit;">$50</button>
            <button type="button" onclick="setPopupPickupTendered(100)" style="padding:6px 12px; background:white; border:1px solid #bbf7d0; border-radius:6px; font-size:12px; cursor:pointer; color:#1c7c2f; font-family:inherit;">$100</button>
          </div>
          <div id="popupPickupChangeBox" style="margin-top:12px; padding:10px 12px; background:white; border-radius:8px; display:none;">
            <div style="display:flex; justify-content:space-between; font-size:13px; color:#8e8e93;">
              <span>받은 금액:</span>
              <span id="popupPickupTenderedDisplay" style="font-weight:600; color:#1d1d1f;">$0.00</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; color:#8e8e93; margin-top:4px;">
              <span>결제 금액:</span>
              <span id="popupPickupAmountDisplay" style="font-weight:600; color:#1d1d1f;">$0.00</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:700; margin-top:8px; padding-top:8px; border-top:1px solid #f0fdf4;">
              <span id="popupPickupChangeLabel" style="color:#1c7c2f;">💰 거스름돈:</span>
              <span id="popupPickupChangeDisplay" style="color:#1c7c2f;">$0.00</span>
            </div>
          </div>
        </div>

        <div id="popupPickupVenmoBox" style="display:none; background:linear-gradient(135deg,#3D95CE,#2a7ab0); color:white; padding:14px 16px; border-radius:12px; margin-bottom:14px; text-align:center;">
          <div style="font-size:11px; opacity:0.85;">VENMO로 송금</div>
          <div style="font-size:22px; font-weight:700; margin-top:4px;">@Garden-Church</div>
        </div>
        <div id="popupPickupCreditBox" style="display:none; background:#fff5f5; border:1px solid #ffd5d5; padding:12px; border-radius:10px; margin-bottom:14px; font-size:12px; color:#8a3a3a;">
          ⚠️ 외상으로 처리됩니다. 외상 페이지에서 추후 결제 처리하세요.
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button class="cust-btn-cancel" onclick="closePopupPickup()">취소</button>
          <button class="cust-btn-confirm" id="popupPickupBtn" onclick="confirmPopupPickup()" style="background:#34c759;">✅ 픽업 완료</button>
        </div>
      </div>
    </div>
  `;

  const css = `
    <style>
      #customerPopup .modal-bd, #bulkPayModal.modal-bd { padding: 16px; }
      .cust-section {
        margin-bottom: 16px; padding: 12px; border-radius: 10px;
        background: #f9f9fb;
      }
      .cust-section-title {
        font-size: 13px; font-weight: 700; margin-bottom: 8px;
        display: flex; align-items: center; gap: 6px;
      }
      .cust-section.paid { border-left: 3px solid #34c759; }
      .cust-section.unpaid { border-left: 3px solid #ff3b30; background: #fff5f5; }
      .cust-section.preorder { border-left: 3px solid #5856d6; background: #ede9fe; }
      .cust-section.pickedup { border-left: 3px solid #34c759; opacity: 0.85; }
      .cust-tx-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 8px; background: white; border-radius: 6px;
        margin-bottom: 4px; font-size: 12px;
      }
      .cust-tx-row:last-child { margin-bottom: 0; }
      .cust-tx-info { flex: 1; min-width: 0; }
      .cust-tx-date { font-size: 11px; color: #8e8e93; }
      .cust-tx-items {
        font-size: 12px; color: #4a4a4f;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .cust-tx-amount {
        font-weight: 600; font-size: 13px; margin-left: 8px;
        white-space: nowrap;
      }
      .cust-tx-badges {
        display: flex; flex-wrap: wrap; gap: 4px;
        margin-top: 3px; margin-bottom: 3px;
      }
      .cust-method-badge {
        display: inline-flex; align-items: center; gap: 3px;
        padding: 2px 8px; border-radius: 8px;
        font-size: 10px; font-weight: 600;
      }
      .cust-method-cash {
        background: #d4f4dd; color: #1c7c2f;
      }
      .cust-method-venmo {
        background: #d8edf8; color: #1a4f6e;
      }
      .cust-method-credit {
        background: #fff5f5; color: #c62828;
        border: 1px solid #ffd5d5;
      }
      .cust-pickup-date {
        display: inline-block; padding: 2px 8px;
        background: #ede9fe; color: #5856d6;
        border-radius: 8px; font-size: 10px; font-weight: 600;
      }
      .cust-tx-right {
        display: flex; flex-direction: column; gap: 4px;
        align-items: flex-end; margin-left: 8px;
      }
      .cust-pickup-btn {
        padding: 4px 10px; background: #34c759; color: white;
        border: none; border-radius: 6px; font-size: 11px;
        font-weight: 600; cursor: pointer; font-family: inherit;
        white-space: nowrap;
      }
      .cust-pickup-btn:hover { background: #2ea043; }
      .cust-summary-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        margin-bottom: 14px;
      }
      .cust-stat {
        padding: 10px; background: white; border-radius: 8px;
        text-align: center;
      }
      .cust-stat .v { font-size: 18px; font-weight: 700; }
      .cust-stat .l { font-size: 11px; color: #8e8e93; }
      .cust-stat.unpaid .v { color: #ff3b30; }
      .cust-stat.preorder .v { color: #5856d6; }
      .cust-pay-all-btn {
        width: 100%; padding: 12px; background: #ff3b30; color: white;
        border: none; border-radius: 10px; font-size: 14px;
        font-weight: 700; cursor: pointer; margin-top: 8px;
      }
      .cust-pay-all-btn:hover { background: #d70015; }
      .bulk-pm-btn {
        padding: 14px; background: #f5f5f7; color: #1d1d1f;
        border: 2px solid transparent; border-radius: 10px;
        font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      .bulk-pm-btn.active {
        background: white; border-color: #007aff; color: #007aff;
      }
      .cust-btn-cancel {
        padding: 12px; background: #e5e5ea; color: #1d1d1f;
        border: none; border-radius: 10px; font-weight: 600; cursor: pointer;
      }
      .cust-btn-confirm {
        padding: 12px; background: #34c759; color: white;
        border: none; border-radius: 10px; font-weight: 600; cursor: pointer;
      }
      .cust-btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
  `;

  document.body.insertAdjacentHTML('beforeend', css + html);
}


/* 고객 정보 팝업 열기 (전역 함수) */
let _currentCustomerPhone = '';
let _currentCustomerCallback = null;
let _currentBulkMethod = '현금';
let _currentBulkAmount = 0;

async function showCustomerPopup(phone, refreshCallback) {
  _injectCustomerPopup();
  _currentCustomerPhone = phone;
  _currentCustomerCallback = refreshCallback || null;

  const popup = document.getElementById('customerPopup');
  const body = document.getElementById('customerPopupBody');

  body.innerHTML = `<div style="text-align:center; padding:40px;">⏳ 불러오는 중...</div>`;
  popup.classList.add('active');

  try {
    const res = await api('getCustomerSummary', { phone: phone });
    if (!res.success) {
      body.innerHTML = `<div style="text-align:center; padding:30px; color:#ff3b30;">${escapeHtml(res.message || '조회 실패')}</div>
        <div style="text-align:center;"><button class="cust-btn-cancel" onclick="closeCustomerPopup()">닫기</button></div>`;
      return;
    }
    body.innerHTML = _renderCustomerPopup(res);
  } catch (err) {
    body.innerHTML = `<div style="text-align:center; padding:30px; color:#ff3b30;">오류: ${escapeHtml(err.message || err)}</div>`;
  }
}

function closeCustomerPopup(e) {
  if (e && e.target && e.target.id !== 'customerPopup') return;
  document.getElementById('customerPopup').classList.remove('active');
}

function _renderCustomerPopup(res) {
  const c = res.customer;
  const sales = res.sales || [];
  const preorders = res.preorders || [];

  // 전체 합계 - 결제완료 + 미결제만 (픽업완료는 결제완료에 이미 포함, 예약중은 결제 안 된 상태)
  const totalAmount = c.paid.amount + c.unpaid.amount;

  // 미결제 외상 거래
  const unpaidSales = sales.filter(s => s.status === '외상');
  // 완료 거래 (외상 아님 + 환불 아님)
  const paidSales = sales.filter(s => s.status !== '외상' && s.status !== '환불됨');
  // 환불 거래
  const refundedSales = sales.filter(s => s.status === '환불됨');

  // 선주문
  const pendingPos = preorders.filter(p => p.status === '예약중');
  const pickedUpPos = preorders.filter(p => p.status === '픽업완료');
  const cancelledPos = preorders.filter(p => p.status === '취소');

  function renderTxRow(items, type) {
    return items.map(it => {
      const date = new Date(it.date);
      const dateStr = date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const itemNames = (it.items || []).map(x => `${cleanProductName(x.name)}×${x.qty}`).join(', ') || '-';
      const amt = type === 'preorder' ? it.totalAmount : it.amount;
      const id = type === 'preorder' ? it.preorderId : it.saleId;

      // 결제 방법 배지 (sale인 경우만)
      let methodBadge = '';
      if (type === 'sale' && it.method) {
        const m = it.method;
        let badgeClass = 'cust-method-cash';
        let icon = '💵';
        if (m === 'Venmo' || m === 'venmo') {
          badgeClass = 'cust-method-venmo';
          icon = '💸';
        } else if (m === '외상') {
          badgeClass = 'cust-method-credit';
          icon = '📝';
        }
        methodBadge = `<span class="cust-method-badge ${badgeClass}">${icon} ${escapeHtml(m)}</span>`;
      }

      // 픽업 예정일 (preorder)
      const pickupDateStr = (type === 'preorder' && it.pickupDate)
        ? `<span class="cust-pickup-date">📅 픽업예정 ${escapeHtml(it.pickupDate)}</span>`
        : '';

      // 픽업 완료 시간 (preorder)
      const pickedAtStr = (type === 'preorder' && it.pickupAt)
        ? `<span class="cust-pickup-date" style="background:#f0fdf4; color:#34c759;">📦 픽업 ${new Date(it.pickupAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`
        : '';

      // 예약중 선주문 픽업 버튼
      const pickupBtn = (type === 'preorder' && it.status === '예약중')
        ? `<button class="cust-pickup-btn" onclick="openPickupFromPopup('${escapeAttr(id)}', ${amt}); event.stopPropagation();">🛍️ 픽업 결제</button>`
        : '';

      return `
        <div class="cust-tx-row">
          <div class="cust-tx-info">
            <div class="cust-tx-date">${dateStr}</div>
            <div class="cust-tx-badges">${methodBadge}${pickupDateStr}${pickedAtStr}</div>
            <div class="cust-tx-items" title="${escapeHtml(itemNames)}">${escapeHtml(itemNames)}</div>
            ${it.note ? `<div style="font-size:10px; color:#8e8e93; margin-top:2px;">💬 ${escapeHtml(it.note)}</div>` : ''}
          </div>
          <div class="cust-tx-right">
            <div class="cust-tx-amount">${fmtUSD(amt)}</div>
            ${pickupBtn}
          </div>
        </div>
      `;
    }).join('');
  }

  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
      <div>
        <h2 style="font-size:22px; margin-bottom:4px;">👤 ${escapeHtml(c.name || '(이름 없음)')}</h2>
        <div style="font-size:13px; color:#8e8e93;">📞 ${escapeHtml(c.phone)}</div>
      </div>
      <button onclick="closeCustomerPopup()" style="background:none; border:none; font-size:24px; cursor:pointer; color:#8e8e93;">×</button>
    </div>

    <div class="cust-summary-grid">
      <div class="cust-stat">
        <div class="v">${c.totalSales + c.totalPreorders}</div>
        <div class="l">전체 거래 수</div>
      </div>
      <div class="cust-stat">
        <div class="v">${fmtUSD(totalAmount)}</div>
        <div class="l">전체 합계</div>
      </div>
      ${c.unpaid.count > 0 ? `
        <div class="cust-stat unpaid">
          <div class="v">${fmtUSD(c.unpaid.amount)}</div>
          <div class="l">미결제 외상 (${c.unpaid.count}건)</div>
        </div>
      ` : ''}
      ${c.pendingPreorder.count > 0 ? `
        <div class="cust-stat preorder">
          <div class="v">${fmtUSD(c.pendingPreorder.amount)}</div>
          <div class="l">예약중 (${c.pendingPreorder.count}건)</div>
        </div>
      ` : ''}
    </div>

    ${c.unpaid.count > 0 ? `
      <div class="cust-section unpaid">
        <div class="cust-section-title">📝 미결제 외상 (${c.unpaid.count}건)</div>
        ${renderTxRow(unpaidSales, 'sale')}
        <button class="cust-pay-all-btn" onclick="openBulkPayModal()">
          💰 ${fmtUSD(c.unpaid.amount)} 일괄 결제
        </button>
      </div>
    ` : ''}

    ${pendingPos.length > 0 ? `
      <div class="cust-section preorder">
        <div class="cust-section-title">📅 예약중 선주문 (${pendingPos.length}건)</div>
        ${renderTxRow(pendingPos, 'preorder')}
      </div>
    ` : ''}

    ${paidSales.length > 0 ? `
      <div class="cust-section paid">
        <div class="cust-section-title">✅ 결제 완료 (${paidSales.length}건)</div>
        ${renderTxRow(paidSales, 'sale')}
      </div>
    ` : ''}

    ${pickedUpPos.length > 0 ? `
      <div class="cust-section pickedup">
        <div class="cust-section-title">
          📦 픽업 완료 (${pickedUpPos.length}건)
          <span style="font-size:10px; color:#8e8e93; font-weight:500; margin-left:6px;">(결제완료에 포함됨)</span>
        </div>
        ${renderTxRow(pickedUpPos, 'preorder')}
      </div>
    ` : ''}

    ${refundedSales.length > 0 ? `
      <div class="cust-section" style="opacity:0.6;">
        <div class="cust-section-title">↩️ 환불 (${refundedSales.length}건)</div>
        ${renderTxRow(refundedSales, 'sale')}
      </div>
    ` : ''}

    ${cancelledPos.length > 0 ? `
      <div class="cust-section" style="opacity:0.6;">
        <div class="cust-section-title">❌ 취소된 선주문 (${cancelledPos.length}건)</div>
        ${renderTxRow(cancelledPos, 'preorder')}
      </div>
    ` : ''}

    <div style="text-align:center; margin-top:16px;">
      <button class="cust-btn-cancel" onclick="closeCustomerPopup()" style="padding:10px 30px;">닫기</button>
    </div>
  `;
}


/* 일괄 결제 모달 */
function openBulkPayModal() {
  // 현재 팝업의 미결제 합계 가져오기
  const popupBody = document.getElementById('customerPopupBody');
  const payAllBtn = popupBody.querySelector('.cust-pay-all-btn');
  if (!payAllBtn) return;

  // 버튼 텍스트에서 금액 추출 (간단 파싱)
  const m = payAllBtn.textContent.match(/\$([\d,]+\.\d{2})/);
  _currentBulkAmount = m ? Number(m[1].replace(/,/g, '')) : 0;
  _currentBulkMethod = '현금';

  document.getElementById('bulkPayInfo').innerHTML = `
    <div style="font-size:13px; color:#8e8e93;">결제 금액</div>
    <div style="font-size:28px; font-weight:700; color:#34c759;">${fmtUSD(_currentBulkAmount)}</div>
  `;
  document.getElementById('bulkVenmoBox').style.display = 'none';
  _updateBulkMethodButtons();
  document.getElementById('bulkPayModal').classList.add('active');
}

function closeBulkPay(e) {
  if (e && e.target && e.target.id !== 'bulkPayModal') return;
  document.getElementById('bulkPayModal').classList.remove('active');
}

function selectBulkMethod(m) {
  _currentBulkMethod = m;
  document.getElementById('bulkVenmoBox').style.display = m === 'Venmo' ? 'block' : 'none';
  _updateBulkMethodButtons();
}

function _updateBulkMethodButtons() {
  document.getElementById('bulkPmCash').classList.toggle('active', _currentBulkMethod === '현금');
  document.getElementById('bulkPmVenmo').classList.toggle('active', _currentBulkMethod === 'Venmo');
}

async function confirmBulkPay() {
  const btn = document.getElementById('bulkPayBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '처리 중...';

  try {
    const res = await api('payAllOutstanding', {
      phone: _currentCustomerPhone,
      method: _currentBulkMethod
    });
    if (res.success) {
      showToast(`✅ ${res.paidCount}건 일괄 결제 완료 (${fmtUSD(res.totalAmount)})`, 'success');
      closeBulkPay();
      // 팝업 다시 로드
      showCustomerPopup(_currentCustomerPhone, _currentCustomerCallback);
      // 페이지 새로고침 콜백
      if (_currentCustomerCallback) _currentCustomerCallback();
    } else {
      showToast(res.message || '실패', 'error');
    }
  } catch (err) {
    showToast('오류: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}


/* ─── 팝업 내 선주문 픽업 결제 ─── */
let _currentPickupPreorderId = null;
let _currentPickupAmount = 0;
let _currentPickupMethod = '현금';

function openPickupFromPopup(preorderId, amount) {
  _currentPickupPreorderId = preorderId;
  _currentPickupAmount = Number(amount) || 0;
  _currentPickupMethod = '현금';

  document.getElementById('popupPickupInfo').innerHTML = `
    <div style="font-size:13px; color:#8e8e93;">예약번호</div>
    <div style="font-size:13px; font-family:monospace; margin-bottom:8px;">${escapeHtml(preorderId)}</div>
    <div style="font-size:13px; color:#8e8e93;">결제 금액</div>
    <div style="font-size:24px; font-weight:700; color:#34c759;">${fmtUSD(_currentPickupAmount)}</div>
  `;
  document.getElementById('popupPickupVenmoBox').style.display = 'none';
  document.getElementById('popupPickupCreditBox').style.display = 'none';
  document.getElementById('popupPickupCashBox').style.display = 'block';
  document.getElementById('popupPickupTendered').value = '';
  document.getElementById('popupPickupChangeBox').style.display = 'none';
  _updatePopupPickupButtons();
  document.getElementById('popupPickupModal').classList.add('active');
}

function closePopupPickup(e) {
  if (e && e.target && e.target.id !== 'popupPickupModal') return;
  document.getElementById('popupPickupModal').classList.remove('active');
}

function selectPopupPickupMethod(m) {
  _currentPickupMethod = m;
  document.getElementById('popupPickupCashBox').style.display = m === '현금' ? 'block' : 'none';
  document.getElementById('popupPickupVenmoBox').style.display = m === 'Venmo' ? 'block' : 'none';
  document.getElementById('popupPickupCreditBox').style.display = m === '외상' ? 'block' : 'none';
  _updatePopupPickupButtons();
}

/* 현금 받은 금액 빠른 입력 */
function setPopupPickupTendered(amount) {
  const input = document.getElementById('popupPickupTendered');
  if (amount === 'exact') {
    input.value = _currentPickupAmount.toFixed(2);
  } else {
    input.value = Number(amount).toFixed(2);
  }
  updatePopupPickupChange();
}

/* 거스름돈 계산 */
function updatePopupPickupChange() {
  const tendered = Number(document.getElementById('popupPickupTendered').value) || 0;
  const change = tendered - _currentPickupAmount;
  const box = document.getElementById('popupPickupChangeBox');

  if (tendered <= 0) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  document.getElementById('popupPickupTenderedDisplay').textContent = fmtUSD(tendered);
  document.getElementById('popupPickupAmountDisplay').textContent = fmtUSD(_currentPickupAmount);

  const changeEl = document.getElementById('popupPickupChangeDisplay');
  const labelEl = document.getElementById('popupPickupChangeLabel');
  if (change < 0) {
    changeEl.textContent = fmtUSD(Math.abs(change));
    changeEl.style.color = '#ff3b30';
    labelEl.textContent = '⚠️ 부족:';
    labelEl.style.color = '#ff3b30';
  } else {
    changeEl.textContent = fmtUSD(change);
    changeEl.style.color = '#1c7c2f';
    labelEl.textContent = '💰 거스름돈:';
    labelEl.style.color = '#1c7c2f';
  }
}

function _updatePopupPickupButtons() {
  document.getElementById('popupPickupCash').classList.toggle('active', _currentPickupMethod === '현금');
  document.getElementById('popupPickupVenmo').classList.toggle('active', _currentPickupMethod === 'Venmo');
  document.getElementById('popupPickupCredit').classList.toggle('active', _currentPickupMethod === '외상');

  // 외상 강조
  const creditBtn = document.getElementById('popupPickupCredit');
  if (_currentPickupMethod === '외상') {
    creditBtn.style.background = '#ff3b30';
    creditBtn.style.color = 'white';
    creditBtn.style.borderColor = '#ff3b30';
  } else {
    creditBtn.style.background = '#fff5f5';
    creditBtn.style.color = '#c62828';
    creditBtn.style.borderColor = 'transparent';
  }
}

async function confirmPopupPickup() {
  const btn = document.getElementById('popupPickupBtn');
  const original = btn.textContent;

  // 현금/Venmo일 때 받은 금액 검증 + 부분 결제 옵션
  let tenderedAmount = _currentPickupAmount;
  let isPartial = false;

  if (_currentPickupMethod === '현금' || _currentPickupMethod === 'Venmo') {
    const input = document.getElementById('popupPickupTendered').value;
    if (input && Number(input) > 0) {
      tenderedAmount = Number(input);
      if (tenderedAmount < _currentPickupAmount) {
        const remain = _currentPickupAmount - tenderedAmount;
        if (!confirm(
          `받은 금액이 결제 금액보다 부족합니다.\n\n` +
          `결제 총액: ${fmtUSD(_currentPickupAmount)}\n` +
          `받은 금액: ${fmtUSD(tenderedAmount)}\n` +
          `외상 등록: ${fmtUSD(remain)}\n\n` +
          `[확인] 부분 결제로 처리 (잔액 외상 자동 등록)\n` +
          `[취소] 취소`
        )) {
          return;
        }
        isPartial = true;
      }
    }
  }

  btn.disabled = true;
  btn.textContent = '처리 중...';

  try {
    const res = await api('pickupPreorder', {
      preorderId: _currentPickupPreorderId,
      payment: {
        method: _currentPickupMethod,
        tendered: tenderedAmount,
        partialPay: isPartial
      }
    });
    if (res.success) {
      let msg = `✅ 픽업 완료 (${_currentPickupMethod})`;
      if (isPartial && res.partialPayment) {
        msg = `✅ 부분 결제 · 받음 ${fmtUSD(res.partialPayment.paid)} · 외상 ${fmtUSD(res.partialPayment.outstanding)}`;
      } else if (_currentPickupMethod === '현금' && tenderedAmount > _currentPickupAmount) {
        const change = tenderedAmount - _currentPickupAmount;
        msg += ` · 거스름돈 ${fmtUSD(change)}`;
      }
      showToast(msg, 'success');
      closePopupPickup();
      // 팝업 다시 로드
      showCustomerPopup(_currentCustomerPhone, _currentCustomerCallback);
      // 페이지 새로고침 콜백
      if (_currentCustomerCallback) _currentCustomerCallback();
    } else {
      showToast(res.message || '실패', 'error');
    }
  } catch (err) {
    showToast('오류: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
