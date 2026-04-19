# 태스크 수정 기능 계획

> 현재는 태스크 생성/삭제/상태 변경만 가능. 제목·카테고리·우선순위·마감일·마감시각·메모·담당자를
> 나중에 고칠 수 없어 UX 단절이 큼. **drawer 의 편집 버튼 → 모달** 경로로 기존 필드를 수정한다.

---

## 1. UX

- `TaskDetailDrawer` 오른쪽 위(닫기 왼쪽)에 `편집` 버튼 추가
- 클릭 시 drawer 닫히고 `TaskCreateModal` 이 **edit 모드** 로 열림 (기존 값 프리필)
- 저장하면 모달 닫히고 대시보드 리스트 자동 reload, 선택된 태스크도 갱신
- 참조는 기존 drawer 의 "+ 추가" 버튼 경로를 그대로 유지 (편집 모달은 기본 필드만)

## 2. 백엔드

### `dashboard-db.ts`

```ts
export interface UpdateTaskInput {
  title?: string;
  category?: string;
  priority?: TaskPriority;
  dueDate?: string;
  dueTime?: string | null;
  note?: string;
  assigneeUserId?: string | null;
}

export function updateTaskForDate(
  dateKey: string,
  taskId: string,
  input: UpdateTaskInput,
): DashboardState
```

- `UPDATE tasks SET ... WHERE id = ? AND work_date = ?`
- 변경 가능한 필드만 SET 절에 포함 (undefined 는 skip)
- `updated_at = datetime('now')` 함께 갱신

### `dashboard.service.ts`

- `case "updateTask":` 추가
- payload.taskId, payload.patch 를 받아 repository 로 위임

## 3. 프론트

### `TaskCreateModal`

- props 추가:
  ```ts
  mode?: "create" | "edit";
  initialTask?: TaskEditInitial | null;
  ```
- `TaskEditInitial` 타입은 편집에 필요한 필드만 (title/category/priority/dueDate/dueTime/note/id)
- `onSubmit` payload 에 `taskId?: string` 또는 별도 `onSubmitEdit` — 간단히 payload 에 `taskId` optional 추가
- 제목: "태스크 생성" vs "태스크 편집" 분기
- 편집 모드에서는 `ReferenceCollector` 숨김 (참조는 drawer 에서)

### `TaskDetailDrawer`

- prop `onEdit: (task: TaskListItem) => void` 추가
- header 에 `편집` 버튼 추가

### `WorkTrackingDashboard`

- `taskEditTarget: TaskListItem | null` 상태
- drawer `onEdit` → setSelectedTask(null) + setTaskEditTarget(task) + setTaskCreateOpen(true)
- `handleTaskCreateSubmit` 에서 payload.taskId 가 있으면 `action: "updateTask"` 로 분기

## 4. 파일 변경

```
back/
  src/libs/dashboard-db.ts                        [수정] updateTaskForDate
  src/services/dashboard/applications/dashboard.service.ts  [수정] case updateTask
  src/services/dashboard/repository/dashboard.repository.ts [수정] updateTask 래퍼

front/
  src/components/work-tracking/TaskCreateModal.tsx  [수정] edit 모드
  src/components/work-tracking/TaskDetailDrawer.tsx [수정] 편집 버튼
  src/components/work-tracking/WorkTrackingDashboard.tsx [수정] edit 플로우
```

---

*작성일: 2026-04-20.*
