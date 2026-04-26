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
