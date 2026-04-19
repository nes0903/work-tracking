# Calendar 뷰 계획

> 작성된 태스크를 중심으로, 수집된 모든 소스(Notion / GitHub / LINE WORKS / 파일 저장소)의 이벤트를
> **월간 달력 + 날짜별 섹션 패널** 로 한눈에 확인한다.

---

## 1. UX 설계

### 레이아웃 — 2단 분할

```
┌─ Calendar ────────────────────────────────────────────────────┐
│ [< 2026-04 >]                                         [오늘]  │
│                                                              │
│ ┌──────────────────────┐  ┌────────────────────────────────┐ │
│ │   월   화   수 ...   │  │ 2026-04-20 (월)                │ │
│ │  1   2   3   4   ... │  │                                │ │
│ │  ●●  ●       ●●●     │  │ ─ 태스크 (3) ─                 │ │
│ │                      │  │   [H] 통계 API 검증            │ │
│ │ ...                  │  │   [M] 회의록 정리              │ │
│ │                      │  │                                │ │
│ │                      │  │ ─ Notion (2) ─                 │ │
│ │                      │  │   Product / 로드맵 v3          │ │
│ │                      │  │                                │ │
│ │                      │  │ ─ GitHub (5) ─                 │ │
│ │                      │  │   feat: add pagination ...     │ │
│ │                      │  │                                │ │
│ │                      │  │ ─ LINE WORKS (4) ─             │ │
│ │                      │  │   DM · 홍길동: "...."          │ │
│ │                      │  │                                │ │
│ │                      │  │ ─ 파일 (1) ─                   │ │
│ │                      │  │   📎 meeting.xlsx              │ │
│ └──────────────────────┘  └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 상호작용
- 월 이동: `<` `>` 버튼, 키보드 좌/우는 후속
- 오늘 버튼: 오늘이 있는 월로 점프 + 오늘 선택
- 날짜 셀 하단 점(dot): 소스별 색상 dot 또는 단순 숫자 카운트 (MVP 는 숫자)
- 날짜 클릭 → 우측 패널에 해당 날짜의 5개 섹션 렌더
- 빈 섹션은 "없음" 한 줄로 접힘
- 각 이벤트 항목은 원본 열기(노션 URL, GH URL, 첨부 presigned, 태스크 drawer 등)

---

## 2. 데이터 소스 및 날짜 매칭

| 소스 | DB 테이블 | 집계 기준 | 카운팅 범위 |
|---|---|---|---|
| 태스크 | `tasks` | `work_date` | 월 전체 |
| Notion | `notion_update_events` | `edited_at` 우선, 없으면 `received_at` | 월 전체 |
| GitHub 커밋 | `github_commit_events` | `occurred_at` | 월 전체 |
| GitHub PR | `github_pr_events` | `occurred_at` | 월 전체 |
| LINE WORKS | `line_works_messages` | `issued_at` 우선, 없으면 `received_at` | 월 전체 |
| 파일 저장소 | `line_works_attachments` | `uploaded_at` | 월 전체 |

모두 **해당 월의 UTC 해석 대신 local date 문자열 prefix** 로 매칭 (sqlite 의 `date(column)` 사용).

---

## 3. API — `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

### 응답
```ts
{
  ok: true,
  range: { from: string; to: string },
  days: Record<string /* YYYY-MM-DD */, {
    tasks: TaskSummary[],
    notion: NotionSummary[],
    github: GithubEventSummary[],
    lineWorks: LineWorksSummary[],
    storage: StorageSummary[],
  }>
}
```

### 타입 — 필요한 최소 필드만
- `TaskSummary`: id / title / priority / status / workDate / dueTime / assigneeName
- `NotionSummary`: eventId / title / url / section / parent / editedAt
- `GithubEventSummary`: kind(`commit`|`pr`) / repo / title / url / occurredAt / author
- `LineWorksSummary`: messageId / channelId / channelTitle / userId / text(앞 60자) / issuedAt / contentType
- `StorageSummary`: id / fileName / mimeType / fileSize / uploadedAt / channelId

월 30일 × 5 소스 × 수건 수준이면 flat 조회 후 프론트에서 groupBy 해도 충분. 서버에서 한 번에 `{ days }` 형태로 그룹핑해서 보낸다.

---

## 4. 구현 Phase

### Phase 1 — MVP (이번 라운드)
- 백엔드: 단일 엔드포인트 `/api/calendar` + `calendar-db.ts` 조회 유틸
- 프론트: `CalendarView` + `DayDetailPanel`, 사이드바 연동
- 월 이동, 날짜 선택, 5개 섹션 표시

### Phase 2 — 후속
- 셀에 소스별 컬러 dot + 총계 숫자
- 태스크 클릭 → 기존 `TaskDetailDrawer` 열기
- 키보드 좌/우 이동
- 주간 보기 토글
- 날짜 범위 prefetch + SSE 반영

---

## 5. 파일 변경

```
back/
  src/libs/calendar-db.ts                      [신규] 5 소스 범위 집계
  src/services/calendar/calendar.module.ts     [신규]
  src/services/calendar/controllers/calendar.controller.ts  [신규]
  src/services/generals.ts                     [수정] 모듈 등록

front/
  src/lib/calendar-api.ts                      [신규] 타입 + fetch
  src/components/work-tracking/CalendarView.tsx    [신규]
  src/components/work-tracking/DayDetailPanel.tsx  [신규]
  src/components/work-tracking/WorkTrackingDashboard.tsx  [수정]
  styles.css                                   [수정] calendar-*
```

---

*작성일: 2026-04-20.*
