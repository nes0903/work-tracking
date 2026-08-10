<h1 align="center">Work Tracking</h1>

<p align="center">
  <strong>업무와 팀의 컨텍스트를 한곳에 모으는 통합 워크 대시보드</strong><br />
  태스크 · 캘린더 · GitHub · Notion · LINE WORKS · 파일 · 사이트 링크
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&amp;logoColor=white" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&amp;logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Storage-3FCF8E?logo=supabase&amp;logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-Functions-000000?logo=vercel&amp;logoColor=white" />
</p>

## Architecture

```mermaid
flowchart LR
    U["사용자 브라우저"] --> F["Vercel · Next.js Frontend"]
    F -->|"/api rewrite"| B["Vercel · NestJS Function"]
    B -->|"Supavisor transaction pooler"| DB[("Supabase Postgres")]
    B --> ST["Supabase Private Storage"]
    B -. "durable SSE polling" .-> F

    LW["LINE WORKS"] -->|"SSO · Bot Webhook"| B
    GH["GitHub"] -->|"Webhook"| B
    NT["Notion"] -->|"Webhook · API"| B
```

- 프런트와 백엔드를 각각 독립된 Vercel 프로젝트로 배포합니다.
- 백엔드는 Supavisor transaction pooler를 통해 Postgres에 연결하며 prepared statement를 사용하지 않습니다.
- 첨부 파일은 비공개 Storage bucket에 저장하고 짧은 수명의 signed URL로 제공합니다.
- 브라우저에는 Supabase secret/database URL을 노출하지 않습니다. 인증은 기존 LINE WORKS OAuth 세션을 유지합니다.
- SSE 이벤트 커서는 `feed_events`에 저장되어 함수 인스턴스가 교체돼도 재연결할 수 있습니다.

## Main Features

- 태스크·하위 태스크·담당자·집중 시간 관리
- GitHub, Notion, LINE WORKS 이벤트 통합 피드와 캘린더
- LINE WORKS 메시지·첨부 파일 아카이브와 링크 미리보기
- Notion 페이지, 메시지, 파일, Figma, URL을 태스크 참조로 연결
- 사용자별 Notion 읽음 상태와 실시간 SSE 갱신

## Local Development

### 1. Install and start Supabase

```bash
npm install
npx supabase start
```

`npx supabase start` 출력의 API URL과 service role key를 `back/.env`에 넣습니다.
로컬 transaction pooler 기본 URL은 아래와 같습니다.

```env
SUPABASE_DATABASE_URL=postgresql://postgres.pooler-dev:postgres@127.0.0.1:54329/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=<local-service-role-key>
```

### 2. Configure applications

```bash
cp front/.env.example front/.env.local
cp back/.env.example back/.env
```

- LINE WORKS OAuth callback은 로컬에서 `http://localhost:3000/api/auth/line-works/callback`로 지정합니다.
- GitHub, Notion, LINE WORKS Bot 환경 변수는 해당 연동을 사용하는 경우 설정합니다.
- PEM 키는 로컬 파일 경로 또는 `LINE_WORKS_PRIVATE_KEY` 값으로 전달할 수 있습니다.

### 3. Run

```bash
npm run dev:back
npm run dev:front
```

