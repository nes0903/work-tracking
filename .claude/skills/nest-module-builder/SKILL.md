---
name: nest-module-builder
description: work-tracking 백엔드에 NestJS 모듈을 추가·수정한다. services/{domain}/{controllers,applications,repository} 4계층 + libs/ raw SQL 패턴을 엄격히 유지. 사용자가 "백엔드 추가", "API 엔드포인트", "NestJS", "모듈 만들어" 같은 말을 하거나 back-engineer가 구현을 시작할 때 반드시 이 스킬을 사용.
---

# nest-module-builder

## 역할

새 도메인 모듈을 scaffold하거나 기존 모듈을 확장한다. 항상 기존 패턴(`services/dashboard/`, `services/feeds/`, `services/tasks/`)을 먼저 읽어 동화한다.

## 디렉토리 스켈레톤

새 도메인 `{name}` 추가 시:

```
back/src/services/{name}/
├── {name}.module.ts
├── controllers/
│   └── {name}.controller.ts
└── applications/
    └── {name}.service.ts
```

repository가 필요하면 (대부분):
```
└── repository/
    └── {name}.repository.ts
```

raw SQL 쿼리 또는 외부 API 클라이언트가 도메인 무관하게 재사용 가능하면:
```
back/src/libs/{name}.ts   또는   back/src/libs/{name}-db.ts
```

## 각 파일 핵심 규약

### {name}.module.ts
```ts
import { Module } from "@nestjs/common";
import { {Name}Controller } from "./controllers/{name}.controller";
import { {Name}Service } from "./applications/{name}.service";
import { {Name}Repository } from "./repository/{name}.repository";

@Module({
  controllers: [{Name}Controller],
  providers: [{Name}Service, {Name}Repository],
  exports: [{Name}Service],
})
export class {Name}Module {}
```
→ `src/app.module.ts`의 `imports`에 추가 필수.

### controllers/{name}.controller.ts
- `@Controller("{name}")` — URL prefix는 kebab-case
- AuthGuard 기본 적용 (`@UseGuards(AuthGuard)`)
- 웹훅 콜백 엔드포인트는 `@Public()` 또는 AuthGuard 미적용 + 서명 검증 로직
- 비즈니스 로직 없음. DTO 검증 + service 호출 + 응답 변환만.

### applications/{name}.service.ts
- 도메인 로직 위치
- repository 주입, libs/ 함수 호출
- 트랜잭션 경계를 여기서 관리

### repository/{name}.repository.ts
- libs/의 raw SQL 함수들을 도메인 관점으로 묶어 제공
- NestJS DI로 서비스에 주입

### libs/{name}.ts (raw SQL)
```ts
import { getDb } from "./sqlite-db";

export function insert{Name}(input: {...}): {Name}Row {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO {table}(...) VALUES (?, ?, ...)");
  const info = stmt.run(input.a, input.b);
  return findById(info.lastInsertRowid as number);
}
```
- **절대로** 문자열 보간으로 쿼리 만들지 말 것. parameter binding only.
- NestJS decorator/의존성 금지. 순수 함수.

## 스키마 변경

- `back/sqlite/` 하위에 SQL 마이그레이션 파일 추가 (파일명 컨벤션 기존 확인)
- DDL은 idempotent하게 (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`)
- `databases.module.ts`의 부팅 로직이 마이그레이션을 실행하는지 확인

## 웹훅 엔드포인트 규약

LINE WORKS / GitHub / Notion 웹훅 컨트롤러 작성 시:

1. POST 엔드포인트에서 원본 바디(raw)를 받아 서명 검증
2. 검증 실패 → `{ ok: false, error: "..." }` + 200 응답 (재시도 방지 목적이 아니면)
3. 허용/필터 단계별로 응답 body 차별화:
   ```ts
   if (!valid)     return { ok: false, error: "..." };     // ~46B
   if (!isMessage) return { ok: true, ignored: true, reason: "non-message event" };  // ~55B
   if (!allowed)   return { ok: true, ignored: true, reason: "channel not in allowlist" };  // ~62B
   await persist(...);
   return { ok: true, saved: true, id: ... };  // ~234B
   ```
   이 body 크기 규약은 devops의 진단 표(issue.md)와 **반드시 일치**해야 한다.

## 에러 처리

- 클라이언트 에러: `throw new BadRequestException({...})`
- 인증 에러: `throw new UnauthorizedException(...)`
- 내부 에러: `throw new InternalServerErrorException(...)` + logger.error

## 테스트

- spec 파일은 `*.spec.ts`로 작성, `npm --workspace back run test`로 실행
- 외부 시스템은 fetch/AWS client를 모킹

## 체크리스트

- [ ] 디렉토리/파일명이 kebab-case인가
- [ ] `app.module.ts`에 새 모듈 import 추가
- [ ] 응답 DTO가 PLAN의 API 계약과 1:1 일치
- [ ] AuthGuard 적용 (또는 공개 엔드포인트 명시적 예외)
- [ ] raw SQL은 prepared statement
- [ ] 새 env var 있으면 `back/.env.example`에 추가
- [ ] 빌드/린트 통과 (`npm run build:back`, `npm run lint:back`)
