# LINE WORKS Bot 연동 계획

> 특정 채팅방의 **첨부 파일 + 링크**를 자동으로 수신·저장하기 위한 봇 연동 설계.

---

## 1. 목표

- LINE WORKS의 특정 채팅방에 봇을 초대해두고,
- 그 방에 올라오는 **파일/이미지 첨부**와 **URL 링크**를 자동으로 DB에 기록한다.
- 대시보드 프론트에서 "LINE WORKS Archive" 뷰로 조회 (추후).

---

## 2. 전제 조건

### Developer Console 준비물
| 항목 | 용도 | 저장 위치 |
|---|---|---|
| Bot ID | 봇 식별자 | `.env` |
| Bot Secret | 콜백 서명 검증 (HMAC-SHA256) | `.env` |
| Service Account (`xxx@domain`) | Server API JWT 주체 | `.env` |
| Private Key (.pem) | JWT RS256 서명 | `./secrets/private.pem` (gitignore) |
| Client ID / Client Secret | JWT → access token 교환 | `.env` |
| Target Channel ID(s) | 어느 채팅방만 수집할지 | `.env` |

### 플랫폼 조건
- **HTTPS 콜백 URL 필수** — 현재 SSO용으로 준비 중인 도메인 그대로 재사용 가능
- 조직 관리자가 **봇 사용 승인 + 채팅방에 봇 초대** 수행
- 봇이 채팅방 멤버 목록에 **노출됨** (은닉 불가)

---

## 3. 아키텍처

```
 채팅방 이벤트
     │
     ▼
 LINE WORKS 서버 ── POST ──▶ /api/line-works-bot/callback  (HTTPS)
                                │
                                ├─ (a) X-WORKS-Signature HMAC 검증
                                ├─ (b) source.channelId 허용 리스트 검증
                                ├─ (c) content.type 분기
                                │     ├ text   → URL regex 추출 → line_works_links
                                │     ├ image  → fileId 다운로드 → line_works_attachments
                                │     ├ file   → fileId 다운로드 → line_works_attachments
                                │     └ 그 외 → line_works_messages(raw_json)만 저장
                                └─ (d) ACK 200
```

### 인증 경로 (SSO와 별개)

```
 JWT(RS256, sub=serviceAccount, aud=authURL, exp=+1h)
   │  signed with private.pem
   ▼
 POST /oauth2/v2.0/token   grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
   │
   ▼
 bot access_token (유효 24h, 캐시 후 재사용)
   │
   ▼
 GET /v1.0/bots/{botId}/attachments/{fileId}   Authorization: Bearer <token>
   │
   ▼
 파일 바이너리 스트림
   │
   ▼
 S3 PutObject (Bucket: line-works-archive, Key: line-works/<fileId>/<fileName>)
   │
   ▼
 DB에 { s3_bucket, s3_key } 저장
```

### 파일 조회 경로 (S3 Presigned URL)

```
 브라우저 ── GET /api/line-works-attachments/:id ──▶ 백엔드
                                                     │
                                                     ├ AuthGuard
                                                     ├ DB 조회 → s3_key
                                                     ├ SDK로 presigned URL 생성 (유효 10분)
                                                     │
 브라우저 ◀── { url: "https://...X-Amz-..." } ──────┤
          │
          └ GET <presigned url> ──────────────────▶ S3 (직접 다운로드)
```

- **S3 버킷은 private 유지**. 우리 서버만 객체 접근 권한 보유.
- 우리 서버는 바이트 전송에 관여 안 함 → 대역폭/메모리 부담 0.
- URL 유효시간 짧게(10분) + 요청마다 재발급.

---

## 4. 신규 파일 / 모듈

### Backend
```
back/src/libs/line-works-bot.ts
  - loadBotConfig(): env 로드
  - issueAccessToken(): JWT 생성 → access_token 교환 + 메모리 캐시
  - verifyCallbackSignature(rawBody, signature): HMAC 검증
  - fetchAttachmentStream(fileId): S3 PutObject용 ReadableStream 반환
  - extractLinksFromText(text): 정규식 URL 추출

back/src/libs/s3.ts
  - getS3Client(): 공용 S3Client 인스턴스 (region, credentials)
  - putObjectFromStream(key, stream, metadata): S3 업로드
  - presignGetUrl(key, expiresSeconds): 조회용 short-lived URL
  - buildObjectKey(fileId, fileName): 예) "line-works/<fileId>/<safeFileName>"

back/src/libs/line-works-bot-db.ts
  - saveMessage(event)
  - saveAttachment(message_id, file_id, metadata, s3_bucket, s3_key)
  - saveLinks(message_id, urls[])
  - getAttachmentById(id)

back/src/services/line-works-bot/
  ├ line-works-bot.module.ts
  ├ controllers/
  │   ├ line-works-bot-webhook.controller.ts            # POST /api/line-works-bot/callback (public + signature)
  │   └ line-works-attachments.controller.ts            # GET /api/line-works-attachments/:id (AuthGuard)
  └ applications/line-works-bot.service.ts              # 이벤트 dispatch + S3 업로드 orchestration

back/sqlite/schema.sql                                   # 아래 테이블 추가
back/secrets/.gitignore                                  # private.pem 제외
```

