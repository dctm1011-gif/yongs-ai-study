# CLAUDE.md — Yong's AI Study Project

> 이 파일은 Claude가 새 세션을 시작할 때 반드시 먼저 읽어야 하는 프로젝트 컨텍스트입니다.
> 세션마다 이 파일을 먼저 읽고 작업하세요.

---

## 프로젝트 한 줄 요약

**HBM·DRAM·반도체 회로설계 분야 논문을 arXiv·Semantic Scholar에서 자동 검색·분류하고, 웹 기반 포털에서 PC·모바일 어디서든 관리하는 개인 학술 논문 시스템**

---

## 사용자 정보

- **이름**: Yong (yong, dctm1)
- **분야**: HBM / DRAM 반도체 회로설계 엔지니어
- **사용 패턴**: PC + 모바일(iOS) 동시 사용, 기기 간 동기화 필수
- **성격**: 직접적, 간결함 선호. 물어보지 말고 알아서 처리. Yes/No 프롬프트 없이 진행.

---

## 절대 규칙 (어기면 데이터 손실)

### ❌ NEVER — `history/generate.py` 직접 실행 금지
- 이유: `history/index.html` 전체 재생성 → 커스텀 기능 전부 초기화됨
- 손실 범위: 서버 동기화, BFCache, 읽음 배지, 기기 간 동기화, 원문 분석 탭 등
- **대신**: `python history/inject_papers.py N` 사용 (증분 추가, 배포까지 자동)

### ❌ col-card를 기존 카드 앞에 삽입 금지
- 이유: `col_read_set`이 인덱스(숫자) 기반 → 앞에 삽입하면 인덱스 밀려서 읽음 상태 깨짐
- **대신**: 항상 `<!-- 히스토리 탭` 마커 직전(= 끝)에 추가

### ❌ PowerShell 명령 실행 시 권한 확인 프롬프트 띄우지 말 것
- 항상 `dangerouslyDisableSandbox: true` 사용

---

## 아키텍처 개요

```
[검색] batch_search.py → arXiv / Semantic Scholar API
          ↓
[처리] tagger.py (21개 태그) + summarizer.py (한글 번역) + figure_extractor.py
          ↓
[저장] Obsidian Vault (C:\Users\dctm1\OneDrive\문서\Obsidian Vault\Papers)
          ↓
[웹 생성] inject_papers.py (증분) / generate.py (전체 재생성, 위험)
          ↓
[배포] inject_papers.py 내부에서 자동: netlify deploy --prod
          ↓
[열람] https://illustrious-cuchufli-7c4e58.netlify.app/history/
       또는 로컬: http://{LAN_IP}:5000/history/
          ↓
[동기화] 좋아요·삭제·읽음·숨김 → Netlify Blobs (/api/prefs)
```

---

## 핵심 파일 맵

| 파일 | 역할 | 주의사항 |
|------|------|----------|
| `history/index.html` | 논문 분류·정리 앱 (7.5MB, 196개 논문, 61개 col-card) | 직접 편집 시 백업 필수 |
| `history/inject_papers.py` | 새 논문 추가 + col-card 동기화 + Netlify 자동 배포 | 논문 업데이트의 표준 진입점 |
| `history/generate.py` | 전체 HTML 재생성 (위험) | 실행 금지, 경고 주석 있음 |
| `history/reorder_col_cards.py` | col-card 순서 재정렬 (일회성 사용됨) | 다시 실행하면 인덱스 깨짐 |
| `paper_search/user_prefs.json` | liked(61개)·deleted(124개)·read([])·hide_liked 저장 | 서버 동기화 원본 |
| `paper_search/column_notes.json` | 주요 논문별 headline·why·hbm_perspective | col-card 상세 내용 소스 |
| `paper_search/config.json` | 15개 검색 쿼리 정의 + Obsidian 경로 | |
| `papers/paper-1.html` ~ `paper-11.html` | 개별 논문 섹션별 에세이 분석 | 논문 추가 시 새로 생성 필요 |
| `papers/paper.css` | 개별 논문 페이지 스타일 | |
| `netlify/functions/prefs.mjs` | Netlify Blobs 기반 /api/prefs 엔드포인트 | |
| `netlify.toml` | Netlify 빌드 설정 (publish = ".") | |
| `server.py` | 로컬 서버 (port 5000, CORS 포함) | Task Scheduler 자동 시작 등록됨 |
| `diagrams/paper-automation.html` | 전체 워크플로우 블럭다이어그램 | |

