---
name: webhook-debug-playbook
description: LINE WORKS / GitHub / Notion 웹훅 콜백이 실패하거나 저장이 안 될 때 증상 기반 진단. EC2 nginx 로그·응답 body 크기·payload 구조로 근본 원인 추적. 사용자가 "웹훅", "콜백", "메시지가 안 들어와", "S3 업로드 실패", "401", "DM 저장 안 됨", "이벤트 놓침" 같은 표현을 쓰거나 devops 에이전트가 프로덕션 진단을 시작할 때 반드시 이 스킬을 사용.
---

# webhook-debug-playbook

## 역할

`issue.md`에 축적된 진단 레시피를 자동화한 운영 플레이북. 신규 이슈 해결 후 반드시 `issue.md`에 새 섹션을 추가한다.

## 대상 시스템

- **LINE WORKS Bot**: `/api/line-works-bot/callback` — 그룹/DM 메시지, 첨부, S3 업로드
- **GitHub Webhook**: `/api/github/webhook` — 커밋, PR, 이슈
- **Notion Webhook**: `/api/notion/webhook` — 페이지/블록 변경

## 운영 환경

- EC2: `ssh "$PRODUCTION_SSH_TARGET"`
- pm2 프로세스: `wt-back`
- Nginx access log: `/var/log/nginx/access.log`
- env 변경 후: `pm2 restart wt-back --update-env`

## 진단 4단계

### 1. 콜백이 서버까지 도달하는가

```bash
ssh "$PRODUCTION_SSH_TARGET" 'sudo tail -200 /var/log/nginx/access.log | grep {endpoint}'
```

분기:
- 요청 없음 → 외부(Developer Console Callback URL, DNS, 방화벽) 점검
- 404 → Nginx 라우팅 또는 백엔드 미기동
- 200 + body 크기 이상 → Step 2

### 2. 응답 body 크기로 유형 추정

| 크기 | 추정 원인 |
|------|----------|
| ~46 B | `{"ok":false,"error":"..."}` — 서명 실패/잘못된 JSON |
| ~55 B | non-message event — join/leave 등 비메시지 |
| ~62 B | channel not in allowlist — `LINE_WORKS_TARGET_CHANNEL_IDS` 필터 |
| ~234 B | 정상 저장 완료 |
| ~500 B | 500 에러 (스택 메시지) |

Nginx log 라인:
```
POST /api/line-works-bot/callback HTTP/1.1 200 62 "..."
```
이 중 `200 62`의 세 번째 토큰이 body 크기.

### 3. payload 구조 직접 확인 (일회성)

코드 경로를 알면 `dist`에 임시 로그 삽입:

```bash
ssh "$PRODUCTION_SSH_TARGET" '
  cd ~/work-tracking/back/dist/services/line-works-bot/applications
  cp line-works-bot.service.js line-works-bot.service.js.bak
  # JSON.stringify payload 로깅 추가
  pm2 restart wt-back --update-env
  # 샘플 이벤트 전송 후:
  pm2 logs wt-back --lines 100 --nostream 2>&1 | grep __DEBUG_WEBHOOK_DUMP__
  mv line-works-bot.service.js.bak line-works-bot.service.js
  pm2 restart wt-back --update-env
'
```

**복구 백업 반드시** (`.bak` + 진단 후 원복).

### 4. 외부 API 직접 호출

LINE WORKS Bot API 예시:
```bash
# JWT → access_token 발급
curl -sX POST https://auth.worksmobile.com/oauth2/v2.0/token \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  -d "assertion={JWT}" \
  -d "client_id={CLIENT_ID}" \
  -d "client_secret={CLIENT_SECRET}" \
  -d "scope=bot"

# 문제 엔드포인트 직접 호출
curl -i -H "Authorization: Bearer {token}" \
  "https://www.worksapis.com/v1.0/bots/{botId}/attachments/{fileId}"
```

응답이 302 리다이렉트 → 크로스 오리진 재인증 이슈 가능성 (issue.md #2 참조).

## 알려진 이슈 패턴 (issue.md)

### #1: S3 설정 누락
`WARN LineWorksBotService: S3 is not configured; skipping attachment download`
→ `.env`에 `AWS_REGION`, `S3_BUCKET_LINE_WORKS`, `S3_OBJECT_PREFIX`, `S3_PRESIGN_TTL_SECONDS` 추가 후 `pm2 restart --update-env`.

### #2: 첨부 다운로드 401 (크로스 오리진 리다이렉트)
Node fetch `redirect: "follow"`가 다른 origin으로 리다이렉트할 때 Authorization을 떨어뜨림.
→ `redirect: "manual"` + 매 hop 마다 Authorization 재첨부. [libs/line-works-bot.ts](back/src/libs/line-works-bot.ts)의 `fetchAttachmentStream` 패턴 재사용.

### #3: 1:1 DM 이벤트가 channelId 없음
LINE WORKS 1:1 대화는 `source.channelId`가 없다.
→ `resolveChannelId()` 헬퍼로 `userId`를 `dm:<userId>`로 synthesize. allowlist 등록도 동일 형식.

## 해결 후 필수 기록

`issue.md` 상단에 섹션 추가 (기존 포맷 동일):

```markdown
## YYYY-MM-DD
### #N — {한 줄 증상}
**증상**
- ...

**진단 로그**
```
...
```

**진단 과정**
1. ...
2. ...

**원인**
...

**해결**
...

**관련 파일**
- [경로](상대경로)

**재현 확인 방법**
...
```

동일 원인 재발 시 해당 기존 섹션 아래에 "재발 {날짜}" 블럭만 추가하고 새 섹션 만들지 않음.

## 체크리스트

- [ ] Nginx 로그에서 요청 수신 확인
- [ ] 응답 body 크기로 유형 분류
- [ ] 알려진 패턴(issue.md)과 대조
- [ ] 필요시 payload 직접 덤프 (임시 로그 + 복구)
- [ ] 외부 API 직접 호출로 토큰/권한 검증
- [ ] `.env.example`에 신규 변수 반영되었는지 확인
- [ ] issue.md에 해결 기록
- [ ] EC2 변경 사항 `pm2 restart --update-env` 후 검증
