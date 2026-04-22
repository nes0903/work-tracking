---
name: work-tracking-orchestrator
description: work-tracking 레포의 기능 개발 워크플로우를 조율하는 오케스트레이터. 신규 기능 추가, 기존 기능 수정, 버그 수정, 웹훅 통합, 배포 이슈 해결 등 이 레포의 모든 개발 작업에 반드시 사용. "기능 추가", "구현해", "고쳐줘", "배포", "웹훅", "태스크", "대시보드", "LINE WORKS", "Notion", "GitHub 연동", "PLAN 작성", "재실행", "이어서", "수정", "보완" 등의 표현이 나오면 이 스킬로 트리거. 단순 질문이나 읽기 작업은 트리거하지 않음.
---

# work-tracking 오케스트레이터

## 역할

architect / back-engineer / front-engineer / qa / devops 5명의 에이전트 팀을 구성하고, 기능 단위 작업을 조율한다. 기본 실행 모드는 **에이전트 팀**.

## 사용 원칙

- 단순 질문("이 파일이 뭐야?", "XX가 어디 있어?")은 직접 답변, 팀 소환 금지.
- 기능 변경·추가·수정·버그 수정·배포 운영은 이 스킬을 통과.
- 에이전트 호출 시 항상 `model: "opus"` 명시.

---

## Phase 0: 컨텍스트 확인 (필수 선행)

워크플로우 시작 전 아래를 확인한다.

1. **요청 유형 분류**
   - (A) 신규 기능 → 전체 Phase 실행
   - (B) 기존 기능 수정/버그 수정 → Phase 1 건너뛰고 Phase 2부터
   - (C) 배포·웹훅 이슈 해결 → devops 단독 실행 + 필요 시 back 합류
   - (D) 문서·PLAN만 작성 → architect 단독 실행

2. **기존 산출물 확인**
   - 관련 `*_PLAN.md`가 루트에 있는가? 있으면 읽어 현재 상태 파악
   - `_workspace/` 디렉토리에 과거 QA/devops 리포트 있는가?
   - `_workspace/` 존재 + 사용자가 "재실행"/"이어서"/"수정"이라고 하면 → 부분 재실행 모드 (관련 에이전트만 호출)
   - `_workspace/` 존재 + 새 feature 요청 → 기존 `_workspace/`는 건드리지 않고 새 feature 작업 공간 추가

3. **변경 범위 추정**
   - 관련 도메인(tasks, dashboard, calendar, feeds, github, notion, line-works-bot 등) 식별
   - `.env` / S3 / pm2에 영향이 있는지 초기 체크

---

## Phase 1: 기획 (신규 기능일 때만)

**실행**: architect 단독 실행 (혼자 초안 작성이 빠름)

**작업**:
- 사용자 요청을 읽고 `{FEATURE}_PLAN.md` 초안 작성
- `plan-doc-writer` 스킬 사용

**완료 기준**:
- PLAN에 DDL + API 계약 + 프론트 변화 + 단계 체크리스트 포함
- 사용자에게 PLAN 경로 공유 + 진행 동의 확인

---

## Phase 2: 팀 구성 및 구현

**실행 모드**: 에이전트 팀

**팀 구성**:
- 리더: (본 오케스트레이터)
- 팀원: back-engineer, front-engineer, qa
- 조건부 합류: devops (env/웹훅/S3 영향 시), architect (PLAN 수정 필요 시)

**작업 할당** (의존성 포함):
1. **back-engineer**: PLAN의 백엔드 모듈 구현 → 완료 시 qa에게 메시지
2. **front-engineer**: PLAN의 프론트 컴포넌트/lib 구현 → 완료 시 qa에게 메시지
3. **qa**: back/front 각각이 완성되는 즉시 (점진적 QA) 경계면 교차 검증
4. **devops** (조건부): 신규 env/S3/포트 영향 시 `.env.example` 갱신, 배포 체크리스트 작성

