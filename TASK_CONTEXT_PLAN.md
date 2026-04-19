# 태스크 컨텍스트 통합 계획

> 태스크 하나에 **LINE WORKS 메시지 / Notion 페이지 / Figma 노드 / 임의 URL**을 엮어서, "왜 이 일이 생겼고, 어디서 기획됐고, 어떻게 디자인됐는지"를 한 화면에서 파악할 수 있도록 한다.

---

## 1. 목표

- 현재 `tasks`는 단순 할일 목록 수준 (title, category, priority, due, note).
- 실제 업무는 **외부 컨텍스트와 연결**돼서 들어옴:
  - Works 채팅방에서 올라온 요청·이슈
  - Notion 기획 문서
  - Figma 시안/프로토타입
- 이 세 소스를 태스크에 **"참조"로 첨부**해, 태스크 상세에서 전부 열람·이동 가능하게 만든다.
- 반대 방향도 지원: 아카이브/문서/디자인을 보면서 → "이걸 태스크로 만들기".

---

## 2. 컨셉 — `task_references` 통합 레이어

```
┌──────────────┐            ┌─────────────────────┐
│    tasks     │◀──────────│   task_references    │
└──────────────┘            │ (polymorphic link)   │
                            └──────────┬───────────┘
                                       │ source + external_id
              ┌────────────┬───────────┼────────────┬────────────┐
              ▼            ▼           ▼            ▼            ▼
      line_works_      line_works_  notion_pages_ notion_   figma_file_
      messages         attachments  snapshot      update_   snapshots
                                                  events    (계획)
```

- 원본 데이터는 각 소스 테이블에 그대로 두고, `task_references`는 **얇은 연결 레이어**.
- 각 참조는 `title`/`excerpt`/`external_url`을 **캐시해서 보관** → 원본이 사라져도 UI에 최소 정보 유지.
- 새 소스(예: Slack, Linear)가 생겨도 스키마 변경 없이 `source` 값만 추가하면 됨.

---

## 3. 스키마

```sql
CREATE TABLE IF NOT EXISTS task_references (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        TEXT NOT NULL,
  source         TEXT NOT NULL,        -- enum: 'line_works_message'
                                       --       'line_works_attachment'
                                       --       'notion_page'
                                       --       'figma_node'
                                       --       'url' (임의 링크)
  external_id    TEXT NOT NULL,        -- 소스별 고유 ID (messageId / page_url / figma_url)
  title          TEXT,                 -- 화면 표시용 캐시
  excerpt        TEXT,                 -- 미리보기 (≤ 200자 권장)
  external_url   TEXT,                 -- 원본 열기 링크 (딥링크)
  metadata_json  TEXT,                 -- 소스별 부가정보 (JSON 문자열)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_by     TEXT,                 -- 붙인 유저 (auth_sessions.user_id)
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_task_references_task
  ON task_references(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_references_source
  ON task_references(source, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_references_dedupe
  ON task_references(task_id, source, external_id);
```

### TS 타입 (프론트 공유)

```typescript
type ReferenceSource =
  | "line_works_message"
  | "line_works_attachment"
  | "notion_page"
  | "figma_node"
  | "url";

interface TaskReference {
  id: number;
  taskId: string;
  source: ReferenceSource;
  externalId: string;
  title: string | null;
  excerpt: string | null;
  externalUrl: string | null;
  metadata: Record<string, unknown>;   // metadata_json 파싱
  createdAt: string;
  createdBy: string | null;
}
```

---

## 4. 소스별 매핑

### (a) LINE WORKS 메시지
| 필드 | 값 |
|---|---|
| `source` | `line_works_message` |
| `external_id` | `messageId` (콜백의 고유값) |
| `title` | `@<userName>: <text 앞 40자>` |
| `excerpt` | 메시지 본문 ≤ 200자 |
| `external_url` | `worksmobile://channel/<channelId>` (방 단위 딥링크) |
| `metadata_json` | `{ channelId, channelName, userId, userName, issuedTime, contentType }` |

**주의**: Works는 메시지 단위 공식 딥링크가 없어서 URL은 **방 열기**까지. 원문은 우리 DB의 `line_works_messages`에서 복원해 UI에 인라인 표시.

### (b) LINE WORKS 첨부 파일
| 필드 | 값 |
|---|---|
| `source` | `line_works_attachment` |
| `external_id` | `line_works_attachments.id` (우리 내부 id) |
| `title` | `fileName` |
| `excerpt` | `mime_type` + 사이즈 표기 (예: "PDF · 2.4MB") |
| `external_url` | 빈 값 (presigned URL은 동적 발급) |
| `metadata_json` | `{ fileId, fileSize, mimeType, messageId, channelId }` |

**다운로드**: `GET /api/line-works-attachments/:id` 호출로 그때그때 presigned URL 발급.

