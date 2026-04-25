/* ============================================================
 * POS 시스템 - API 클라이언트 헬퍼
 * ============================================================
 * 사용법:
 *   const res = await api('getProducts');
 *   const res = await api('processSale', { items, payment });
 *
 * 모든 호출이 Apps Script API에 fetch로 전달됩니다.
 * google.script.run을 대체합니다.
 * ============================================================ */

// ⚠️ config.js에서 API_URL을 정의하세요!
// 예: window.API_URL = 'https://script.google.com/macros/s/AKfyc.../exec';
if (typeof window.API_URL === 'undefined') {
  console.error('⚠️ config.js에서 API_URL을 설정하세요!');
}

/**
 * Apps Script API 호출
 * @param {string} action - API 액션 이름 (예: 'getProducts')
 * @param {object} params - 파라미터 (선택)
 * @returns {Promise<object>} - { success: true/false, ... }
 */
async function api(action, params) {
  if (!window.API_URL || window.API_URL.indexOf('YOUR_') === 0) {
    return {
      success: false,
      message: '⚠️ config.js에서 API_URL을 설정하세요'
    };
  }

  const body = Object.assign({ action: action }, params || {});

  try {
    const response = await fetch(window.API_URL, {
      method: 'POST',
      // text/plain: CORS preflight 회피 (Apps Script 표준 패턴)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });

    if (!response.ok) {
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    return {
      success: false,
      message: '네트워크 오류: ' + (err.message || err)
    };
  }
}

/**
 * 화폐 표시 - $1,234.56 형식
 */
function fmtUSD(amount) {
  const n = Number(amount) || 0;
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * HTML 이스케이프 (XSS 방지)
 */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/**
 * JS 속성에 안전하게 삽입
 */
function escapeAttr(str) {
  return String(str).replace(/['"\\]/g, m => '\\' + m);
}

/**
 * 토스트 메시지 (각 페이지에 #toast div 필요)
 */
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  setTimeout(() => t.classList.remove('show'), 2500);
}
