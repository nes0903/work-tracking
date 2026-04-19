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
┌─ 태스크 생성 ─────────────────────────────────┐
│ 업무명 / 카테고리 / 우선순위 / 마감 / 예상 / 메모  │
│                                                │
│ ─ 참조 링크 (선택) ─                          │
│ ┌─────────────────────────────────────────┐  │
│ │ [ URL ] [ Notion ] [ LINE WORKS ] [ 파일 ] │ ← 탭
│ │                                          │  │
│ │  (선택한 탭에 따른 picker UI)              │  │
│ └─────────────────────────────────────────┘  │
│                                                │
│ ─ 추가된 참조 (3) ─                           │
│  · [Notion] 플랫폼 본부 / 기획 / 랜딩페이지 v2  │
│  · [LW]    @홍길동: "이 부분 UI 수정 요청"     │
│  · [파일]   spec.pdf (2.4MB)                   │
│                                                │
│ [ 업무 추가 ]                                  │
└────────────────────────────────────────────────┘
```

### 탭별 동작

| 탭 | 리스트 소스 | 선택 시 | 생성될 reference |
|---|---|---|---|
| **URL** | (입력창) | URL + 표시이름 입력 → `+추가` | source=`url` |
| **Notion** | `notionFeed.items` (최근 20건) + 검색 | 항목 클릭 | source=`notion_page`, externalId=`page_url`, metadata에 section/parent |
| **LINE WORKS** | `lineWorksArchive.items` (최근 50건) + 채널 필터 | 메시지 클릭 → 본문 참조 | source=`line_works_message`, externalId=`messageId` |
| **LINE WORKS 첨부** | 메시지 중 첨부 있는 것 필터 | 첨부 클릭 | source=`line_works_attachment`, externalId=`attachment.id` |
| **파일 저장소** | `storageItems` 트리 뷰 (채널→날짜→파일) | 파일 클릭 | source=`line_works_attachment`, externalId=`attachment.id` |

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
  | { source: "line_works_attachment"; externalId: string; title: string; excerpt: string; metadata: { attachmentId: number; messageId: string; fileName: string; fileSize: number; mimeType: string } };
```

이 타입 그대로 `POST /api/task-references` 에 매핑.

---

## 4. 컴포넌트 분해

```
WorkTrackingDashboard
  └─ (activeView === "task-create")
       └─ TaskCreateView                          ← 신규 분리 컴포넌트
            ├─ TaskFormFields                     ← 기본 필드
            ├─ ReferenceCollector                 ← 참조 섹션 (탭 + 선택 리스트)
            │    ├─ UrlReferenceTab
            │    ├─ NotionReferenceTab            ← notionFeed 주입
            │    ├─ LineWorksReferenceTab         ← lineWorksArchive 주입
            │    └─ StorageReferenceTab           ← storageItems + channelLabels 주입
            └─ PendingReferenceList               ← 선택된 참조 목록 + 제거
```

**Dashboard 가 이미 모든 데이터 상태 (notionFeed, lineWorksArchive, storageItems) 를 가지고 있으므로**, props 로 내려주기만 하면 별도 fetch 없이 재활용.

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

### Phase 1 — 탭 레이아웃 + 기존 URL picker 분리 (하루)
- `TaskCreateView` 컴포넌트 분리
- `ReferenceCollector` + 탭 헤더 UI
- 현재 URL 입력을 `UrlReferenceTab` 로 이사
- "추가된 참조" 리스트 공통화

### Phase 2 — Notion picker (반나절)
- `NotionReferenceTab` : `notionFeed.items` 렌더 + 제목 검색
- 항목 클릭 → pending 에 `source=notion_page` 로 추가
- 중복 방지 (같은 externalId 이미 있으면 제거 토글)

### Phase 3 — LINE WORKS 메시지/첨부 picker (하루)
- `LineWorksReferenceTab` : `lineWorksArchive.items` 리스트
- 채널 드롭다운 필터 (`channels` 사용)
- 각 행에 본문 미리보기 + 첨부 목록
- 클릭 지점에 따라 `line_works_message` 또는 `line_works_attachment` 로 추가

### Phase 4 — 파일 저장소 picker (반나절)
- `StorageReferenceTab` : 기존 `StorageTreeView` 재사용 (onSelect prop 추가)
- 트리에서 파일 클릭 → `line_works_attachment` 로 추가
- 폴더 구조는 그대로 (채널 이름 치환된 상태)

### Phase 5 — 품질 개선 (추후)
- 검색창 debounce
- "더보기" 버튼 / 무한 스크롤 (현재 limit=20~50 으로 끊어두고 필요 시 확장)
- 태스크 생성 성공 toast + 참조 연결 진행 표시
- 이미 태스크에 붙어있는 참조는 **"이미 연결됨"** 배지 표시 (방지용)
- 제목 자동 추출 개선: Notion 페이지 title, LW 메시지 앞부분, 파일명

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

- [ ] Phase 1: `TaskCreateView` + `ReferenceCollector` 골격 + URL 탭 이동
- [ ] Phase 2: Notion picker
- [ ] Phase 3: LINE WORKS picker
- [ ] Phase 4: 파일 저장소 picker
- [ ] 기존 "태스크 추가 기능은 추후 구현 예정" 알림(alert) 도 같이 정리 — 태스크 컨텍스트 뷰에서 역방향 attach 는 이미 모달로 되어있으니 문구만 제거

---

*작성일: 2026-04-19. Phase 진행 시 이 문서를 그대로 갱신.*
