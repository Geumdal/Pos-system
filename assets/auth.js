/* ============================================================
 * 관리자 페이지 인증 (Admin Authentication)
 * ============================================================
 * - 모든 관리자 페이지에서 페이지 로드 즉시 호출
 * - 인증되지 않으면 페이지 콘텐츠 숨기고 로그인 화면 표시
 * - 비밀번호: config.js의 ADMIN_PASSWORD에서 가져옴
 * - 인증 후 sessionStorage에 토큰 저장 (탭 닫으면 초기화됨)
 *
 * 사용법:
 *   <script src="config.js"></script>
 *   <script src="assets/auth.js"></script>
 *   <body> 첫 줄에 자동으로 인증 검사
 * ============================================================ */

(function() {
  'use strict';

  const AUTH_KEY = 'gd_admin_auth_v1';
  const AUTH_VALUE = 'authenticated';

  // config.js의 ADMIN_PASSWORD 사용 (없으면 기본값)
  const ADMIN_PASSWORD = (typeof window.ADMIN_PASSWORD !== 'undefined')
    ? window.ADMIN_PASSWORD
    : 'garden2026';

  /* 인증 상태 확인 */
  function isAuthenticated() {
    try {
      return sessionStorage.getItem(AUTH_KEY) === AUTH_VALUE;
    } catch (e) {
      return false;
    }
  }

  /* 로그인 처리 */
  function login(password) {
    if (password === ADMIN_PASSWORD) {
      try {
        sessionStorage.setItem(AUTH_KEY, AUTH_VALUE);
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  /* 로그아웃 */
  function logout() {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {}
    location.reload();
  }

  /* 로그인 화면 표시 */
  function showLoginScreen() {
    // 페이지 콘텐츠를 가리는 오버레이
    const overlay = document.createElement('div');
    overlay.id = 'gd-auth-overlay';
    overlay.innerHTML = `
      <style>
        #gd-auth-overlay {
          position: fixed; inset: 0;
          background: linear-gradient(135deg, #1d1d1f 0%, #2c2c2e 100%);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
        }
        #gd-auth-box {
          background: white;
          border-radius: 20px;
          padding: 32px 28px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        #gd-auth-box h1 {
          font-size: 22px;
          font-weight: 700;
          color: #1d1d1f;
          margin: 0 0 8px;
          text-align: center;
        }
        #gd-auth-box .sub {
          font-size: 13px;
          color: #8e8e93;
          text-align: center;
          margin-bottom: 24px;
        }
        #gd-auth-box .icon {
          font-size: 48px;
          text-align: center;
          margin-bottom: 12px;
        }
        #gd-auth-box label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #1d1d1f;
          margin-bottom: 6px;
        }
        #gd-auth-input {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid #e5e5ea;
          border-radius: 12px;
          font-size: 16px;
          font-family: inherit;
          background: #f9f9fb;
          margin-bottom: 14px;
          box-sizing: border-box;
        }
        #gd-auth-input:focus {
          outline: none;
          border-color: #007aff;
          background: white;
        }
        #gd-auth-btn {
          width: 100%;
          padding: 14px;
          background: #007aff;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
        #gd-auth-btn:hover { background: #0066d6; }
        #gd-auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        #gd-auth-error {
          font-size: 13px;
          color: #ff3b30;
          text-align: center;
          margin-top: 12px;
          min-height: 18px;
        }
        #gd-auth-hint {
          font-size: 11px;
          color: #8e8e93;
          text-align: center;
          margin-top: 16px;
          line-height: 1.5;
        }
      </style>
      <div id="gd-auth-box">
        <div class="icon">🔒</div>
        <h1>관리자 인증</h1>
        <div class="sub">가든교회 물품 판매 관리 시스템</div>
        <label for="gd-auth-input">비밀번호</label>
        <input type="password" id="gd-auth-input" placeholder="비밀번호 입력..." autocomplete="off">
        <button id="gd-auth-btn">🔓 접속</button>
        <div id="gd-auth-error"></div>
        <div id="gd-auth-hint">권한이 없으시다면 회계 담당자에게 문의하세요</div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 페이지 컨텐츠 스크롤 차단
    document.body.style.overflow = 'hidden';

    // 입력 처리
    const input = document.getElementById('gd-auth-input');
    const btn = document.getElementById('gd-auth-btn');
    const errEl = document.getElementById('gd-auth-error');

    function attempt() {
      const pwd = input.value;
      if (!pwd) {
        errEl.textContent = '비밀번호를 입력하세요';
        input.focus();
        return;
      }
      if (login(pwd)) {
        // 인증 성공 → 오버레이 제거
        overlay.remove();
        document.body.style.overflow = '';
      } else {
        errEl.textContent = '❌ 비밀번호가 일치하지 않습니다';
        input.value = '';
        input.focus();
        // 흔들림 효과
        const box = document.getElementById('gd-auth-box');
        box.style.animation = 'shake 0.4s';
        setTimeout(() => { box.style.animation = ''; }, 400);
      }
    }

    btn.addEventListener('click', attempt);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') attempt();
    });

    // 자동 포커스
    setTimeout(() => input.focus(), 100);

    // 흔들림 키프레임 추가
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-8px); }
        75% { transform: translateX(8px); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  /* 페이지 로드 즉시 인증 체크 */
  function init() {
    if (!isAuthenticated()) {
      showLoginScreen();
    }
  }

  // DOM 준비되면 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 전역에 logout 함수 노출 (로그아웃 버튼용)
  window.adminLogout = logout;
  window.isAdminAuthenticated = isAuthenticated;
})();
