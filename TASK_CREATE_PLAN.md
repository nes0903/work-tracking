# 태스크 생성 개선 계획

> 현재 "태스크 생성" 뷰는 URL 붙여넣기만 지원.
> 수집 중인 **Notion 업데이트 / LINE WORKS 메시지·파일** 을 **태스크 생성 시점에 바로 선택**해서 연결할 수 있게 확장.

---

## 1. 현재 상태 & 문제

### 지금 가능한 것
- 기본 필드: title, category, priority, due, estimate, note
- 참조 섹션: **URL + 표시 이름** 하나씩 수동 입력

### 한계
- 이미 우리 DB 에 쌓인 **Notion 업데이트**, **LINE WORKS 메시지/첨부** 를 참조로 붙이려면:
  - 해당 뷰로 이동 → 개별 항목에서 "태스크에 추가" → 모달에서 태스크 선택
  - 즉 **reference-first 흐름만 가능**, task-first 흐름이 부실함
- 대량의 컨텍스트(회의 녹음본 + 기획 문서 + 채팅 파일)를 한 태스크로 엮을 때 탭 전환 부담
- URL 을 매번 복사해서 붙여넣는 수고

### 목표
태스크 생성 화면 **그 자리에서**:
- 최근 Notion 업데이트 목록에서 골라 첨부
- 최근 LINE WORKS 메시지 (본문 + 첨부 파일) 에서 골라 첨부
- 파일 저장소 트리에서 파일 골라 첨부
- URL 붙여넣기도 그대로 지원

전부 submit 시 `task_references` 에 일괄 insert.

---

## 2. UX 디자인 — 탭 기반 참조 선택기

### 레이아웃

```
┌─ 태스크 생성 ─────────────────────────────────────────────┐
│ 업무명 / 카테고리 / 우선순위 / 마감 / 예상 / 메모 / 담당자    │
│                                                            │
│ ─ 참조 (선택) ─                                           │
│ ┌────────────────────────────────────────────────────┐   │
│ │ [ Notion ] [ LINE WORKS ] [ Figma ] [ 파일 ] [ 기타 URL ] │  ← 5탭
│ │                                                    │   │
│ │  (선택한 탭에 따른 picker UI)                         │   │
│ └────────────────────────────────────────────────────┘   │
│                                                            │
│ ─ 추가된 참조 (4) ─                                       │
│  📄 Notion   플랫폼 본부 / 기획 / 랜딩페이지 v2             │
│  💬 LW       @홍길동: "이 부분 UI 수정 요청..."             │
│  🎨 Figma    Hero Section v3 (fileKey:abc / node:1:234)    │
│  🔗 기타     https://notion.so/... (외부 문서)              │
│                                                            │
│ [ 업무 추가 ]                                              │
└────────────────────────────────────────────────────────────┘
```

### 탭별 동작 (2026-04-20 업데이트)

| 탭 | 리스트 소스 | 선택 시 | 생성될 reference |
|---|---|---|---|
| **Notion** | `notionFeed.items` (최근 20건) + 검색 | 항목 클릭 | source=`notion_page`, externalId=`page_url`, metadata에 section/parent |
| **LINE WORKS** | `lineWorksArchive.items` (최근 50건) + 채널 필터 | 메시지 / 첨부 클릭 | 메시지 → source=`line_works_message` / 첨부 → source=`line_works_attachment` |
| **Figma** ✨신규 | Figma URL 입력창 | Figma URL 붙여넣기 → 자동 파싱 (`fileKey`, `nodeId`) → `+추가` | source=`figma_node`, externalId=URL, metadata=`{fileKey, nodeId}` |
| **파일 저장소** | `storageItems` 플랫 리스트 | 파일 클릭 | source=`line_works_attachment`, externalId=`attachment.id` |
| **기타 URL** (리네임) | 범용 URL 입력창 | URL + 표시이름 입력 → `+추가` | source=`url` |

