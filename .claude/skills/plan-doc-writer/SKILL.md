---
name: plan-doc-writer
description: work-tracking 레포의 기능 기획 PLAN 문서를 작성·수정한다. 사용자가 "PLAN 작성", "기획", "설계", "{기능}을 추가하고 싶어", "새 기능" 같은 말을 하거나 architect 에이전트가 기능 설계를 시작할 때 반드시 이 스킬을 사용. 기존 PLAN 문서들(TASK_CREATE_PLAN.md, CALENDAR_PLAN.md 등)의 톤·구조·상세도를 따른다.
---

# plan-doc-writer

## 역할

루트에 `{FEATURE_NAME}_PLAN.md`를 생성하거나 갱신한다. 파일명은 **대문자 + 언더스코어 + `_PLAN.md`** (기존 컨벤션).

## 기존 문서 관찰

작업 시작 전 반드시 루트의 기존 PLAN 중 최소 1개를 읽어 톤/구조를 학습:
- 대시보드 계열: `TASK_DASHBOARD_PLAN.md`, `CALENDAR_PLAN.md`
- 기능 추가 계열: `TASK_CREATE_PLAN.md`, `TASK_EDIT_PLAN.md`, `MULTI_ASSIGNEE_PLAN.md`
- 외부 연동 계열: `LINE_WORKS_BOT_PLAN.md`, `NOTION_READ_PLAN.md`

## PLAN 문서 구조

```markdown
# {Feature Name} PLAN

> 짧은 한 줄 요약 (이 문서에서 다루는 기능).

## 1. 배경 / 목표
- 왜 이 기능이 필요한가 (사용자 문제)
- 완료 기준 (Definition of Done)

## 2. 데이터 모델
### 새 테이블 / 컬럼
```sql
CREATE TABLE ... (
  ...
);
-- 또는 ALTER TABLE ...
```
- 인덱스 / 제약 조건
- 마이그레이션 파일 경로: `back/sqlite/<파일명>.sql`

## 3. 백엔드 API 계약
| Method | Path | 설명 | Req | Res |
|--------|------|------|-----|-----|
| GET | /api/tasks | 목록 | `{q?, status?}` | `{ok, tasks: Task[], total}` |
| POST | /api/tasks | 생성 | `{title, ...}` | `{ok, task: Task}` |

### 타입 정의
```ts
interface Task {
  id: number;
  title: string;
  status: 'draft' | 'in_progress' | 'done';
  ...
}
```

### 영향받는 파일
- `back/src/services/{domain}/{domain}.module.ts`
- `back/src/services/{domain}/controllers/...`
- `back/src/libs/...`

## 4. 프론트 변화
### 추가/수정 컴포넌트
- `front/src/components/work-tracking/XxxModal.tsx` — 신규
- `front/src/components/work-tracking/TaskList.tsx` — 수정 (filter prop)

### 추가/수정 lib 클라이언트
- `front/src/lib/{domain}-api.ts` — 새 함수 `fetchXxx()` 추가

### 라우트 변화
- `/xxx` 신규 추가 또는 기존 `/`에서 모달 노출

## 5. 작업 단계
- [ ] DDL 작성 및 마이그레이션 파일 추가 → commit "feat: ... 스키마"
- [ ] 백 repository/service/controller 구현 → commit "feat: ... API"
- [ ] 프론트 lib 클라이언트 타입·함수 → commit "feat: ... 클라이언트"
- [ ] 프론트 컴포넌트 구현 → commit "feat: ... UI"
- [ ] QA 경계면 체크 → issue 발견 시 추가 commit
- [ ] (선택) devops 배포 체크리스트

## 6. 엣지케이스 / 운영 고려
- 빈 상태 / 에러 상태 UI
- 인증 필요 여부
- env/S3/웹훅 영향 (있으면 devops 합류)

## 7. 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| YYYY-MM-DD | 초안 | - |
```

## 작성 원칙

1. **Why 먼저.** 배경 없이 곧바로 스펙 쓰지 않는다.
2. **API 계약은 테이블로.** 텍스트만으로 적지 말고 Method/Path/Req/Res 테이블 + TS 타입 정의 병기.
3. **작업 단계는 커밋 단위.** 한 단계에 하나의 commit이 들어가도록 분할.
4. **기존 파일 경로를 직접 쓴다.** "services 어디쯤"이 아니라 `back/src/services/tasks/applications/tasks.service.ts:..`처럼 명시.
5. **수정 시 `## 변경 이력`에 행 추가.** 새 파일로 중복 생성하지 말 것.

## 금지

- 구현 코드를 PLAN에 통째로 쓰지 않는다 (스키마/타입 정의 수준까지만).
- 모호한 "검토한다", "개선한다" 같은 애매 표현.
- 외부 링크 없이 외부 시스템 스펙을 전제하기 — LINE WORKS/Notion/GitHub 관련은 요약과 함께 doc URL도 넣는다.

## 이전 PLAN 수정

기존 파일이 있으면:
1. 전체를 읽고 구조 파악
2. 관련 섹션만 Edit (전체 Write 금지)
3. `## 변경 이력`에 이번 변경 행 추가
4. 작업 단계의 완료 박스 `[x]`는 건드리지 않음
