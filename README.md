# 🚀 POS 시스템 배포 가이드

GitHub Pages + Apps Script API 구조로 배포합니다. 한 번 설정하면 카메라가 정상 작동하고, 페이지 로딩도 훨씬 빨라집니다.

## 📋 전체 흐름

```
┌────────────────────────┐         ┌──────────────────────────┐         ┌────────────────┐
│  GitHub Pages          │ fetch() │  Apps Script (API)       │  read   │  Google Sheets │
│  사용자 화면 (HTML/JS) │ ──────> │  /exec (JSON 응답)       │ ──────> │  데이터 저장   │
│  카메라 자유 사용 ✓    │ <────── │  CORS 자동 설정          │ <────── │                │
└────────────────────────┘         └──────────────────────────┘         └────────────────┘
```

소요 시간: **약 20–30분** (처음 한 번만)

---

## ⚠️ 먼저 GitHub 계정 준비

GitHub 계정이 없으면 [github.com/signup](https://github.com/signup)에서 무료 가입.
이미 있으면 바로 다음 단계로.

---

## 1️⃣ Apps Script 백엔드 재배포 (5분)

새 `Code.gs`는 HTML을 안 보내고 JSON만 반환합니다. 액세스 권한도 "모든 사용자"로 변경해야 GitHub Pages에서 호출할 수 있습니다.

### 단계

1. **Apps Script 에디터 열기** (기존 프로젝트)
2. `Code.gs` 전체 선택 → 삭제 → **새 Code.gs 내용 붙여넣기**
3. 💾 저장 (Ctrl+S)
4. 우측 상단 **배포 → 배포 관리**
5. 활성 배포 옆 **✏️ 연필 아이콘** 클릭
6. 설정 변경:
   - **버전**: 새 버전
   - **다음으로 실행**: 본인 (나)
   - **액세스 권한**: ⚠️ **모든 사용자** 로 변경 (이전엔 "본인만"이었을 수 있음)
7. **배포** 클릭
8. **웹앱 URL 복사** (`https://script.google.com/macros/s/AKfyc.../exec`)

### URL 작동 확인 (브라우저에서)

복사한 URL 끝에 `?action=ping`을 붙여서 새 탭에서 열어보세요:
```
https://script.google.com/macros/s/AKfyc.../exec?action=ping
```

다음과 같이 보이면 성공입니다:
```json
{"success":true,"time":"2026-04-25T...","version":"api-v1"}
```

> **에러가 보인다면**: 액세스 권한이 "모든 사용자"가 아니거나, 새 버전으로 배포가 안 된 상태입니다. 위 단계 다시 확인.

---

## 2️⃣ GitHub 저장소 만들기 (3분)

1. [github.com](https://github.com) 로그인
2. 우측 상단 **+** → **New repository**
3. 설정:
   - **Repository name**: `pos-system` (자유롭게 정해도 됨)
   - **Public** 선택 ⭐ (Private은 GitHub Pages 무료 사용 시 제약 있음)
   - **Add a README file** ✅ 체크
4. **Create repository** 클릭

저장소가 만들어집니다.

---

## 3️⃣ 파일 업로드 (5분)

가장 쉬운 방법: 웹에서 드래그 앤 드롭

### 단계

1. 만든 저장소 페이지에서 **Add file → Upload files** 클릭
2. **다운로드 받은 `pos_frontend/` 폴더** 안의 파일들을 드래그 앤 드롭:
   - `index.html`
   - `pos.html`
   - `stockin.html`
   - `stats.html`
   - `qr.html`
   - `admin.html`
   - `config.js`
   - `assets/` 폴더 (안에 `api.js` 포함)

   **중요**: `assets/api.js`도 같이 올려야 합니다. `assets`라는 폴더 구조 그대로 유지!

3. 페이지 하단의 커밋 메시지에 "POS 시스템 초기 업로드" 같은 설명 입력
4. **Commit changes** 클릭

### 폴더 구조 확인

업로드 후 저장소 메인 페이지에 다음과 같이 보여야 합니다:

```
📁 assets/
   └── 📄 api.js
📄 admin.html
📄 config.js
📄 index.html
📄 pos.html
📄 qr.html
📄 README.md (자동 생성됨)
📄 stats.html
📄 stockin.html
```

---

## 4️⃣ config.js 확인 (필요 시 수정)

저장소 페이지에서 **`config.js`** 클릭 → **연필 아이콘**으로 편집.

`window.API_URL`이 본인 Apps Script URL인지 확인하세요. 이미 사용자의 URL이 들어가 있을 거예요:

```javascript
window.API_URL = 'https://script.google.com/macros/s/AKfycbyGnY-W8NxfK7YclXG6XQ6LXbPCtshm64ZXc6KXmx53FRBgx7_vBc-tjVWxoTp2doVYgA/exec';
```

만약 1단계에서 **새로 배포해서 URL이 바뀌었다면** 새 URL로 교체 → **Commit changes** 클릭.

> 보통 같은 프로젝트에서 "새 버전" 배포는 URL을 바꾸지 않습니다. 변경되는 건 새 프로젝트로 배포할 때뿐.

---

## 5️⃣ GitHub Pages 활성화 (3분)

이제 저장소를 웹사이트로 공개합니다.

1. 저장소 페이지 상단의 **Settings** 클릭
2. 좌측 메뉴에서 **Pages** 클릭
3. **Source**: `Deploy from a branch` 선택
4. **Branch**:
   - `main` 선택
   - 폴더는 `/ (root)` 선택
5. **Save** 클릭

잠시 후 페이지 위쪽에 다음과 같이 표시됩니다:

```
✅ Your site is live at https://YOUR_USERNAME.github.io/pos-system/
```

이 URL이 본인 POS 시스템의 웹주소입니다. (만들어지는데 1–5분 정도 걸림)

---

## 6️⃣ 접속 테스트 (3분)

### PC에서 먼저 테스트

GitHub Pages URL을 새 탭에서 열어보세요:
```
https://YOUR_USERNAME.github.io/pos-system/
```

자동으로 `pos.html`로 리다이렉트되며 POS 화면이 표시됩니다. 제품 목록이 잘 보이면 API 연결 성공!

### 모바일에서 카메라 테스트

같은 URL을 모바일 Chrome에서 열기:

1. **📥 입고** 메뉴 클릭
2. 카메라 권한 허용
3. 카메라가 정상 작동하는지 확인

이제 카메라가 잘 작동할 겁니다 — Apps Script iframe이 아니라 본인 도메인이니까요.

### 홈 화면에 추가 (모바일)

자주 쓰시려면 홈 화면 아이콘으로 만드세요:

**Android Chrome**: 우측 상단 ⋮ → 홈 화면에 추가
**iOS Safari**: 하단 공유 → 홈 화면에 추가

---

## 🔧 문제 해결

| 증상 | 원인 / 해결 |
|------|-----------|
| 화면은 뜨는데 "불러오는 중..."에서 멈춤 | `config.js`의 `API_URL`이 잘못됨. `?action=ping`으로 직접 확인 |
| 콘솔에 CORS 에러 | Apps Script 액세스 권한이 "모든 사용자"가 아님. 1단계 6번 다시 확인 |
| 콘솔에 `Network error` | 배포 URL이 `/dev`로 끝나면 안 됨. 반드시 `/exec`로 끝나는 정식 배포 URL 사용 |
| 페이지 링크 클릭 시 404 | GitHub Pages는 대소문자 구분. 파일명이 모두 소문자 (`pos.html`)인지 확인 |
| 변경 사항이 반영 안 됨 | GitHub Pages는 1–5분 캐시. 잠시 기다린 후 강제 새로고침 (Ctrl+Shift+R) |
| 카메라가 또 안 됨 | URL이 `googleusercontent.com`이 아닌 `github.io`인지 확인. `googleusercontent.com`이면 Apps Script URL을 잘못 사용 중 |

---

## 🔄 향후 코드 수정 시 워크플로

### 백엔드(Code.gs) 수정

1. Apps Script 에디터에서 수정 → 저장
2. **배포 → 배포 관리 → ✏️ → 새 버전 → 배포**

### 프론트엔드 수정

1. GitHub 저장소에서 해당 파일 클릭 → 연필 → 수정 → Commit
2. 또는 PC에서 [GitHub Desktop](https://desktop.github.com) 설치 후 git push
3. GitHub Pages가 1–2분 후 자동 배포

---

## 📁 파일 역할

| 파일 | 역할 |
|------|------|
| `index.html` | pos.html로 자동 리다이렉트 (홈 페이지) |
| `pos.html` | 메인 판매 화면 |
| `stockin.html` | 입고 처리 (카메라 사용) |
| `stats.html` | 매출 통계 대시보드 |
| `qr.html` | QR 코드 스티커 생성 |
| `admin.html` | 제품 관리 (등록/수정/삭제/일괄 가져오기) |
| `config.js` | API URL 설정 (한 줄) |
| `assets/api.js` | 공통 API 호출 헬퍼 |

각 HTML 페이지 상단 메뉴에서 다른 페이지로 자유롭게 이동할 수 있습니다.

---

## 🌐 (선택) 커스텀 도메인 연결

`pos.gardenchurch.com` 같은 본인 도메인을 쓰고 싶으시면:

1. 도메인 등록 업체에서 CNAME 레코드를 `YOUR_USERNAME.github.io`로 설정
2. GitHub 저장소 → Settings → Pages → Custom domain에 도메인 입력
3. HTTPS 자동 활성화

이건 옵션이고, 기본 `github.io` URL로도 모든 기능 정상 작동합니다.
