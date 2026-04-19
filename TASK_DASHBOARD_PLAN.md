# 태스크 대시보드 개편 계획

> 현재 "오늘 날짜 기준 3-column Kanban" 이 메인 대시보드.
> 실제 요구는 "**팀 태스크 현황 대시보드**" 형태 — 여러 사람의 태스크를 한 눈에 보고, 필터/정렬/검색 + 클릭으로 상세 참조 열람.

---

## 1. 목표 & 현재 한계

### 요구사항
1. **할당 정보 표시**: 태스크에 "할당한 사람 (assigner)" + "할당받은 사람 (assignee)" 표시
2. **대시보드 리스트 뷰**: 카드 보드(Kanban) 대신 **행 기반 리스트/그리드** — 여러 태스크 한 화면에 한눈에
3. **상세 패널**: 태스크 클릭 → 참조 링크들을 열람·클릭 가능한 상세 뷰
4. **필터 / 정렬 / 검색**
   - 필터: 할당자(assignee), 상태, 우선순위, 카테고리
   - 정렬: 우선순위, 마감일, 생성일
   - 검색: 제목/카테고리/메모
5. **Daily Notes 제거** (프론트만)
6. **Recent Activity 제거** (프론트만)

### 현재 한계
- 태스크 테이블에 **할당자·담당자 컬럼 없음** → 화면에 표시 불가
- 태스크 리스트는 **오늘 날짜 단일일** — 다른 날짜/전체 조회 어려움
- 참조 연결은 됐지만 **TaskCard 인라인 표시만** → 펼쳐보기/관리 UX 약함
- Daily Notes / Recent Activity 가 공간 차지해 주 관심사(태스크) 집중 방해

---

## 2. 데이터 모델 변경

### (a) `users` 테이블 신규
로그인할 때마다 upsert해서 유저 마스터 유지. 태스크·참조 join 에서 이름 조회용.

```sql
CREATE TABLE IF NOT EXISTS users (
  user_id      TEXT PRIMARY KEY,
  user_name    TEXT,
  email        TEXT,
  domain_id    TEXT,
  last_login_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

- **언제 upsert**: `/api/auth/line-works/callback` 성공 시 (기존 세션 생성 로직 바로 옆)
- 이후 앱 어디서든 `user_id → user_name` 을 빠르게 조회 가능

### (b) `tasks` 컬럼 추가

```sql
ALTER TABLE tasks ADD COLUMN created_by_user_id TEXT;
ALTER TABLE tasks ADD COLUMN assignee_user_id TEXT;
```

- `created_by_user_id` — 태스크를 만든 사람 (= 할당자). `createTask` 시 세션 유저로 자동 채움.
- `assignee_user_id` — 실제 수행자. 기본값 = 생성자(자기 자신). 추후 다른 사람에게 할당하는 UI 추가 가능.
- 둘 다 **nullable** — 기존 row 들 보존. null 이면 "미지정" 으로 표시.

### (c) 선택: `assignment_history` (미구현 권장)
재할당 이력 추적이 필요해지면 별도 테이블로. **이번 범위는 아님**.

---

## 3. 백엔드 API 변경

### (a) `createTask` (기존 `POST /api/dashboard` 확장)
- body 에 `assigneeUserId` optional 추가 (기본 = 세션 userId)
- 서버가 `created_by_user_id = req.auth.userId` 자동 설정
- 응답 `days[date].tasks[]` 에 `createdByUserId`, `createdByUserName`, `assigneeUserId`, `assigneeUserName` 포함

### (b) `listTasks` 확장 (신규 엔드포인트 or 기존 `GET /api/dashboard` 확장)
현재 `GET /api/dashboard?date=YYYY-MM-DD` 는 **특정 날짜** 의 work_day + tasks 반환. 
새 엔드포인트로 **전체/날짜 범위 + 필터** 지원:

```
GET /api/tasks?
  from=YYYY-MM-DD
  to=YYYY-MM-DD
  assignee=<user_id|me|all>
  creator=<user_id|me|all>
  status=todo,doing,done
  priority=high,medium,low
  category=<string>
  q=<search keyword>
  sort=priority|due|created
  order=asc|desc
  limit=200