---

## "논문 리뷰 업데이트" 요청 시 전체 플로우 (블럭다이어그램 기반)

사용자가 "논문 업데이트해줘" 또는 "논문 리뷰 업데이트"라고 하면:

### Step 1 — 취향 분석
`user_prefs.json`의 liked 목록 확인 → 좋아요 논문 카테고리 분포·키워드 파악

### Step 2 — 논문 검색·선정
`batch_search.py` 또는 `inject_papers.py N` 실행 → 새 논문 N개 선정

### Step 3 — 두 가지를 동시에 처리 (Parallel)
**A. 논문 분류 (history/index.html)**
- `inject_papers.py`가 col-card 블록 추가 + Netlify 자동 배포

**B. 개별 분석 HTML 생성 (papers/paper-N.html) ← 이게 핵심!**
- 각 신규 논문마다 `papers/paper-N.html` 파일 생성
- 구조: Introduction(INTRO), Proposed Method(I), Results(II), 설계 관점(III), 논문 그림
- 에세이 스타일 한국어, insight 박스, stat-box, tooltip 포함
- `paper.css`와 `tooltip.js` 참조

### Step 4 — 링크 패치
`history/index.html`의 `PAPER_ANALYSIS_LINKS` 딕셔너리에 새 인덱스 추가
```javascript
const PAPER_ANALYSIS_LINKS = {
  0: '../papers/paper-1.html',
  ...
  11: '../papers/paper-12.html',  // ← 신규 추가
};
```

### Step 5 — 배포
`inject_papers.py`가 자동으로 `netlify deploy --prod` 실행

---

## 논문 정리 탭 UI 구조 (중요)

```
논문 정리 탭 (page-columns)
├── section-header: "좋아요 표시한 논문 · Claude 원문 분석"
├── col-paper-list (번호 목록, buildColNavigation()으로 동적 생성)
│   └── col-paper-li × N개 (클릭 시 showColPaper(idx) 호출)
│       ├── col-li-title
│       ├── col-li-sub (headline)
│       └── col-rdbadge (읽음 배지, id="col-rdbadge-{idx}")
│
└── col-card × N개 (기본 hidden, showColPaper로 표시)
    ├── [인덱스 0-10] 원본 11개 — col-headline 있음, paper-X.html 링크 있음
    │   └── .col-analysis-wrap (클릭 시 _buildAnalysisTabs()로 동적 생성)
    │       ├── [INTRO] [I] [II] [III] [IV] [그림] 탭 버튼
    │       └── 각 섹션 내용 (paper-N.html에서 fetch)
    └── [인덱스 11-60] 신규 liked 논문 50개 — paper-N.html 없으면 탭 미생성
```

**col_read_set**: localStorage에 인덱스 배열로 저장. 인덱스 순서 바뀌면 읽음 상태 깨짐.

---

## 기기 간 동기화 구조

```javascript
// _syncToServer() — 상태 변경 시 자동 호출
// 동기화 대상: liked, deleted, read[], hide_liked
// 동기화 제외: file:// 프로토콜 (로컬 파일 직접 열기)
// 동기화 대상: https:// (로컬 서버 + Netlify 모두)
```

- 로컬 서버 (`server.py`): `/api/prefs` GET/POST → `user_prefs.json`
- Netlify: `netlify/functions/prefs.mjs` → `@netlify/blobs`
- BFCache 대응: `pageshow` 이벤트에서 `_loadFromServer()` 재실행