### Frontend (추후)
- Sidebar 추가 뷰 `LINE WORKS Archive`
- `/api/line-works-archive`로 최근 파일/링크 조회 → 대시보드 리스트 UI

---

## 5. 스키마

```sql
CREATE TABLE IF NOT EXISTS line_works_messages (
  message_id    TEXT PRIMARY KEY,
  channel_id    TEXT NOT NULL,
  user_id       TEXT,
  domain_id     TEXT,
  content_type  TEXT NOT NULL,        -- text|image|file|sticker|location|unknown
  text          TEXT,
  issued_at     TEXT,
  raw_json      TEXT NOT NULL,
  received_at   TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_line_works_messages_channel_issued
  ON line_works_messages(channel_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS line_works_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    TEXT NOT NULL,
  file_id       TEXT NOT NULL,
  file_name     TEXT,
  file_size     INTEGER,
  mime_type     TEXT,
  s3_bucket     TEXT NOT NULL,
  s3_key        TEXT NOT NULL,
  uploaded_at   TEXT,
  FOREIGN KEY (message_id) REFERENCES line_works_messages(message_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_line_works_attachments_message
  ON line_works_attachments(message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_works_attachments_s3_key
  ON line_works_attachments(s3_bucket, s3_key);

CREATE TABLE IF NOT EXISTS line_works_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  url        TEXT NOT NULL,
  found_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES line_works_messages(message_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_line_works_links_message
  ON line_works_links(message_id);
```

---

## 6. 환경 변수

```bash
# ---- LINE WORKS Bot ----
LINE_WORKS_BOT_ID=
LINE_WORKS_BOT_SECRET=
LINE_WORKS_SERVICE_ACCOUNT=            # ex) xxx@yourdomain
LINE_WORKS_CLIENT_ID=                  # 기존 SSO와 같을 수도, 분리할 수도
LINE_WORKS_CLIENT_SECRET=
LINE_WORKS_PRIVATE_KEY_PATH=./secrets/line-works-bot.pem

# 허용 채팅방 (쉼표 구분). 비우면 전체 허용은 하지 않음 — 반드시 명시.
LINE_WORKS_TARGET_CHANNEL_IDS=

# ---- S3 ----
AWS_REGION=ap-northeast-2
S3_BUCKET_LINE_WORKS=                         # 전용 private 버킷 이름
S3_OBJECT_PREFIX=line-works/                          # 버킷 내부 네임스페이스
S3_PRESIGN_TTL_SECONDS=600                            # 10분

# AWS 자격증명: 둘 중 하나만 쓸 것 — (권장) IAM Role 방식이면 아래 키 둘 다 비우기
AWS_ACCESS_KEY_ID=                                    # 선택 (로컬/개발용)
AWS_SECRET_ACCESS_KEY=                                # 선택 (로컬/개발용)
```

---

## 7. 구현 작업 순서

