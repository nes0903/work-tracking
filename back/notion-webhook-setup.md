# Notion Webhook Setup

## 1. 환경 변수

`.env.local` 파일을 만들어 아래 값을 채웁니다.

```env
NOTION_API_TOKEN=secret_xxx
NOTION_WEBHOOK_VERIFICATION_TOKEN=secret_xxx
NOTION_API_VERSION=2022-06-28
```

## 2. 서버 실행

```bash
cd /Users/nes0903/Documents/work-tracking/back
export $(grep -v '^#' .env.local | xargs)
npm run start:dev
```

## 3. 공개 URL 필요

Notion은 `localhost`로 직접 보낼 수 없습니다. 공식 문서 기준으로 `public HTTPS endpoint`가 필요합니다.

예:

```bash
cloudflared tunnel --url http://127.0.0.1:3001
```

또는

```bash
ngrok http 3001
```

## 4. Notion Webhook URL

Notion integration의 Webhooks 설정에서 다음 URL을 넣습니다.

```text
https://<public-host>/api/notion/webhook
```

## 5. verification token

구독 생성 직후 Notion이 verification token을 POST로 보냅니다.

서버는 이 값을 아래 파일에 기록합니다.

- `data/notion-webhook-status.json`

그 값을 복사해서 Notion UI의 Verify modal에 붙여넣고, 동시에 `.env.local`의 `NOTION_WEBHOOK_VERIFICATION_TOKEN`으로 설정합니다.

## 6. 결과 파일

Webhook가 정상 수신되면 아래 파일이 갱신됩니다.

- `data/notion-updates.json`
- `data/notion-snapshot.json`