### (c) Notion 페이지
| 필드 | 값 |
|---|---|
| `source` | `notion_page` |
| `external_id` | `page_url` |
| `title` | 페이지 title (또는 `notion_update_events.title`) |
| `excerpt` | `section / parent` 브레드크럼 |
| `external_url` | 동일 `page_url` |
| `metadata_json` | `{ section, parent, editor, lastEditedAt }` |

기존 `notion_update_events` 쪽과 직접 FK는 걸지 않고, `page_url`로만 느슨하게 연결 (이벤트 row가 만료·삭제돼도 참조는 남음).

### (d) Figma 노드
| 필드 | 값 |
|---|---|
| `source` | `figma_node` |
| `external_id` | 전체 URL (`https://figma.com/file/<key>/?node-id=123-456`) |
| `title` | 사용자가 입력 or Figma API로 fetch한 노드 이름 |
| `excerpt` | 파일명 / 프레임 경로 |
| `external_url` | 동일 URL |
| `metadata_json` | `{ fileKey, nodeId }` |

초기에는 **사용자가 URL을 붙여넣는 방식**으로 시작. 피그마 웹훅 붙이면 자동 fetch로 확장.

### (e) 임의 URL (보조)
| 필드 | 값 |
|---|---|
| `source` | `url` |
| `external_id` | 정규화된 URL |
| `title` | 사용자 입력 or 페이지 `<title>` 스크랩 (옵션) |
| `excerpt` | 사용자 입력 or meta description |
| `external_url` | 동일 URL |

---

## 5. API 엔드포인트

모두 `AuthGuard` 적용. `created_by` = 세션 유저.

| Method | Path | 용도 |
|---|---|---|
| POST | `/api/task-references` | 참조 추가 (body: `{ taskId, source, externalId, title?, excerpt?, externalUrl?, metadata? }`) |
| DELETE | `/api/task-references/:id` | 참조 제거 |
| GET | `/api/tasks/:id/references` | 특정 태스크의 참조 목록 |
| GET | `/api/tasks/:id/context` | 태스크 + 참조들을 소스별로 펼쳐 반환 (상세뷰용 일괄 fetch) |

### POST /api/task-references 예시

```json
{
  "taskId": "t-abc",
  "source": "line_works_message",
  "externalId": "m-xyz"
}
```

- 서버에서 `line_works_messages` join 후 `title/excerpt/external_url/metadata_json`을 **자동 채움** (클라이언트가 보낸 값은 override용으로만 허용)
- `UNIQUE(task_id, source, external_id)` 위반 시 기존 row 반환(멱등)

### GET /api/tasks/:id/context 응답 예시

```json
{
  "ok": true,
  "task": { "id": "t-abc", "title": "랜딩페이지 v2", ... },
  "references": {
    "line_works_message": [ { id, title, excerpt, externalUrl, issuedTime, channelName, userName }, ... ],
    "line_works_attachment": [ { id, fileName, mimeType, fileSize }, ... ],
    "notion_page": [ { id, title, section, parent, externalUrl }, ... ],
    "figma_node": [ { id, title, fileKey, nodeId, externalUrl }, ... ],
    "url": [ { id, title, externalUrl }, ... ]
  }
}
```

---

## 6. UI/UX 플로우

### (A) 메시지 보고 태스크에 붙이기 — Reference-first
```
LINE WORKS Archive 뷰
   └ 메시지 카드에 [ + 태스크에 추가 ] 버튼
       ↓ 클릭
   ┌────── 모달 ──────┐
   │ 기존 태스크 선택 │   ← 자동완성 검색 (today / recent)
   │   또는           │
   │ 새 태스크 만들기 │   ← title 프리필 = 메시지 앞부분
   └──────────────────┘
       ↓
   POST /api/task-references   (source=line_works_message)
```

### (B) 태스크 만들면서 컨텍스트 모으기 — Task-first
```
새 태스크 생성 모달
   ├ 기본 필드 (title, priority, due, ...)
   └ "참조 추가" 섹션
       ├ [LINE WORKS에서 선택]  → 아카이브 팝오버
       ├ [Notion 페이지 검색]   → notion_update_events에서 검색
       ├ [Figma URL 붙여넣기]   → URL 파싱
       └ [링크 추가]            → 단순 URL
```
태스크 생성 시 references를 함께 bulk insert.

### (C) 태스크 상세에서 컨텍스트 열람
```
Task 상세 뷰
 ├ 기본 정보 (title, status, priority, due, note)
 ├ ─────────────────────────
 ├ 컨텍스트 탭
 │   ├ LINE WORKS (N)   ← 소스별 그룹
 │   │    · @홍길동: "히어로 CTA 수정..."  [열기]
 │   │    · [파일] spec.pdf  [다운로드]
 │   ├ Notion (M)
 │   │    · 플랫폼 본부 / 작업관리 / 랜딩페이지 v2  [열기]
 │   └ Figma (K)
 │        · Hero Section v3  [Figma 열기]
 └ [ + 참조 추가 ] 버튼
```