---

## 배포 관련

| 항목 | 값 |
|------|-----|
| Netlify URL | https://illustrious-cuchufli-7c4e58.netlify.app |
| 로컬 서버 | http://localhost:5000 (LAN: http://{IP}:5000) |
| 자동 배포 | `inject_papers.py` 실행 시 자동으로 `netlify deploy --prod` 호출 |
| Task Scheduler | "YongAIStudyServer" — 로그인 시 server.py 자동 시작 |
| 방화벽 | pythonw.exe 포트 5000 인바운드 허용 규칙 추가됨 |

---

## papers/paper-N.html 작성 규칙

```html
<!-- 기본 구조 -->
<link rel="stylesheet" href="paper.css">
<script src="tooltip.js" defer></script>

<div class="top-bar">
  <a class="back-link" href="../history/index.html#columns">← 논문 정리</a>
  ...
</div>
<div class="article">
  <div class="article-venue">학회명 연도</div>
  <h1 class="article-title">논문 제목</h1>
  <p class="opener">한 문장 핵심 요약</p>

  <div class="section">
    <div class="section-label">Introduction</div>
    <h2 class="section-title">...</h2>
    <p>...</p>
    <div class="insight blue"><div class="insight-label">...</div><p>...</p></div>
  </div>

  <div class="section">
    <div class="section-label">Proposed Method</div>
    ...
  </div>

  <div class="section">
    <div class="section-label">Results</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num">수치</div><div class="stat-desc">설명</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-label">설계 관점에서 보면요</div>
    ...
  </div>

  <div class="section">
    <div class="section-label">논문 그림</div>
    ...
  </div>
</div>
```

- 에세이 스타일 한국어 (딱딱하지 않게, "~에요" 체)
- insight 색상: `blue`(중요 아이디어), `green`(장점), `yellow`(주의점)
- arXiv HTML fetch 실패 시: Claude 사전학습 지식으로 채움
- 이미지 직접 삽입 안 함 (파일 크기 제한) → 원문 링크로 대체

---

## 관심 분야 (검색 키워드)

**핵심**: HBM PSIJ, HBM I/O SI-PI, DRAM ECC, RowHammer, DRAM Refresh, CDR jitter, PLL jitter, High-speed SerDes
**테스트/검증 회로**: BIST, MISR, LFSR, Scan Chain, DFT, ATPG, March Test, CRC, Parity
**회로 기초**: adder/multiplier, carry-lookahead, comparator, charge pump, flip-flop timing, sense amplifier
**다양성**: VLSI analog, LDO, PDN(회로레벨), POR/BOR, DRAM 내부 전류

**선호 학회**: arXiv, IEEE VLSI, ISSCC, CICC, IEEE Trans. VLSI, IEEE Trans. CPMT

---

## config.json 쿼리 업데이트 원칙 (필독)

> 유저가 "X 추가해줘"라고 말하면 **기존 쿼리는 유지하고 X 쿼리만 append**.
> 절대로 기존 쿼리를 삭제하거나 전면 교체하지 말 것.

유저의 취향은 두 축으로 학습된다:
1. **과거 이력**: 좋아요 누른 논문 태그 분포 / 삭제한 논문 태그 분포 → 쿼리 limit 조절에 반영
2. **현재 관심사**: 유저가 명시적으로 언급한 새 주제 → 신규 쿼리 append

삭제 이력이 많은 유형(시스템 레벨 패키징/열해석/TSV PDN)은 limit 축소 또는 제거 가능.
그 외 기존 쿼리는 항상 유지.

---

## 현재 상태 (2026-06-22 기준)

- 논문 분류: 196개 논문 카드
- 논문 정리: 61개 col-card (인덱스 0-10: 원본 11개 / 11-60: liked 동기화 50개)
- paper-N.html: paper-1.html ~ paper-61.html (61개 전부 완성 분석본)
  - paper-1 ~ paper-61: 전부 전체 분석 완료 (Introduction/Method/Results/설계관점/Figure 갤러리)
  - placeholder 파일 0개