> **변경점**:
> - 기존 단일 "URL" 탭을 **"기타 URL"** 로 명칭 변경 (외부 리소스 범용)
> - **Figma 탭** 신규 추가 — URL 파싱으로 fileKey/nodeId 자동 추출
> - 탭 순서 재정렬: **Notion → LINE WORKS → Figma → 파일 → 기타 URL** (자주 쓰는 순)

### 공통 상호작용
- 선택하면 **하단 "추가된 참조" 리스트에 즉시 반영** (pending)
- 이미 추가된 참조는 **체크/테두리 강조** — 재클릭 시 제거 토글
- `×` 버튼으로 개별 제거
- 태스크 submit 시 pending 전체를 `task_references` 에 배치 insert

### 검색/필터
- Notion: 제목 substring 검색
- LINE WORKS: 본문 text 검색 + 채널 드롭다운 필터
- 파일 저장소: 파일명/채널 필터

---

## 3. 데이터 모델 — 공통 `PendingReference`

프론트 로컬 타입 (submit 전 임시 저장):

```ts
type PendingReference =
  | { source: "url"; externalId: string; title: string; externalUrl: string }
  | { source: "notion_page"; externalId: string; title: string; excerpt: string; externalUrl: string; metadata: { section?: string; parent?: string; editor?: string; editedAt?: string } }
  | { source: "line_works_message"; externalId: string; title: string; excerpt: string; metadata: { channelId: string; channelTitle?: string; userId?: string; issuedAt?: string; contentType: string } }
  | { source: "line_works_attachment"; externalId: string; title: string; excerpt: string; metadata: { attachmentId: number; messageId: string; fileName: string; fileSize: number; mimeType: string } }
  | { source: "figma_node"; externalId: string; title: string; externalUrl: string; metadata: { fileKey: string; nodeId: string | null } };   // ✨ 신규
```

### Figma 탭 세부 스펙

**입력 UX**:
- URL 입력창 (플레이스홀더 `https://www.figma.com/file/... 또는 .../design/...?node-id=...`)
- 표시 이름 입력창 (선택, 비어있으면 URL 사용)
- `+추가` 버튼

**URL 파싱 규칙**:
```ts
function parseFigmaUrl(raw: string): { fileKey: string; nodeId: string | null } | null {
  // https://www.figma.com/file/<fileKey>/<slug>?node-id=<nodeId>
  // https://www.figma.com/design/<fileKey>/... (새 형식)
  const match = raw.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)\//);
  if (!match) return null;
  const fileKey = match[1];
  const nodeMatch = raw.match(/[?&]node-id=([^&]+)/);
  const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : null;
  return { fileKey, nodeId };
}
```

**유효성 검증**:
- `figma.com` 도메인 아닐 때 → 에러 메시지 "Figma URL이 아닙니다. 기타 URL 탭을 사용하세요"
- `fileKey` 추출 실패 시 → 에러 "fileKey를 찾을 수 없습니다"
- `nodeId` 는 선택 (없으면 파일 전체로 간주)

**생성되는 reference 예시**:
```json
{
  "source": "figma_node",
  "externalId": "https://www.figma.com/file/abc123/Design?node-id=1%3A234",
  "title": "Hero Section v3",
  "externalUrl": "https://www.figma.com/file/abc123/Design?node-id=1%3A234",
  "metadata": { "fileKey": "abc123", "nodeId": "1:234" }
}
```

**외부 정보 보강 (Phase 5+)**:
- Figma Personal Access Token 이 있으면 `/v1/files/:fileKey?ids=<nodeId>&depth=1` 호출로 **노드 이름·파일명 자동 채움**
- 초기에는 사용자가 수동 입력 or URL 그대로 제목 사용

### 기타 URL 탭 (리네임)