```
응답:
```json
{
  "ok": true,
  "items": [
    {
      "id": "...", "title": "...", "category": "...", "priority": "...",
      "status": "...", "workDate": "...", "dueDate": "...", "estimate": 0,
      "note": "...", "createdAt": "...", "updatedAt": "...",
      "createdBy": { "userId": "...", "userName": "..." },
      "assignee": { "userId": "...", "userName": "..." } | null,
      "referenceCount": 3
    }
  ],
  "users": [ { "userId": "...", "userName": "..." } ],  // 필터 드롭다운용
  "counts": { "todo": 5, "doing": 2, "done": 10 }
}
```
`referenceCount`: task_references COUNT by task_id (조인). 상세 열람 전에 리스트에서 "참조 3건" 뱃지로 노출.

### (c) `updateTask` (신규 or 확장)
상세 패널에서 편집용:
- status, priority, assignee, due_date 등 부분 업데이트
- 기존 `POST /api/dashboard action=updateTaskStatus` 를 일반화 → `action=updateTask`

### (d) `getTask` 상세 (선택 — 리스트 응답에 이미 담으면 생략 가능)
대량 리스트라면 리스트는 가볍게 + 클릭 시 상세만 따로 fetch:
```
GET /api/tasks/:id
→ task + references[] (소스별 hydrated)
```

---

## 4. 프론트엔드 변경

### (a) "대시보드" 뷰 리뉴얼

```
┌─ 대시보드 ─────────────────────────────────────────────────┐
│ [검색 🔍 ] [할당자 ▼ ] [우선순위 ▼ ] [상태 ▼ ] [정렬 ▼ ]      │
│                                                              │
│ ┌─ TODO (5) ────────────────────────────────────────────┐  │
│ │ [🔴 HIGH] 랜딩 v2 메인 카피 정리      · 노유성 → 김디자이너 │
│ │           spec.pdf  · 2 ref  · 내일 마감                │  │
│ │ [🟡 MID] ...                                            │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ DOING (2) ──────────────────────────────────────────┐  │
│ │ ...                                                    │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ DONE (10) ──────────────────────────────────────────┐  │
│ │ ...                                                    │  │
│ └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **행 기반 리스트** — 카드 아님. 한 줄에 더 많은 정보.
- **우선순위 색상 + 텍스트** 맨 앞
- **제목** (볼드)
- **할당자 → 담당자** (한 줄에 표기, 같으면 축약)
- **참조 개수 배지** (클릭 시 상세로)
- **마감까지 남은 일수** (e.g. "내일 마감", "3일 지남", "D-5")
- 상태별 섹션 collapsible (토글)

### (b) 태스크 상세 패널 (신규 컴포넌트)

카드 클릭 시 **사이드 드로워** or **모달** 로 열림.

```
┌─ [랜딩 v2 메인 카피 정리] ────────────── × │
│ [HIGH] todo ▾    김디자이너 ▾    D-1       │
│ ────────────────────────────────────────   │
│ 생성자   노유성   (2026-04-18 10:30)        │
│ 카테고리 디자인                             │
│ 메모                                         │
│   랜딩페이지 카피 톤 맞춰서...               │
│                                             │
│ 참조 (3)                    [ + 추가 ]     │
│   📄 Notion   플랫폼본부 / 기획 / 랜딩 v2 ↗ │
│   💬 LW 메시지 "이 부분 수정 요청..."  ↗   │
│   📎 LW 파일  hero-v3.fig                  │
│                                             │
│ [상태 변경] [삭제]                          │
└─────────────────────────────────────────────┘
```

- 상태/우선순위/담당자는 **드롭다운** 으로 즉시 변경 → `PATCH /api/tasks/:id`
- 참조는 기존 `TaskReferences` 로직 재사용 + 클릭 시 열기
- `+ 추가` → 기존 `AttachToTaskModal` 로 연결

### (c) 필터/정렬/검색 툴바
- `<FiltersBar>` 컴포넌트
  - 검색 input (debounce 300ms)
  - 할당자 드롭다운 (백엔드 응답의 `users[]` 로 채움)
  - 우선순위 드롭다운 (all/high/medium/low)
  - 상태 드롭다운 (all/todo/doing/done)
  - 정렬 드롭다운 (priority / due / created) + 방향 토글