1. **봇 등록**: Developer Console → 봇 생성 → Callback URL 등록 → 조직 승인 → 대상 채팅방에 초대
2. **S3 버킷 + IAM 셋업**
   - 전용 버킷 생성 (`ap-northeast-2`, Public Access **전부 차단**, 기본 암호화 SSE-S3 또는 SSE-KMS)
   - IAM 정책: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/line-works/*`
   - **EC2 Instance Profile(Role)에 이 정책을 붙이는 방식 권장** (access key를 서버에 두지 않음)
   - 로컬 개발 시에만 `AWS_ACCESS_KEY_ID/SECRET` 사용
   - (옵션) 라이프사이클 룰: 90일 후 IA 이동, 1년 후 Glacier 등
3. **의존성 추가**: `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
4. **스키마 마이그레이션**: 3개 테이블을 `schema.sql`에 추가 (`IF NOT EXISTS`라 기존 DB 호환)
5. **`libs/s3.ts` 작성**: S3Client 싱글턴, `putObjectFromStream`, `presignGetUrl`
6. **`libs/line-works-bot.ts` 작성**: JWT 생성(Node `crypto` + RS256), `/oauth2/v2.0/token` 교환, access_token 메모리 캐시, 첨부 스트림 조회
7. **콜백 컨트롤러**: `POST /api/line-works-bot/callback`
   - rawBody 받아 `X-WORKS-Signature` 검증
   - `source.channelId` 허용 리스트 필터
   - content.type별 분기 저장
   - image/file이면 LINE WORKS → S3 스트리밍 업로드 → `{s3_bucket, s3_key}` DB 기록
   - 응답 200 즉시 반환 (파일 업로드는 비동기 큐로 빼면 이상적)
8. **조회 컨트롤러**: `GET /api/line-works-attachments/:id` (AuthGuard 적용)
   - DB 조회 → `presignGetUrl(s3_key, 600)` → `{ ok, url, fileName }` 반환
9. **링크 추출**: `/\bhttps?:\/\/\S+/gi` 로 URL 파싱. Works 전송 시 줄바꿈/공백으로 구분되는 경우가 많음
10. **정상 동작 검증**:
    - 텍스트에 URL 포함 메시지 → `line_works_links` row 생성
    - 이미지 업로드 → S3 콘솔에서 객체 존재 확인, DB `s3_key` 매칭
    - `/api/line-works-attachments/:id` 호출 → presigned URL 반환, 브라우저에서 실제 다운로드 성공
11. **(옵션)** Feed SSE에 `source: "line-works"` 추가해 프론트 실시간 푸시
12. **(옵션)** 프론트 사이드바에 `LINE WORKS Archive` 탭 + 리스트 뷰 (파일 썸네일 = presigned URL)

---

## 8. 한계 및 유의점

- **히스토리 백필 불가** — 봇 초대 이후 메시지만 수신. 이전 메시지는 안 옴.
- **봇이 멤버로 보임** — 채팅방 멤버들에게 노출됨. 은닉 감시 불가.
- **파일 크기 제한** — 업로드 200MB 수준. 초과 시 다운로드 실패 가능.
- **Rate limit** — Content Download API에 시간당 요청 제한 있음. 대량 수신 시 큐잉 필요할 수 있음.
- **토큰 수명** — Bot access_token은 24시간. 메모리 캐시 + 만료 5분 전 재발급.
- **봇 비활성화 시 이후 메시지 미수신**. 운영자가 봇을 방에서 내보내면 끝.
- **Private Key 보관** — `secrets/` 디렉터리 `.gitignore`에 반드시 포함. 유출 시 봇 인증 완전 탈취됨.
- **삭제 메시지/수정** — `message.delete` `message.edit` 같은 이벤트 타입은 현재 기본 저장 대상 아님. 필요시 content.type 분기에 추가.

### S3 관련 주의
- **버킷 Public Access는 전부 차단**. 실수로 공개 설정되면 곧바로 파일 유출.
- **SSE 기본 암호화** 켜기 (S3-managed keys로 충분, 민감도 높으면 KMS).
- **IAM 권한 최소화** — 앱이 접근하는 prefix(`line-works/*`)에만 권한. 버킷 전체 권한 지양.
- **Presigned URL 유효시간**은 10분 이하 권장. 유출 위험을 시간 단위로 끊어냄.
- **CORS 설정 불필요** — 프론트는 API만 호출하고, 받은 presigned URL은 브라우저 네이티브 GET으로 접근.
- **비용 모니터링** — Storage($0.023/GB·월)보다 **요청 수(GET 1000건당 $0.0004)**, **GET 대역폭(outbound $0.09/GB)**에 주의.
- **라이프사이클 룰**로 오래된 파일은 IA(Infrequent Access)/Glacier로 이동시키면 장기 비용 절감.

---

## 9. 다음 액션

- [ ] Developer Console에서 봇 등록 + 키 발급
- [ ] 대상 채팅방 channelId 확보 (봇이 입장한 뒤 첫 메시지 콜백에서 획득 가능)
- [ ] 전용 S3 버킷 생성 (public 전면 차단, SSE 기본 암호화)
- [ ] EC2 Instance Profile에 `s3:PutObject/GetObject/DeleteObject` 권한 부여 (prefix 제한)
- [ ] `.env` 채움 (LINE WORKS + S3 둘 다)
- [ ] 위 구현 순서 1~10번 착수

---

*작성일: 2026-04-19. 수정 시 이 문서를 그대로 갱신할 것.*