- 각 참조 카드에 `×` 버튼 → 제거
- "열기" = external_url로 새 탭
- 첨부 "다운로드" = presigned URL 발급 후 redirect

---

## 7. 구현 작업 순서 (MVP → 확장)

### Phase 1 — 코어 (최소 동작)
1. **스키마 추가**: `task_references` 테이블 + 인덱스 (`schema.sql`)
2. **repo + service**: `task-references.repository.ts`, `task-references.service.ts`
   - 참조 CRUD
   - source별 auto-fill 로직 (line_works_messages / notion_update_events / URL 파서)
3. **컨트롤러**: `task-references.controller.ts`
   - `POST /api/task-references`, `DELETE /api/task-references/:id`
   - `GET /api/tasks/:id/context` (기존 dashboard 응답에 참조 포함시켜도 됨)
4. **프론트 타입 + fetch helper**: `lib/task-references.ts`
5. **Task 상세 뷰 추가**: 현재 TaskCard는 인라인. 태스크 클릭 시 상세 패널(또는 라우트) 띄워 컨텍스트 탭 노출
6. **임의 URL 붙여넣기**: 가장 먼저 동작하게 하기 (소스 의존성 없음)

### Phase 2 — LINE WORKS / Notion 연결
7. LINE WORKS Archive 뷰 UI (사이드바에 추가, 페이지 완성)
8. 아카이브 카드에 "태스크에 추가" 액션
9. Notion Updates 뷰에 "태스크에 추가" 액션
10. 태스크 생성 모달에 참조 첨부 섹션 추가

### Phase 3 — Figma
11. Figma URL 파싱 로직 (`fileKey`, `nodeId` 추출)
12. 수동 URL 붙여넣기로 참조 생성
13. **(옵션)** Figma Personal Access Token으로 노드 메타 fetch → title/프레임 경로 자동 채움

### Phase 4 — 웹훅/자동화
14. Figma 웹훅 붙여서 `figma_file_snapshots` / `figma_update_events` 수집
15. 태스크 자동 제안 (예: Works에서 특정 키워드 감지 시 태스크 후보로 띄우기)

---

## 8. 한계 및 유의점

- **LINE WORKS 메시지 딥링크**: 메시지 단위는 공식 미지원. 방 단위까지만. 메시지 원문은 **우리 DB에 의존해 인라인 표시**해야 함.
- **참조 캐시 vs 원본 동기화**: title/excerpt 캐시는 insert 시점 스냅샷. 원본이 수정되면 자동 갱신 안 됨. 필요시 `POST /api/task-references/:id/refresh` 엔드포인트 추가해 수동 재fetch.
- **원본 삭제/권한 상실**: external_url 클릭 시 404/권한 오류 가능. UI에서 graceful fallback (캐시된 title/excerpt는 남으니 컨텍스트는 유지됨).
- **참조 중복**: `UNIQUE(task_id, source, external_id)`로 차단. 같은 메시지를 여러 태스크에 붙이는 건 허용 (다른 task_id).
- **Figma API 호출 비용**: 노드 메타 fetch는 속도 느림. 붙이는 즉시 fetch하면 UI 반응성 저하. 백그라운드로 채우고 UI는 placeholder 먼저.
- **삭제 전파**: `tasks` 삭제 시 FK CASCADE로 references 같이 삭제. 반대로 `line_works_messages` 삭제 시엔 참조는 남고 "원본 없음" 상태로 표시.
- **보안**: LINE WORKS 첨부는 presigned URL로만 다운로드. `task_references` GET도 AuthGuard 보호. 조직 외부 유저가 reference ID 추측해도 세션 없으면 열람 불가.

---

## 9. 기존 계획과의 관계

- [LINE_WORKS_BOT_PLAN.md](LINE_WORKS_BOT_PLAN.md) — Works 메시지/파일/링크 수집 파이프라인. 본 계획의 데이터 소스.
- (추후) Figma 웹훅 계획 — 이 파일의 Phase 4에서 참조.
- 기존 `tasks` 스키마는 변경 없음. `task_references`는 **외부 테이블로만 추가** → 기존 흐름과 독립적.

---

## 10. 다음 액션

- [ ] `schema.sql`에 `task_references` 테이블 추가
- [ ] `task-references` 모듈(repo/service/controller) 구현
- [ ] 태스크 상세 뷰 UI 신설 (현재는 카드 인라인만 존재)
- [ ] 임의 URL 붙여넣기 최소 동작 확인 → MVP 마감
- [ ] LINE WORKS Archive 뷰 완성 후 "태스크에 추가" 액션 연결
- [ ] Notion Updates 뷰에 "태스크에 추가" 액션 추가
- [ ] Figma URL 수동 붙여넣기 지원 (Phase 3)
- [ ] (옵션) 자동 노드 메타 fetch / 웹훅 연결

---

*작성일: 2026-04-19. 작업 진행 시 Phase별 체크리스트 갱신.*