- 상태를 URL query string 에 반영 (북마크/공유 용이)

### (d) 제거할 것들
- **Daily Notes 패널** 섹션 JSX 삭제 + 관련 state (`notesDraft`, `clearNotes`, `#daily-notes`)
- **Recent Activity 패널** 섹션 JSX 삭제 + 관련 state (`activityTasks`, `activityIcon`, `activityColor`, `buildActivitySubtitle`)
- 해당 CSS 는 당분간 남겨두고, 새 UI 안정화 후 정리
- 백엔드 `work_days.notes` 컬럼은 **유지** (데이터 보존. 나중에 다시 쓸 수 있음)

---

## 5. 컴포넌트 분해

```
components/work-tracking/
  ├ WorkTrackingDashboard.tsx                [수정] dashboard 뷰 새 구조로 교체
  ├ dashboard/
  │   ├ DashboardFilters.tsx                  [신규] 검색 + 드롭다운들
  │   ├ TaskList.tsx                          [신규] 상태별 섹션 + 행 리스트
  │   ├ TaskRow.tsx                           [신규] 한 줄 태스크 (카드 아님)
  │   ├ TaskDetailPanel.tsx                   [신규] 상세 패널 (드로워 or 모달)
  │   └ TaskAssigneeSelect.tsx                [신규] 담당자 드롭다운 (users 리스트)
  └ (기존 Daily Notes / Recent Activity 는 JSX 만 제거)
```

---

## 6. 구현 Phase

### Phase 1 — 백엔드 기반 (반일)
- [ ] `users` 테이블 추가 + 로그인 콜백에서 upsert
- [ ] `tasks` 테이블에 `created_by_user_id`, `assignee_user_id` 컬럼 추가 (SQLite `ALTER TABLE ADD COLUMN`)
- [ ] 기존 `createTask` 서비스에서 두 컬럼 자동 채움 (req.auth.userId)
- [ ] 기존 응답 구조에 `createdBy` / `assignee` 필드 포함

### Phase 2 — 새 리스트 API (반일)
- [ ] `GET /api/tasks` 엔드포인트 구현 (필터/정렬/검색/페이징)
- [ ] `task_references` 개수 join
- [ ] users 배열 반환 (드롭다운용)

### Phase 3 — 대시보드 UI 교체 (하루)
- [ ] Daily Notes / Recent Activity JSX 제거
- [ ] `DashboardFilters` 컴포넌트
- [ ] `TaskList` + `TaskRow` 구현 (상태별 섹션)
- [ ] 기존 Kanban board JSX 제거 (TaskBoard / TaskColumn / TaskCard)

### Phase 4 — 상세 패널 (반일)
- [ ] `TaskDetailPanel` 컴포넌트 (드로워)
- [ ] 참조 리스트 + 추가/삭제
- [ ] 인라인 편집 (status / priority / assignee)
- [ ] `PATCH /api/tasks/:id` 호출 연결

### Phase 5 — 다듬기 (추후)
- [ ] 검색 debounce + URL state 동기화
- [ ] 정렬 상태 localStorage 기억
- [ ] 드래그&드롭 상태 변경 (선택)
- [ ] 여러 날짜 범위 선택 (이번 주 / 이번 달)

---

## 7. 경계 사례

| 케이스 | 처리 |
|---|---|
| 기존 태스크에 `created_by_user_id` 가 null | "미지정" 으로 표시 |
| 로그인 유저가 아닌 사용자의 태스크 보기 | 조직 전체 공유 — 모든 유저가 모든 태스크 조회 가능 (지금 규모) |
| 담당자 변경 권한 | 현재는 생성자·담당자 구분 없이 누구나 편집 가능. 추후 policy 강화 |
| 담당자 드롭다운에 나오는 유저 목록 | `users` 테이블 전부 (로그인 이력 있는 사람) |
| 태스크 삭제 시 참조 | `task_references` FK CASCADE 로 같이 삭제됨 (기존 그대로) |
| 검색 대소문자 | LIKE + `LOWER()` 로 case-insensitive |
| 날짜 필터 기본값 | 기본 `from=이번 주 월요일`, `to=이번 주 일요일`. "전체" 토글 제공 |

