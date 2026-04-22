---
name: interface-contract-check
description: work-tracking의 프론트-백 경계면 shape 정합성을 교차 검증한다. 백 응답 DTO와 프론트 lib 타입, 컴포넌트 사용처 3곳을 동시에 비교. qa 에이전트가 각 엔드포인트 변경 직후 반드시 사용. "QA", "검증", "shape 맞나", "계약 확인", "타입 드리프트" 같은 표현이 나오면 이 스킬로 트리거.
---

# interface-contract-check

## 역할

경계면 버그를 사전에 차단한다. 이 레포의 반복 문제는 백 DTO 변경 → 프론트 타입 미갱신 → 런타임 오류 패턴 (`issue.md` 참조). 이 스킬은 **(a) 백 응답**, **(b) 프론트 lib 타입**, **(c) 컴포넌트 사용처** 3중 체크를 자동화한다.

## 검증 순서

### Step 1: 검증 대상 엔드포인트 식별
- 최근 변경된 API 경로를 `git diff` 또는 back-engineer 메시지로 파악
- 예: `GET /api/tasks`, `POST /api/tasks`

### Step 2: (a) 백 응답 shape 추출

```
Grep(pattern: "return\\s+\\{", path: "back/src/services/{domain}/", output_mode: "content", -A: 20)
Grep(pattern: "@(Get|Post|Put|Delete|Patch)\\(", path: "back/src/services/{domain}/controllers", output_mode: "content", -A: 5)
```

각 엔드포인트 핸들러 체인을 Controller → Service → Repository 역방향으로 따라가 최종 반환 shape을 결정한다.

### Step 3: (b) 프론트 lib 타입 추출

```
Grep(pattern: "export (type|interface) \\w+Response", path: "front/src/lib", output_mode: "content", -A: 15)
Grep(pattern: "fetch\\(`?/api/{path}", path: "front/src/lib", output_mode: "content", -A: 10)
```

`src/lib/{domain}-api.ts`의 응답 타입 선언을 모두 수집.

### Step 4: (c) 컴포넌트 사용처 추출

```
Grep(pattern: "fetch{Name}|from \"@/lib/{domain}-api\"", path: "front/src/components", output_mode: "files_with_matches")
```

사용 컴포넌트들이 어떤 필드를 구조 분해하고 있는지 확인.

### Step 5: 3중 비교

각 필드별로 체크리스트:

| 필드 | 백 타입 | 프론트 타입 | 컴포넌트 참조 | 상태 |
|------|--------|-------------|--------------|------|
| `id` | `number` | `number` | `task.id` | ✅ |
| `status` | `'draft' \| 'in_progress' \| 'done'` | `string` | `task.status === 'done'` | ⚠️ 리터럴 넓어짐 |
| `assignees` | `AssigneeRow[]` | 없음 | 사용함 | ❌ 누락 |

## 흔한 버그 패턴

### 1. 리터럴 vs string
백: `status: 'draft' | 'done'`, 프론트: `status: string`
→ 프론트도 리터럴 유니온으로 맞추라. `string`은 타입 안전 상실.

### 2. null 허용 누락
백: `channel_id: string | null`, 프론트: `channel_id: string`
→ 프론트에서 `item.channel_id.startsWith(...)` 같은 호출이 런타임 터진다. 프론트 타입에 `| null` 추가 + UI 처리.

### 3. 이름 drift
백: `created_at`, 프론트: `createdAt`
→ snake_case ↔ camelCase 변환 지점이 없는데 한쪽만 바꾸면 미스매치. 이 레포는 **snake_case로 통일**된 응답이 표준 (DB 컬럼 노출).

### 4. 페이징 응답
백: `{ ok, tasks, total, hasMore }`, 프론트 타입: `{ tasks, total }`
→ `hasMore`를 쓸 컴포넌트가 없어서 누락될 수 있음. PLAN에 명시된 필드는 전부 반영.

### 5. 에러 shape
백 에러: `{ ok: false, error: string }`, 프론트: 에러 본문을 던지지 않고 `res.ok` 체크만
→ 에러 메시지 표시가 안 됨. lib에서 에러 body까지 parse해 메시지 throw.

### 6. 인증 누락
프론트 fetch에 `credentials: "include"` 없음 + AuthGuard 엔드포인트
→ 401, 리다이렉트. 모든 `/api/*` 호출에 `credentials: "include"` 고정.

## 자동 리포트 템플릿

결과를 `_workspace/qa_{feature}_{yyyymmdd}.md`에 저장:

```markdown
# QA 리포트 — {feature}
- 세션: {yyyymmdd HH:mm}
- 범위: 엔드포인트 N개, 컴포넌트 M개

## 엔드포인트별 결과

### GET /api/xxx
| 필드 | 백 | 프론트 lib | 컴포넌트 | 상태 |
|------|----|-----------|---------|------|
| ... | ... | ... | ... | ✅/⚠️/❌ |

**발견**: (불일치 있을 때만 서술)
**권장 수정**: {파일:줄} 에서 {변경}

## 요약
- ✅ N개
- ⚠️ 주의 M개
- ❌ 수정 필요 K개
```

## 다음 단계 지시

- ❌ 발견 → origin 에이전트(back 또는 front)에게 수정 요청 SendMessage
- ⚠️ 발견 → 리포트에 명시하고 리더(오케스트레이터)에게 판단 위임
- 전부 ✅ → 리더에게 "통과" 회신 + 리포트 경로 공유

## 주의

- 수정은 하지 않는다. 수정 제안만. (단 qa 에이전트가 명시적으로 자동 수정을 허가받은 경우 제외)
- 백 응답은 실제 구현에서 추적, 주석이나 타입 선언만 보지 말 것 (주석과 구현이 다를 수 있다).
