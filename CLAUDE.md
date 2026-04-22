# work-tracking — Claude 작업 가이드

## 하네스: work-tracking 기능 개발 & 운영

**목표:** NestJS 백 + Next.js 프론트 + 외부 웹훅(LINE WORKS/GitHub/Notion) + EC2 배포로 구성된 업무 추적 대시보드의 기능 개발·버그 수정·운영 이슈 해결을 5명 에이전트 팀으로 조율한다.

**트리거:** 기능 추가·수정·버그 수정·배포·웹훅 이슈 등 모든 개발 요청은 `work-tracking-orchestrator` 스킬을 사용한다. 단순 파일 조회나 코드 질문은 직접 응답.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-22 | 초기 구성 (에이전트 5 + 스킬 6) | 전체 | 기존 하네스 없음. 모노레포+웹훅 통합+EC2 운영 특성 반영 |

---

## 프로젝트 개요 (참고)

- 모노레포(npm workspaces): `front/` (Next.js 16 + React 19 + Tailwind 4), `back/` (NestJS 11 + SQLite raw SQL)
- 배포: EC2(`43.200.89.255`) + Nginx + pm2(`wt-back`) + Let's Encrypt → `https://dashboard.hwaro.net`
- 외부 통합: LINE WORKS Bot, GitHub Webhook, Notion Webhook, AWS S3
- 기능별 기획 문서: 루트 `*_PLAN.md` (기능 단위 1개)
- 이슈 기록: `issue.md` (운영 장애 해결 로그), `worklog.md` (배포/인프라 일지)

## 코드 규약 요약

- **백엔드**: `services/{domain}/{controllers,applications,repository}/` 4계층 + `libs/` raw SQL. AuthGuard 기본, 웹훅만 예외.
- **프론트**: `components/ui/` 원시 + `components/work-tracking/` 도메인 컴포넌트 + `lib/{domain}-api.ts` fetch 경계.
- **타입 경계**: 백 응답 shape == 프론트 lib 타입 == 컴포넌트 사용처. 드리프트 금지(qa가 검증).
- **env**: `back/.env`는 git 제외, `back/.env.example`에 신규 변수 반영 필수. EC2 env 변경 후 `pm2 restart wt-back --update-env`.

## 자주 쓰는 명령

```bash
npm run dev:front          # Next dev (port 3000)
npm run dev:back           # Nest watch
npm run lint               # front + back
npm run build              # front + back
npm --workspace back run test
```