- 기존 "URL" → **"기타 URL"**
- 동작 동일: 외부 리소스 (Slack, 외부 문서, 임의 웹페이지 등) 범용 참조
- `source=url`
- **힌트**: 입력창에 figma.com URL 을 붙여넣으면 "Figma URL 은 Figma 탭을 사용하세요" 안내 메시지 표시 (선택, UX 개선용)

이 타입 그대로 `POST /api/task-references` 에 매핑.

---

## 4. 컴포넌트 분해

```
WorkTrackingDashboard
  └─ (activeView === "task-create")
       └─ ReferenceCollector                      ← 5탭 컨테이너 (이미 구현)
            ├─ NotionTab                          ← notionFeed 주입
            ├─ LineWorksTab                       ← lineWorksArchive 주입
            ├─ FigmaTab   ✨신규                   ← URL 파싱 + metadata 추출
            ├─ StorageTab                         ← storageItems + channelLabels 주입
            └─ OtherUrlTab (=기존 UrlTab 리네임)   ← 범용 URL 입력
       └─ PendingReferenceList                    ← 선택된 참조 목록 + 제거
```

**Dashboard 가 이미 모든 데이터 상태 (notionFeed, lineWorksArchive, storageItems) 를 가지고 있으므로**, props 로 내려주기만 하면 별도 fetch 없이 재활용.

**파일 추가/수정**:
- [신규] `ReferenceCollector.tsx` 내부에 `FigmaTab` 함수형 컴포넌트 추가
- [수정] 기존 `UrlTab` → `OtherUrlTab` 으로 리네임 + 버튼 라벨 "기타 URL"
- [수정] 탭 순서: `Notion → LINE WORKS → Figma → 파일 저장소 → 기타 URL`
- [수정] `lib/pending-references.ts` 의 `PendingReferenceSource` 에 `"figma_node"` 추가
- [수정] `sourceIcon` / `sourceLabel` 에 `figma_node` 매핑 추가 (🎨 / `Figma`)

---

## 5. 백엔드 변경

**거의 없음** — 기존 API 그대로 활용:
- `GET /api/notion-updates?limit=20` (이미 있음)
- `GET /api/line-works-archive` (이미 있음)
- `GET /api/storage/files` (이미 있음)
- `POST /api/task-references` (이미 있음)
- `POST /api/dashboard` `action=createTask` (이미 있음)

작업 순서 (현재도 동일):
1. `createTask` 로 태스크 생성 → 응답에서 최신 task id 추출
2. pending references 목록을 순회하며 `attachReference` 호출

Phase 별 개선 추가 검토 (필수 아님):
- 배치 insert 엔드포인트 `POST /api/task-references/bulk` — N건을 한 번에 처리 (전송 라운드트립 감소). 현재는 N번 호출해도 성능 문제 없음.

---

## 6. 구현 Phase

### ✅ Phase 1~4 완료 (2026-04-19)
- `ReferenceCollector` + 4 탭 (URL / Notion / LINE WORKS / 파일 저장소) 구현됨
- `PendingReference` 타입 + 중복 방지 + submit 시 배치 attach 동작 중

### Phase 5 — Figma 탭 + URL 리네임 (2026-04-20 추가) (반나절)
- `ReferenceCollector` 에 `FigmaTab` 추가
  - URL 입력창 + 표시이름 입력창
  - `parseFigmaUrl` 로 fileKey/nodeId 파싱 및 유효성 검증
  - 에러 케이스 UI (도메인 틀림, fileKey 추출 실패)
- 기존 `UrlTab` → `OtherUrlTab` 리네임, 버튼 라벨 "기타 URL"
- `PendingReferenceSource` 에 `"figma_node"` 추가
- `sourceIcon` / `sourceLabel` 매핑 추가 (🎨 / "Figma")
- 탭 순서 재정렬: Notion → LINE WORKS → Figma → 파일 저장소 → 기타 URL

