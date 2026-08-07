# LINE WORKS Bot 웹훅 통합 — 이슈 및 해결 기록

> LINE WORKS 웹훅/S3 연동 초기 세팅에서 발견한 문제들과 해결 방법.
> 같은 증상 재발견 시 여기부터 확인.

---

## 2026-04-19

### #1 — 이미지 메시지는 DB에 들어오는데 S3에 안 올라감

**증상**
- `line_works_messages` 에 `content_type = 'image'` 행은 생성됨
- `line_works_attachments` 테이블은 **0 rows**
- S3 버킷도 비어있음

**진단 로그**
```
WARN [LineWorksBotService] S3 is not configured; skipping attachment download
```

**원인**
`.env` 에 S3 관련 환경변수 누락. 코드는 `S3_BUCKET_LINE_WORKS` 가 없으면 `loadS3Config()`가 `null` 반환 → 업로드 전 단계에서 스킵 후 경고 로그만 남김.

**해결**
EC2 `~/work-tracking/back/.env` 에 아래 추가:
```bash
AWS_REGION=ap-northeast-2
S3_BUCKET_LINE_WORKS=<PRIVATE_BUCKET>
S3_OBJECT_PREFIX=line-works/
S3_PRESIGN_TTL_SECONDS=600
```
이후 `pm2 restart wt-back --update-env` (단순 `reload` 는 기존 프로세스의 env를 갱신 안 함 — `--update-env` 필수).

**관련 파일**
- [libs/s3.ts](back/src/libs/s3.ts) — `loadS3Config`, `putAttachmentObject`
- [libs/line-works-bot-db.ts](back/src/libs/line-works-bot-db.ts)

---

### #2 — 첨부 다운로드 시 LINE WORKS 401 Authentication failed

**증상**
S3 env 세팅 후에도 첨부 업로드 실패. pm2 로그에:
```
ERROR [LineWorksBotService] Failed to persist LINE WORKS event
Error: LINE WORKS attachment fetch failed (401): { "description": "Authentication failed." }
```

**진단 과정**
1. JWT → access_token 교환은 정상 (`status: 200, scope: "bot"`)
2. `GET /v1.0/bots/{botId}` 호출도 정상 (`200 OK`) → 토큰 유효
3. `GET /v1.0/bots/{botId}/attachments/{fileId}` 호출 시 응답이 **302 Redirect** 로 `https://apis-storage.worksmobile.com/...` 로 이동
4. 리다이렉트 타겟에 직접 요청:
   - `Authorization` 없이 → 401
   - `Authorization` 있으면 → 200 (파일 바이너리 정상 수신)

**원인**
Node.js 내장 `fetch`는 `redirect: "follow"` 일 때 **cross-origin 리다이렉트에서 `Authorization` 헤더를 자동 제거**한다 (보안 정책). `www.worksapis.com` → `apis-storage.worksmobile.com` 은 서로 다른 origin 이라 토큰이 제거된 채로 최종 GET이 나가 401.

**해결**
[libs/line-works-bot.ts](back/src/libs/line-works-bot.ts) 의 `fetchAttachmentStream` 을 **수동 리다이렉트 추적 + 매 hop 마다 Authorization 재첨부** 로 변경:

```ts
let response = await fetch(currentUrl, {
  headers: authHeader,
  redirect: "manual",   // ← 핵심
});

for (let hops = 0; hops < 5; hops += 1) {
  if (response.status < 300 || response.status >= 400) break;
  const location = response.headers.get("location");
  if (!location) break;
  await response.body?.cancel().catch(() => undefined);
  currentUrl = new URL(location, currentUrl).toString();
  response = await fetch(currentUrl, {
    headers: authHeader,   // ← 여기서 재첨부
    redirect: "manual",
  });
}
```

**관련 파일**
- [libs/line-works-bot.ts](back/src/libs/line-works-bot.ts) — `fetchAttachmentStream`

**재현 확인 방법**
특정 채팅방에 이미지 올린 뒤:
```bash
ssh "$PRODUCTION_SSH_TARGET" 'node -e "…SELECT … FROM line_works_attachments ORDER BY id DESC LIMIT 3…"'
```
+ S3 콘솔에서 `<PRIVATE_BUCKET>/line-works/<fileId>/...` 객체 확인.

---

### #3 — 1:1 (Direct) 채팅방 메시지가 "ignored" 로 버려짐

**증상**
- 그룹 채팅방(`<GROUP_CHANNEL_ID>`)은 정상 수집
- `.env` 의 `LINE_WORKS_TARGET_CHANNEL_IDS` 에 1:1 채널 ID(`<DM_CHANNEL_ID>`)를 추가했는데 DB에 한 건도 안 들어옴
- Nginx access log 상으로 POST 요청은 분명히 오고 있고 응답은 `200 62 bytes`

**진단 과정**
1. Nginx access log 에서 `POST /api/line-works-bot/callback` 요청 수신 확인 (200 응답)
2. 응답 body 크기 62바이트 → `{"ok":true,"ignored":true,"reason":"channel not in allowlist"}` 와 정확히 일치
3. Bot API 로 두 채널 타입 조회:
   ```
   <GROUP_CHANNEL_ID> → channelType: "GROUP"       (제목 "<GROUP_NAME>")
   <DM_CHANNEL_ID>    → channelType: "SINGLE_USER" (title 빈 값)
   ```