- App: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:3001/health](http://localhost:3001/health)
- Supabase Studio: [http://127.0.0.1:54323](http://127.0.0.1:54323)

## Deploy

### Supabase

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

- `work-tracking-private` bucket, RLS, Data API 권한 차단, 전체 Postgres 스키마가 migration으로 생성됩니다.
- 백엔드 DB URL은 Dashboard의 transaction pooler(포트 `6543`) 연결 문자열을 사용합니다.

### Vercel backend project

- Root Directory: `back`
- Framework Preset: NestJS
- 필수 env: `SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- 추가 env: LINE WORKS, GitHub, Notion secrets와 `CORS_ALLOWED_ORIGINS`
- `back/server.ts`가 NestJS 진입점이며 `back/vercel.json`은 NestJS 프레임워크를 명시합니다.

### Vercel frontend project

- Root Directory: `front`
- Framework Preset: Next.js
- 필수 env: `BACKEND_BASE_URL=https://<backend-project>.vercel.app`
- `front/vercel.json`이 Next.js 프레임워크를 명시합니다.
- LINE WORKS callback은 `https://<frontend-project>.vercel.app/api/auth/line-works/callback`로 등록해야 로그인 쿠키가 프런트 도메인에 설정됩니다.
- 외부 Webhook URL은 백엔드 프로젝트의 `/api/github/webhook`, `/api/notion/webhook`, `/api/line-works-bot/callback`을 사용합니다.

### Current production

- Frontend: `https://work-tracking-three.vercel.app`
- Backend: `https://work-tracking-api-nine.vercel.app`
- Supabase: 기존 `portfolio` 프로젝트를 공유하되 `work_tracking_app` DB role과 Work Tracking 전용 RLS/grant로 격리합니다.
- 기존 `portfolio_documents` 테이블과 해당 권한은 Work Tracking migration에서 변경하지 않습니다.

## Existing Data Migration

먼저 스키마를 Supabase에 적용한 뒤 실행합니다. 데이터 import는 충돌 행을 건너뛰므로 재실행할 수 있습니다.

```bash
# SQLite 행 수 확인
npm --workspace back run migrate:sqlite:dry

# SQLite → Supabase Postgres
SUPABASE_DATABASE_URL='<pooler-url>' npm --workspace back run migrate:sqlite

# S3 객체 수 확인 및 Storage 복사
npm --workspace back run migrate:s3:dry
SUPABASE_URL='<url>' SUPABASE_SECRET_KEY='<secret>' npm --workspace back run migrate:s3
```

- 기본 원본은 `back/sqlite/work-tracking.sqlite3`이며 `--source=/path/file.sqlite3`로 변경할 수 있습니다.
- S3 복사에만 기존 `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`가 필요합니다.
- DB import 후 Storage 복사를 수행하고, 검증 전에는 기존 AWS 리소스를 제거하지 마세요.

## Environment Variables

| 영역 | 주요 변수 |
| --- | --- |
| Frontend | `BACKEND_BASE_URL` |
| Supabase | `SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` |
| LINE WORKS SSO | `LINE_WORKS_CLIENT_ID`, `LINE_WORKS_CLIENT_SECRET`, `LINE_WORKS_REDIRECT_URI`, `LINE_WORKS_DOMAIN_ID` |
| LINE WORKS Bot | `LINE_WORKS_BOT_ID`, `LINE_WORKS_BOT_SECRET`, `LINE_WORKS_SERVICE_ACCOUNT`, `LINE_WORKS_PRIVATE_KEY`, `LINE_WORKS_TARGET_CHANNEL_IDS` |
| GitHub | `GITHUB_WEBHOOK_SECRET` |
| Notion | `NOTION_WEBHOOK_VERIFICATION_TOKEN`, `NOTION_API_TOKEN`, `NOTION_API_VERSION` |

전체 템플릿은 `front/.env.example`과 `back/.env.example`을 기준으로 관리합니다.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev:front` | Next.js 개발 서버 |
| `npm run dev:back` | NestJS 개발 서버 |
| `npm run build` | 전체 production build |
| `npm run lint` | 전체 ESLint |
| `npm --workspace back run test` | Jest tests |
| `npx supabase db reset` | 로컬 DB migration 재적용 |
| `npm --workspace back run migrate:sqlite:dry` | SQLite import 점검 |
| `npm --workspace back run migrate:s3:dry` | S3 object import 점검 |

## Project Structure

```text
work-tracking/
├── front/                  # Next.js App Router Vercel project
│   └── vercel.json         # Next.js framework preset
├── back/
│   ├── server.ts           # Vercel NestJS entry
│   ├── src/                # NestJS application
│   ├── scripts/            # one-time data migration
│   └── vercel.json
├── supabase/
│   ├── config.toml
│   └── migrations/         # Postgres schema, grants, RLS, Storage bucket
└── package.json            # npm workspaces
```

## Verification

```bash
npm run lint
npm run build
npm --workspace back run test -- --passWithNoTests
npx supabase db reset
```