- liked: 61개 / deleted: 124개 / read: 서버 동기화 완료
- Netlify 배포: 완료 (자동 배포 파이프라인 연결됨)
- 주간 자동 업데이트: YongAIStudyWeeklyUpdate (매주 일요일 09:00)

---

## 자동화 현황 (전부 완료)

| 자동화 항목 | 방법 | 주기 |
|------------|------|------|
| 서버 자동 시작 | Task Scheduler "YongAIStudyServer" | 로그인 시 |
| 일일 논문 검색 + 배포 | Task Scheduler "YongAIStudyWeeklyUpdate" → auto_update.py | 매일 새벽 05:00 |
| 논문 추가 시 paper-N.html 전체 분석 생성 | inject_papers.py → create_paper_html.py → **Claude API 자동 호출** | inject 시 자동 |
| PAPER_ANALYSIS_LINKS 업데이트 | create_paper_html.py → _patch_analysis_links() | paper-N.html 생성 시 자동 |
| Netlify 자동 배포 | inject_papers.py 마지막에 netlify deploy --prod | inject 시 자동 |
| 기기 간 동기화 | Netlify Blobs /api/prefs | 상태 변경 시 자동 |
| 읽음/좋아요/숨기기 sync | _syncToServer() → pageshow 복원 | 상태 변경 시 자동 |

### create_paper_html.py Claude API 자동 분석
- `_generate_analysis_with_claude(paper)` 함수가 Claude API(`claude-sonnet-4-6`) 호출
- 논문 제목·초록·학회·태그 → JSON 형식 분석 요청
- 반환: opener, intro, method, results(stat-box 포함), 설계관점, figure 4개
- API 실패 시 placeholder fallback (기존 동작 유지)
- `ANTHROPIC_API_KEY` 환경변수 필요 (summarizer.py와 동일)

## 자주 쓰는 명령어

```powershell
# 논문 업데이트 (새 논문 추가 + 자동 배포)
cd "C:\Users\dctm1\OneDrive\바탕 화면\CLAUDE_PROJECT_1"
python history/inject_papers.py 20

# 배치 검색 (Obsidian 저장)
cd paper_search
python batch_search.py

# 로컬 서버 시작
cd "C:\Users\dctm1\OneDrive\바탕 화면\CLAUDE_PROJECT_1"
Start-Process pythonw.exe -ArgumentList server.py

# 수동 Netlify 배포
netlify deploy --prod
```

---

## Discord 통합 (모바일 알림 + yes/no 응답)

- **설정 파일**: `paper_search/discord_config.json` (bot_token, channel_id, guild_id)
- **유틸리티**: `history/discord_utils.py`
  - `notify(text)` — 채널에 단방향 알림 전송
  - `ask_yes_no(question, timeout=300, default=None)` — yes/no 질문 전송 후 폴링 대기
- **연동 스크립트**:
  - `inject_papers.py` — Netlify 배포 성공/실패 시 Discord 알림
  - `auto_update.py` — 주간 업데이트 시작/실패 시 Discord 알림
- **알림 예시**: `inject_papers.py` 실행 → 배포 완료 → Discord에 "✅ 논문 포털 배포 완료!" + 링크

---

## 이전 세션에서 발생한 실수 패턴 (반복하지 말 것)

1. `generate.py` 실행 제안 — 절대 금지
2. col-card를 앞에 삽입 — 인덱스 깨짐
3. PowerShell에서 `✓` 등 특수문자 print — cp949 인코딩 오류
4. subprocess에서 `netlify` 배열 실행 — Windows에서 `.cmd` 필요, `shell=True` 사용
5. `_syncToServer()`에서 `.netlify.app` 차단 — Netlify 배포 후 동기화 안 됨 (수정 완료)
6. `論문 리뷰 업데이트` 시 `paper-N.html` 생성 빠뜨림 — INTRO/I/II 탭 미작동 원인