---

## 8. 데이터 모델 예시

**태스크 리스트 응답 예시**:
```json
{
  "ok": true,
  "items": [
    {
      "id": "t-abc",
      "title": "랜딩페이지 메인 카피 정리",
      "category": "디자인",
      "priority": "high",
      "status": "todo",
      "workDate": "2026-04-19",
      "dueDate": "2026-04-20",
      "estimate": 90,
      "note": "...",
      "createdAt": "2026-04-18T10:30:00Z",
      "updatedAt": "2026-04-18T10:30:00Z",
      "createdBy": { "userId": "785160b1-...", "userName": "노유성" },
      "assignee": { "userId": "785160b1-...", "userName": "노유성" },
      "referenceCount": 3
    }
  ],
  "users": [
    { "userId": "785160b1-...", "userName": "노유성" }
  ],
  "counts": { "todo": 5, "doing": 2, "done": 10, "total": 17 }
}
```

**태스크 상세 응답 예시**:
```json
{
  "ok": true,
  "task": { ...위와 동일... },
  "references": [
    { "id": 1, "source": "notion_page", "title": "랜딩 v2", "externalUrl": "...", "excerpt": "플랫폼본부/기획" },
    { "id": 2, "source": "line_works_attachment", "title": "hero-v3.fig", "metadata": { "attachmentId": 5 } }
  ]
}
```

---

## 9. 마이그레이션 & 백필

### 기존 tasks 컬럼 추가
SQLite 에서 `ALTER TABLE ADD COLUMN` 은 안전. 기존 row 들은 null 값으로 채워짐.

### 기존 task 들에 유저 채우기 — **현재 로그인한 본인으로 백필** (결정됨)
**1회성 마이그레이션**:
```sql
UPDATE tasks
   SET created_by_user_id = '<session userId>',
       assignee_user_id   = '<session userId>'
 WHERE created_by_user_id IS NULL;
```

구현 방법 (선택 하나):
1. 관리자용 1회 엔드포인트 `POST /api/admin/backfill-tasks` — 호출자 세션의 userId 로 전체 null UPDATE
2. 앱 기동 시 1회 자동 실행 (환경변수 플래그로 토글)
3. 수동 SQL 한 번 실행 (가장 간단)

추천: **(1) 1회 엔드포인트**. 다 끝나면 해당 라우트 제거.

### users 테이블 초기 채움
- 로그인 콜백에서 upsert 로직만 추가하면, 다음 로그인부터 자동 등록
- 이미 세션이 있는 유저는 `auth_sessions` 에서 (user_id, user_name, email) 복사해 자동 seed:
  ```sql
  INSERT OR IGNORE INTO users (user_id, user_name, email, domain_id, last_login_at, created_at)
  SELECT DISTINCT user_id, user_name, email, domain_id, last_seen_at, created_at
    FROM auth_sessions WHERE user_id IS NOT NULL;
  ```

---

## 10. 결정된 사항 (2026-04-20)

| 항목 | 결정 |
|---|---|
| **담당자 입력 UX** | `users` 테이블에서 **드롭다운**. 기본값 = **세션 로그인 유저** |
| **기존 태스크 할당자** | null → 사용자 본인 (현재 세션 userId) 로 일괄 **백필** |
| **정렬 우선순위 순서** | `high → medium → low` 고정 (enum 매핑) |
| **Daily Notes / Recent Activity** | 프론트 JSX 만 제거. 백엔드·DB 컬럼 유지 |
| **날짜 범위 기본값** | "이번 주 월요일 ~ 일요일" (`from`/`to` query) |

---

## 11. 페이지네이션 (전 리스트 뷰 공통 정책)

### 적용 대상
모든 리스트성 뷰에 **동일한 UX 규칙** 적용:

| 뷰 | 엔드포인트 | 페이지 크기 대상 |
|---|---|---|
| 대시보드 태스크 리스트 | `GET /api/tasks` | tasks items |
| Notion Updates | `GET /api/notion-updates` | items (이미 `limit` 있음, offset 추가) |
| GitHub Watch | `GET /api/github-updates` | repos (페이지당 repo 수) |
| LINE WORKS 아카이브 | `GET /api/line-works-archive` | messages (이미 `limit` 있음, offset 추가) |
| 파일 저장소 | `GET /api/storage/files` | attachments |

### 공통 쿼리 파라미터
```
?perPage=20|50|70|100    # 페이지 크기 (디폴트 20)
&page=1                   # 1-based
```

### 공통 응답 메타
각 리스트 엔드포인트 응답에 **페이지네이션 메타** 포함:
```json
{
  "ok": true,
  "items": [ ... ],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 137,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": false
  },
  ...// 각 엔드포인트 고유 필드 (users, channels 등)
}
```

### 프론트 공통 컴포넌트 — `<Pagination>`
```
< 이전  [1] 2 3 ... 7  다음 >        [ 20 개 ▾ ]
```
- `< 이전` / `다음 >` 버튼
- 페이지 번호 (현재 페이지 강조, 총 7 페이지 초과 시 앞뒤 2개 + ...)
- **페이지 크기 드롭다운**: 20 / 50 / 70 / 100 — 변경 시 `page=1` 로 리셋
- 페이지 크기 선택은 **localStorage** 에 기억 (e.g. `wt:perPage:tasks=50`)
- URL query string 동기화는 선택 — 우선 in-memory 상태만

### 각 뷰별 state 관리
- Dashboard 상단에 각 뷰마다 `{ page, perPage }` state
- filter/sort 변경 시 `page=1` 로 자동 리셋
- SSE 로 새 이벤트 도착 시:
  - 1페이지 보고 있으면 → 자동 재fetch (최신 반영)
  - 2페이지 이상이면 → "N개 새 업데이트" 배너만 표시 (원하면 클릭해서 1페이지로 점프)

### 백엔드 구현 노트
- **LINE WORKS archive**: 기존 `limit` 은 cap 용도로 남기고 `perPage` + `offset` 을 SQL `LIMIT ? OFFSET ?` 으로. `total` COUNT 쿼리 추가.
- **Notion updates**: Notion API 자체는 cursor 기반이라 우리가 cursor 를 내부에서 관리해야 함. 당장은 **DB 에 쌓인 `notion_update_events` 를 페이지네이션** 하는 쪽으로 변경 권장 (live API 는 갱신용, 조회는 DB 에서).
- **GitHub Watch**: repos 리스트는 DB (`github_repo_snapshots`) 에서 `LIMIT/OFFSET`.
- **파일 저장소**: `line_works_attachments` 를 `ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`.

### 성능
- `total` COUNT 는 대부분 수백~수천 건 규모라 단순 COUNT(*) 로 충분. 향후 row 10만+ 가면 캐시 or 근사치로 전환.
- 인덱스: 기존 테이블들에 시간 기반 인덱스 이미 있음 (`idx_*_received_at DESC`, `idx_*_edited_at DESC`).

---

## 12. 다음 액션

- [ ] Phase 1: `users` 테이블 + tasks 컬럼 + 로그인 upsert + createTask 자동 기입 + **기존 태스크 1회 백필 엔드포인트**
- [ ] Phase 2: 새 `GET /api/tasks` + 필터/정렬/검색 + **perPage/page 파라미터 + 페이지네이션 메타 응답**
- [ ] Phase 3: 프론트 대시보드 UI (필터, 리스트) + Daily Notes / Activity JSX 제거
- [ ] Phase 4: 공통 `<Pagination>` 컴포넌트 + 기존 리스트 뷰 4곳(GitHub/Notion/LW/Storage) 에 일괄 적용
- [ ] Phase 5: TaskDetailPanel + 인라인 편집 (상태/우선순위/담당자 드롭다운)
- [ ] 검증: 기존 태스크 깨지지 않는지, 페이지 크기 전환이 localStorage 로 기억되는지

---

*작성일: 2026-04-19. 결정사항·페이지네이션 정책 추가: 2026-04-20.*