### Phase 6 — 태스크 담당자 입력 연결 (대시보드 계획과 교차)
- 태스크 생성 폼에 **담당자 드롭다운** 추가 (디폴트: 세션 유저)
- `users` 테이블에서 선택지 가져오기 (별도 API `/api/users`)
- `POST /api/dashboard action=createTask` body 에 `assigneeUserId` 추가

### Phase 7 — 품질 개선 (추후)
- 검색창 debounce
- "더보기" 버튼 / 무한 스크롤 (**페이지네이션은 대시보드 계획과 통합**)
- 태스크 생성 성공 toast + 참조 연결 진행 표시
- 이미 태스크에 붙어있는 참조는 "이미 연결됨" 배지 표시
- 제목 자동 추출: Notion 페이지 title, LW 메시지 앞부분, 파일명, Figma 노드 이름(API 호출)

---

## 7. 경계 사례 / 고려

| 케이스 | 처리 |
|---|---|
| pending 에서 중복 추가 | `(source, externalId)` 기준 중복 제거 + 버튼 토글 |
| 태스크 생성 실패 | pending 유지 (재시도 가능). refs 시도 안 함 |
| 태스크 생성 성공했는데 일부 ref insert 실패 | 실패한 것만 pending 으로 되돌리고 성공분은 유지, 사용자에게 알림 |
| 대량 선택 (예: 20개+) | 한 번의 submit 안에서 순차 insert. UI 에 "3 / 20 연결 중" 식 진행 표시 |
| Notion / LW 에서 해당 항목이 삭제된 상태 | attach 시 404 → 그 ref 는 skip + 로그 |
| 같은 LINE WORKS 메시지를 다른 날 다시 참조 | 허용 (task_id 가 다르므로 UNIQUE 위배 아님) |

---

## 8. 파일 구조 (예정)

```
front/src/components/work-tracking/
  ├ TaskCreateView.tsx               [신규]
  ├ reference-collector/
  │   ├ ReferenceCollector.tsx        [신규] 탭 컨테이너
  │   ├ UrlReferenceTab.tsx           [신규]
  │   ├ NotionReferenceTab.tsx        [신규]
  │   ├ LineWorksReferenceTab.tsx     [신규]
  │   ├ StorageReferenceTab.tsx       [신규] StorageTreeView 래퍼
  │   └ PendingReferenceList.tsx      [신규]
  └ WorkTrackingDashboard.tsx         [수정] task-create 뷰가 TaskCreateView 렌더
```

기존 `StorageTreeView` 는 `onSelect` prop 만 추가해서 재사용 (현재는 `onOpen`, `onDelete` 만 있음).

---

## 9. 다음 액션

### 완료 (2026-04-19)
- [x] Phase 1: `ReferenceCollector` 골격 + URL 탭
- [x] Phase 2: Notion picker
- [x] Phase 3: LINE WORKS picker (메시지/첨부 분리)
- [x] Phase 4: 파일 저장소 picker (플랫 리스트)

### 이번 라운드 (2026-04-20)
- [ ] Phase 5-1: `PendingReferenceSource` 에 `"figma_node"` 추가 + 아이콘/라벨 매핑
- [ ] Phase 5-2: `ReferenceCollector` 에 `FigmaTab` 신규 + `parseFigmaUrl` 유틸
- [ ] Phase 5-3: 기존 `UrlTab` → `OtherUrlTab` 리네임, 라벨 "기타 URL"
- [ ] Phase 5-4: 탭 순서 재정렬 (Notion → LINE WORKS → Figma → 파일 저장소 → 기타 URL)

### 대시보드 계획과 연계
- [ ] Phase 6: 태스크 폼에 **담당자 드롭다운** 추가 (별도 계획: [TASK_DASHBOARD_PLAN.md](TASK_DASHBOARD_PLAN.md))
- [ ] Phase 7: 페이지네이션 컴포넌트 공용화 — 대시보드 계획의 페이지네이션 정책 따름

---

*작성일: 2026-04-19. Figma 탭 + URL 리네임 추가: 2026-04-20.*