**병렬성**:
- back과 front는 API 계약 확정 후 동시 진행 가능 → 팀원들이 SendMessage로 조율
- qa는 모듈 단위로 계속 돌아가며 검증

**완료 기준**:
- back/front 구현 완료
- qa 리포트에서 critical 불일치 0건
- 린트/빌드 통과 (`npm run lint`, `npm run build`)

---

## Phase 3: 배포·운영 연계 (필요 시)

**실행**: devops 단독 실행

**트리거 조건**:
- 신규 env 추가 → EC2 `.env` 업데이트 가이드
- 신규 웹훅 엔드포인트 → Nginx/방화벽 검토
- S3 버킷/권한 변경 → AWS MCP로 권한 확인
- 프로덕션 이슈 발견 → `webhook-debug-playbook` 스킬 활용

**완료 기준**:
- 변경 사항이 `issue.md` 또는 `worklog.md`에 기록됨
- 사용자에게 프로덕션 적용 수동 단계(ssh + pm2 restart 등) 안내

---

## Phase 4: 종합 보고 및 피드백

오케스트레이터가 아래를 사용자에게 정리 보고:
- 변경된 파일 목록 (path별 한 줄 요약)
- QA 결과 (pass/fail, 발견 사항)
- 배포 영향 (env 변경, 수동 단계)
- 다음 권장 조치

그 후 사용자에게 **피드백 요청**: "팀 구성이나 절차에 바꾸고 싶은 점이 있나요?"

---

## 데이터 전달 프로토콜

| 방식 | 적용 |
|------|------|
| SendMessage | 팀원 간 실시간 조율 (DTO 변경 알림, 불일치 보고) |
| TaskCreate/Update | 의존 관계 있는 작업 (back → qa 트리거) |
| 파일 기반 | PLAN 문서, QA 리포트(`_workspace/qa_*.md`), issue.md, worklog.md |

### `_workspace/` 규약
- 루트 `_workspace/` 디렉토리에 중간 산출물 저장 (gitignore 대상 권장)
- 파일명: `{phase}_{agent}_{artifact}.md` — 예: `02_qa_tasks_list.md`
- 세션 종료 후에도 보존 (후속 작업 시 참조)

---

## 에러 핸들링

| 상황 | 대응 |
|------|------|
| back 구현 실패 (테스트/빌드 에러) | 1회 재시도, 재실패 시 원인 요약 후 사용자에게 보고. 프론트 작업은 계속. |
| qa가 불일치 발견 | origin 에이전트(back or front)에게 수정 요청 → 수정 후 재검증 1회 반복 → 재실패 시 사용자에게 보고 |
| 외부 웹훅 응답 이상 | devops가 `webhook-debug-playbook` 실행, 진단 결과를 back에게 전달 |
| PLAN과 구현이 충돌 | architect에게 즉시 전달, PLAN의 해당 섹션만 Edit으로 갱신 후 재개 |

---

## 테스트 시나리오

### 정상 흐름
1. 사용자: "태스크에 다중 담당자 기능 추가해줘"
2. Phase 0: 기존 `MULTI_ASSIGNEE_PLAN.md` 존재 감지 → 수정 모드로 전환
3. Phase 2: back-engineer가 assignees 테이블 추가 + API 수정, front-engineer가 UI 수정, qa가 경계면 검증
4. Phase 4: 변경 파일 보고, env 변경 없음 → devops 건너뜀

### 에러 흐름
1. 사용자: "LINE WORKS DM 저장이 안 됨"
2. Phase 0: (C) 배포·웹훅 분기 → devops 단독
3. devops가 `webhook-debug-playbook` 실행, Nginx 로그 확인, 응답 body 크기로 원인 추정
4. 원인이 코드(allowlist 필터) → back-engineer 합류, 수정 후 qa가 재검증
5. 해결 후 `issue.md`에 기록

---

## 참고 문서

- 프로젝트 아키텍처: `CLAUDE.md`의 하네스 섹션
- 기존 이슈 패턴: `issue.md`, `worklog.md`
- 기능별 PLAN: `*_PLAN.md`
