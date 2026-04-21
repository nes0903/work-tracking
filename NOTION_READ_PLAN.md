# Notion Updates — read 상태 개편 & 페이지네이션

> 지금은 "Notion 뷰 진입 시 전체 read 처리" 구조. 이제 row 단위 read 상태 + 24h TTL + 페이지네이션 + 모두읽음 버튼.

---

## 1. 규칙 (최종 NEW 판정)

한 아이템이 **NEW** 로 보이려면 모두 만족:
1. `Date.now() - editedAt` < **24h** (아니면 "오래된 것이라 이미 알 것" 으로 간주)
2. 현재 유저의 **`user_notion_read`** 에 `event_id` 기록 없음
3. `editedAt` > `user_last_seen.notion` (= "모두 읽음" 커서 이후) — 단 2번 규칙이 주 동작, 3번은 "모두 읽음" 버튼 지원용

즉
- **열기 / 태스크 추가** 클릭 → 해당 event_id 만 read
- **모두 읽음** 버튼 → `last_seen_at = now`, 이후 모든 아이템이 NEW 탈락
- **24h 경과** → 자동 탈락 (아무 클릭 없어도)

---

## 2. 데이터 모델

### 신규 테이블 `user_notion_read`
```sql
CREATE TABLE IF NOT EXISTS user_notion_read (
  user_id   TEXT NOT NULL,
  event_id  TEXT NOT NULL,
  read_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, event_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_user_notion_read_user
  ON user_notion_read(user_id, read_at DESC);
```

### 기존 `user_last_seen` 는 "모두 읽음" 커서로 재활용

---

## 3. 백엔드

### `last-seen-db.ts`
- `markNotionRead(userId, eventIds: string[])` — bulk insert (ON CONFLICT DO NOTHING)
- `getNotionReadSet(userId, eventIds)` — 해당 페이지의 event_ids 중 read 된 id 집합 반환

### `last-seen.controller.ts`
- `POST /api/last-seen/notion/read` body: `{ eventIds: string[] }` → bulk mark
- 기존 GET/POST `/api/last-seen` 은 유지

### `dashboard-db.ts `listNotionUpdateEvents`
- **cursor → offset 기반 재작성**
- 파라미터: `page: number`, `perPage: number` (20 / 50 / 70 / 100)
- 응답:
  ```ts
  {
    items: NotionUpdateItem[],
    pagination: { page, perPage, total, totalPages, hasNext, hasPrev },
    lastSyncedAt: string | null
  }
  ```

### `feeds.controller.ts` `/api/notion-updates`
- `page`, `perPage` 쿼리 수용
- 위 DB 함수 호출 후 현재 페이지 event_ids 로 `getNotionReadSet(userId, ids)` 호출
- 응답에 `readEventIds: string[]` 추가

---

## 4. 프론트

### 타입 (`lib/work-tracking.ts`)
```ts
interface NotionFeed {
  lastSyncedAt: string | null;
  items: NotionUpdateItem[];
  pagination: { page, perPage, total, totalPages, hasNext, hasPrev };
  readEventIds: string[];
}
```
(기존 `nextCursor` 제거)

### `WorkTrackingDashboard`
- 뷰 진입 시 `markLastSeen("notion")` 제거 ("모두 읽음" 버튼이 이 역할)
- 상태: `notionPage`, `notionPerPage` (localStorage 키 `wt:perPage:notion`), `notionReadSet`
- `loadNotionUpdates(page, perPage)` — 응답의 items + pagination + readEventIds 를 state 에 반영
- `isNotionItemNew(item)`:
  ```ts
  const ageMs = Date.now() - parseTimestamp(item.editedAt);
  if (ageMs > 24 * 60 * 60 * 1000) return false;
  if (notionReadSet.has(item.eventId)) return false;
  if (lastSeenNotion && parseTimestamp(item.editedAt) <= lastSeenNotion) return false;
  return true;
  ```
- 사이드바 `notionNewCount` 를 동일 규칙으로 재계산

### UI (notion 뷰)
- 상단 바에 `모두 읽음 처리` 버튼 + 페이지 per-page select (기존 `<Pagination>` 재활용)
- 각 item 렌더:
  - "열기" 링크 onClick → `markNotionRead([eventId])`
  - "태스크 추가" onClick → 기존 호출 + `markNotionRead([eventId])`
- `markNotionRead` : 로컬 `notionReadSet` 에 즉시 추가 + POST 백그라운드

### `lib/last-seen.ts`
- `markNotionRead(eventIds: string[])` 함수 추가

---

## 5. 마이그레이션 & 호환

- `user_notion_read` 는 새 테이블 — 기존 데이터 영향 없음
- 기존 "뷰 진입 시 자동 read" 동작은 "모두 읽음 버튼" 으로 명시 이동
- 기존 무한스크롤(`nextCursor` 기반 "더보기") 은 페이지네이션으로 대체

---

## 6. 구현 순서

1. schema + last-seen-db 헬퍼
2. last-seen.controller 라우트
3. dashboard-db `listNotionUpdateEvents` offset 방식 재작성
4. feeds.controller `/api/notion-updates` 업데이트 (readEventIds 포함)
5. 프론트 `lib/last-seen.ts` 확장 + 타입 업데이트
6. WorkTrackingDashboard state / fetch / UI / 이벤트 핸들러
7. 타입 체크

---

*작성일: 2026-04-21.*