4. `LINE_WORKS_TARGET_CHANNEL_IDS=*` 로 전체 허용 후에도 여전히 ignored → allowlist 값 문제가 아니라 **다른 필터에서 막힘**
5. dist 에 임시 로깅 삽입 후 실제 payload 확인:
   ```json
   {
     "type": "message",
     "source": { "userId": "...", "domainId": "<DOMAIN_ID>" },
     "issuedTime": "...",
     "content": { "type": "text", "text": "테스트테스트" }
   }
   ```
   → `source.channelId` **필드 자체가 없음**.

**원인**
LINE WORKS의 1:1 대화(Bot ↔ User Direct Chat) 웹훅은 `source.channelId` 없이 `userId` 만 전달한다. 우리 코드는:
```ts
if (!channelId || !isChannelAllowed(botConfig, channelId)) {
  return { status: 200, body: { ok: true, ignored: true, reason: "..." }};
}
```
로 channelId 가 없으면 조기 거절 → 1:1 대화 전체가 스킵됨.

**해결**
[line-works-bot.service.ts](back/src/services/line-works-bot/applications/line-works-bot.service.ts) 에 `resolveChannelId()` 헬퍼 추가:
```ts
function resolveChannelId(event: LineWorksCallbackEvent): string | undefined {
  const direct = event.source?.channelId;
  if (direct) return direct;
  const userId = event.source?.userId;
  if (userId) return `dm:${userId}`;   // ← 1:1 대화의 synthetic ID
  return undefined;
}
```
- DB 에 `channel_id = "dm:<userId>"` 형식으로 저장
- Allowlist 에도 이 형식으로 등록 가능 (예: `dm:785160b1-b0e6-...`)
- 프론트 `shortChannelLabel` 이 `dm:` prefix 를 감지해 `"DM · 7851…5c…"` 형식으로 표시

**관련 파일**
- [services/line-works-bot/applications/line-works-bot.service.ts](back/src/services/line-works-bot/applications/line-works-bot.service.ts) — `resolveChannelId`, `persistEvent`, `resolveMessageId`
- [components/work-tracking/WorkTrackingDashboard.tsx](front/src/components/work-tracking/WorkTrackingDashboard.tsx) — `shortChannelLabel`

**재현 확인 방법**
1:1 DM 에 텍스트 보낸 뒤:
```bash
ssh "$PRODUCTION_SSH_TARGET" 'node -e "…SELECT channel_id, text FROM line_works_messages ORDER BY received_at DESC LIMIT 3…"'
```
→ `channel_id` 가 `dm:<userId>` 로 들어오면 OK.

---

## 디버깅 레시피

향후 유사 이슈 생기면 아래 순서로 진단.

### 1. 콜백이 우리 서버까지 오는지
```bash
ssh "$PRODUCTION_SSH_TARGET" 'sudo tail -200 /var/log/nginx/access.log | grep line-works-bot'
```
- 요청 자체가 없음 → Developer Console 의 Callback URL / HTTPS / 방화벽 확인
- 요청은 오는데 `404` → Nginx 라우팅 또는 백엔드 미기동
- 요청은 오고 `200` 이지만 DB 에 저장 안 됨 → 응답 body 크기로 유형 추정

### 2. 응답 body 크기로 분기
| 크기 | 추정 |
|---|---|
| ~46 B | `{"ok":false,"error":"…"}` — 서명 실패/잘못된 JSON 등 |
| ~55 B | `non-message event` — join/leave 같은 비메시지 이벤트 |
| ~62 B | `channel not in allowlist` — 필터에 안 걸림 |
| ~234 B | 정상 저장 완료 |
| ~500 B | 500 에러 (스택 메시지) |

### 3. 실제 payload 구조 한 번 보기 (일회성)
`dist` 에 로그 주입 → `pm2 restart --update-env` → DM 1건 송신 → 로그 확인 후 복구:
```bash
ssh "$PRODUCTION_SSH_TARGET" '
  cd ~/work-tracking/back/dist/services/line-works-bot/applications
  cp line-works-bot.service.js line-works-bot.service.js.bak
  # ... 패치 ...
  pm2 restart wt-back --update-env
  # send message, then:
  pm2 logs wt-back --lines 100 --nostream 2>&1 | grep __DEBUG_WEBHOOK_DUMP__
  mv line-works-bot.service.js.bak line-works-bot.service.js
'
```

### 4. Bot API 로 직접 호출 테스트
JWT → access_token 발급 → 문제 엔드포인트 직접 호출. 응답 상태/본문을 확인해서 redirect, 401, 404 등 구분. 템플릿은 위의 각 이슈 진단 과정 참고.

---

## 운영 메모

- **`.env` 수정 후 반드시 `pm2 restart --update-env`**. 그냥 `reload` 하면 env 갱신 안 됨.
- **private key 는 `./secrets/line-works-bot.pem` 에 600 권한**. `back/secrets/` 전체를 `.gitignore` 했음.
- **S3 버킷 public access 전부 차단** + SSE-S3 암호화 켜짐. 조회는 presigned URL only.
- **AWS 자격증명** 은 저장소에 기록하지 않고, S3 prefix 범위로 제한한 IAM Role 또는 단기 자격 증명을 사용.
- **DM 저장을 원하지 않으면** `LINE_WORKS_TARGET_CHANNEL_IDS` 에 `dm:*` 같은 값은 **명시하지 않고** 그룹 ID 만 나열하면 자동 제외됨 (allowlist 방식).
- **`LINE_WORKS_TARGET_CHANNEL_IDS=*`** 는 모든 채널 + 모든 DM 을 수집하므로 테스트 후엔 **구체적 ID 목록으로 바꾸는 것을 권장**.

---

*작성일: 2026-04-19. 신규 이슈 발견 시 상단에 섹션 추가.*
