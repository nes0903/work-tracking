# 다중 담당자(Assignees) 지원 계획

> 현재 태스크는 단일 `assignee_user_id` 만 지원. 담당자 여러 명을 지정할 수 있게 데이터 모델·API·UI 를 전면 이행.

---

## 1. 데이터 모델

### 신규 테이블 `task_assignees`
```sql
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,   -- 화면 표시 순서(필요 시 정렬)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
```

### 기존 `tasks.assignee_user_id` 처리
- **유지 + deprecated** — SQLite 는 `DROP COLUMN` 제약이 있어 즉시 삭제하지 않음
- 새 코드는 `task_assignees` 만 읽고 씀
- 백필: `runColumnMigrations` 에서 `task_assignees` 가 비어있고 `tasks.assignee_user_id` 가 채워진 기존 레코드를 1회 복사

---

## 2. 백엔드 변경

### `dashboard-db.ts`
- `CreateTaskInput.assigneeUserId` → `assigneeUserIds?: string[]`
  - 빈 배열 / undefined 이면 **세션 유저 1명** 으로 fallback
- `UpdateTaskInput` 에 `assigneeUserIds?: string[]` (전체 replace 시맨틱)
- `createTaskForDate` : INSERT 후 `task_assignees` 에 bulk insert
- `updateTaskForDate` : `assigneeUserIds` 전달된 경우 기존 row 모두 삭제 후 insert
- `selectDays` / `mapTaskRow` : `Task` 객체에 `assignees: {userId, userName}[]` 배열 포함

### `tasks-query-db.ts` (`queryTasks`)
- 응답 타입 `assignee → assignees: {userId, userName}[]`
- SELECT 에 `task_assignees JOIN users` subquery 로 `assignees_json` 수집 (GROUP_CONCAT + JSON 조합)
- 필터 `assignee=<id|me>` 는 **EXISTS 서브쿼리** 로: `EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = ?)`
- 기존 `t.assignee_user_id` 참조 제거

### `dashboard.service.ts`
- `createTask` / `updateTask` 케이스에서 payload.task.assigneeUserIds 배열을 받아 검증(string[] 만), 없으면 session fallback

### `tasks.controller.ts`
- `queryTasks` 응답 스키마 변경에 맞춰 그대로 위임 (컨트롤러 자체 변경은 없음)

### `admin.controller.ts` (backfill-tasks)
- 기존 `assignee_user_id` NULL 채우기 로직을 `task_assignees` 행 추가로 바꿈
- 세션 유저 1명으로 1회 백필

### `calendar-db.ts`
- `CalendarTaskSummary.assigneeName` → `assigneeNames: string[]`
- 쿼리에서 task_assignees JOIN 후 GROUP_CONCAT

---

## 3. 프론트 변경

### 타입
- `tasks-api.ts`
  ```ts
  interface TaskListItem {
    ...
    assignees: UserRef[]; // 이전: assignee: UserRef | null
    ...
  }
  ```
- `calendar-api.ts` `CalendarTaskSummary.assigneeNames: string[]`

### UI
- `TaskList` (`TaskRow`): `creator → assignee1, assignee2` 콤마 목록, "내 담당" 뱃지는 현재 유저 id 가 assignees 중 포함되면 표시
- `TaskDetailDrawer`: 담당 섹션 `{creator.userName} → {assignees.map(u => u.userName).join(", ")}`
- `TaskCreateModal` (create + edit 모드):
  - **담당자 다중 선택 UI 신규** — 체크박스 그룹 또는 chip toggle
  - props 로 `users` 목록 + 현재 선택된 `assigneeUserIds`
  - default: create 모드는 `[세션유저]`, edit 모드는 `initialTask.assigneeUserIds`
- `TaskCreateSubmit` / `TaskEditInitial` 에 `assigneeUserIds: string[]`
- `DashboardFilters`: 필터 dropdown 유지 (단일 선택) — 서버 쿼리 의미만 "이 user 가 담당자 목록에 포함되는가" 로 바뀜. UI 변화 없음.
- `DayDetailPanel` (calendar): `👤 {assigneeNames.join(", ")}`

### `WorkTrackingDashboard`
- drawer `onEdit` → `TaskEditInitial` 조립 시 `assigneeUserIds: task.assignees.map(a => a.userId)`
- `handleTaskCreateSubmit` payload 에 `assigneeUserIds`

---

## 4. 마이그레이션 (서버 기동 시 1회)

`sqlite-db.ts` `runColumnMigrations` 끝에 추가:
```ts
// task_assignees 빈 상태에서 기존 tasks.assignee_user_id 를 1회 복사
const hasLegacy = tableHasColumn(db, "tasks", "assignee_user_id");
const taCount = db.prepare("SELECT COUNT(*) AS c FROM task_assignees").get() as { c: number };
if (hasLegacy && taCount.c === 0) {
  db.exec(`
    INSERT OR IGNORE INTO task_assignees (task_id, user_id)
    SELECT id, assignee_user_id FROM tasks
     WHERE assignee_user_id IS NOT NULL AND TRIM(assignee_user_id) <> ''
  `);
}
```

---

## 5. 구현 순서

1. schema.sql + sqlite-db 마이그레이션 + 백필
2. `dashboard-db.ts` create/update + select 에서 assignees 반환
3. `tasks-query-db.ts` assignees[] 반환 + filter EXISTS 로
4. `dashboard.service.ts` payload.assigneeUserIds 처리
5. `admin.controller.ts` backfill 로직 업데이트
6. `calendar-db.ts` 다중화
7. 프론트 타입 변경 (`tasks-api.ts`, `calendar-api.ts`)
8. 프론트 컴포넌트 — 표시/편집/필터
9. 타입체크 + 동작 검증

각 단계 끝에 `tsc --noEmit` 통과.

---

## 6. 엣지 케이스

- 담당자 0명 허용 여부 — 허용하면 filter "담당자 없음" 옵션 필요. **일단은 최소 1명** 규칙 유지 (빈 배열 전달 시 세션 유저 fallback).
- 중복 user_id 입력 → PRIMARY KEY 로 INSERT OR IGNORE
- 존재하지 않는 user_id → users 테이블과 FK 미설정(=LEFT JOIN 가정). 표시만 "알 수 없음"
- 대량 담당자 (예: 20명) → UI 에서 첫 3명 + "외 N명" 처리

---

*작성일: 2026-04-21.*
