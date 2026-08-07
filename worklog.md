# Work Log

## 2026-04-16 — AWS MCP 셋업 + EC2 배포 + 도메인 연결 (HTTPS)

### 목표
비공개 AWS 계정의 EC2에 `work-tracking` 레포를 배포하고, `<PRODUCTION_HOST>`에 HTTPS로 연결한다.

### 최종 결과
- 🔗 **https://<PRODUCTION_HOST>** — 브라우저 접속 가능
- `/` → Next.js 프론트, `/api/*` + `/health` → NestJS 백엔드
- HTTP → HTTPS 자동 리다이렉트, Let's Encrypt 인증서 자동 갱신 타이머 등록

---

## 1. AWS MCP 서버 이중 등록 (개인 계정 추가)

### 기존 상태
- `~/.claude.json`에 `aws-api-local` MCP 서버가 이미 등록되어 있었음
- 회사 계정 (`<COMPANY_AWS_ACCOUNT_ID>`, IAM 유저: `<READ_ONLY_IAM_USER>`, read-only)
- `~/.aws/credentials`의 `[default]` 프로필을 사용
- `run-http.sh`가 `USER_HOME/.aws/credentials`를 명시적으로 지정하는 구조

### 새로 추가한 서버: `aws-api-<PRIVATE_PROFILE>`
- 스크립트(`run-http.sh`)는 재사용하고 `.claude.json`의 `env` 블록에서 환경변수로 분기
- 별도 스크립트 복사 없이 stdio 모드라 포트 충돌 걱정 없음
- `.env` 파일을 만들면 기존 `aws-api-local`까지 영향받기 때문에 반드시 `.claude.json`의 `env` 필드에서 주입

```json
"aws-api-<PRIVATE_PROFILE>": {
  "type": "stdio",
  "command": "/absolute/path/to/aws-api-mcp-server/run-http.sh",
  "args": [],
  "env": {
    "AWS_API_MCP_PROFILE_NAME": "<PRIVATE_PROFILE>",
    "AWS_REGION": "ap-northeast-2",
    "READ_OPERATIONS_ONLY": "false"
  }
}
```

- `~/.aws/credentials`에 `[<PRIVATE_PROFILE>]` 프로필 추가
- 검증: `aws sts get-caller-identity` 두 서버 동시 호출
  - `aws-api-local` → `arn:aws:iam::<COMPANY_AWS_ACCOUNT_ID>:user/<READ_ONLY_IAM_USER>`
  - `aws-api-<PRIVATE_PROFILE>` → `arn:aws:iam::<PRIVATE_AWS_ACCOUNT_ID>:user/<PRIVATE_IAM_USER>`
- 최초엔 `READ_OPERATIONS_ONLY=true`로 시작, 도메인 연결 단계에서 `false`로 전환 (쓰기 작업 필요)

---

## 2. EC2 현황 파악

### 기존 인스턴스
- Instance ID: `<EC2_INSTANCE_ID>`
- Name: `<EC2_INSTANCE_NAME>`
- Type: `t2.micro`
- AMI: `<AMI_ID>` (Amazon Linux 2023, kernel 6.1.166)
- Region: `ap-northeast-2`
- Private IP: `<EC2_PRIVATE_IP>`
- Security Group: `<SECURITY_GROUP_ID>`
- **KeyName: null** (생성 시 키페어 미지정)
- **IamInstanceProfile: null**
- SSM 등록 안 됨

### 초기 오판과 정정
- `KeyName=null` + SSM 미등록 상태만 보고 “원격 접속 수단이 없다”고 판단 → **오판**
- 사용자가 지적: `~/.ssh/id_rsa`에 기존 프라이빗 키가 있고 EC2의 `authorized_keys`에 공개키가 이미 들어 있는 상태
- `ssh -i "$SSH_KEY_PATH" "$PRODUCTION_SSH_TARGET"` 접속 성공
- 교훈: AWS 메타데이터가 null이어도 인스턴스 내부에서 수동으로 키를 주입했을 수 있다. 외부 확인만으로 결론짓지 말 것

### 초기 리소스 상태
- Disk: 8GB 중 1.6GB 사용
- Memory: 961MiB total, 704MiB available
- Swap: 없음
- 설치된 런타임: `python3`만 (git/node/docker/nginx 전부 없음)
- 열린 포트: 22 (SSH)만

---

## 3. 레포 클론 — GitHub 인증

### private 레포 문제
- `https://github.com/nes0903/work-tracking.git`은 private
- GitHub API 404, EC2엔 GitHub 자격증명 없음

### 처음 제안했던 방법들 (사용자 거절)
1. ❌ **로컬에서 클론 후 rsync** — 소스 관리가 로컬/서버로 갈라짐
2. ❌ **deploy key 생성 후 GitHub에 수동 등록** — 키 관리 번거로움

### 최종 선택: `gh auth login` (디바이스 플로우)
- Amazon Linux 2023에 NodeSource gh-cli 리포를 추가하고 `gh` 설치
- `gh auth login -h github.com -p https -w` 백그라운드 실행 → 원타임 코드(`<ONE_TIME_CODE>`) 출력
- 브라우저에서 https://github.com/login/device 로 인증 → `nes0903` 계정으로 로그인 완료
- 토큰 스코프: `gist`, `read:org`, `repo`

### 클론 트러블
- `git clone https://github.com/...`는 credential helper 연결이 안 돼서 실패 (`could not read Username for 'https://github.com'`)
- `gh auth setup-git` 실행해도 `credential.helper` 설정이 비어있는 문제
- 해결: `gh repo clone nes0903/work-tracking` 사용 (gh가 직접 토큰 주입)

### 레포 구조 파악
- npm workspaces 모노레포
- `back/` — NestJS 11 + TypeScript + `node:sqlite` (Node 내장 SQLite)
- `front/` — Next.js 16 (webpack) + React 19
- `.env.example` 두 개 (`back/`, `front/`)
- `back/src/main.ts`의 CORS는 `localhost:3000`만 허용 (나중에 수정 필요)

---

## 4. EC2 환경 준비

### 설치 체인
1. **Node 20 LTS** (NodeSource setup_20.x) + PM2 전역 설치
2. **Swap 2GB** 생성 (`/swapfile`, `vm.swappiness=10`, `/etc/fstab` 등록)
   - t2.micro의 961MB RAM으로는 Next 16 webpack 빌드가 OOM 날 수 있어서 방어용 스왑
   - 실제로는 빌드 중 swap 사용량 0KiB였음 (페이지 수가 3개뿐인 작은 앱이라 피크 585MB에 그침)
3. `npm ci` (루트 워크스페이스) — 878 packages, 42초, node_modules 726MB

### 환경변수 생성
- `back/.env` — `PORT=3001`, `NOTION_API_TOKEN=replace_me` 등 (Notion 웹훅은 현재 미사용)
- `front/.env` — `BACKEND_BASE_URL=http://127.0.0.1:3001`

### 빌드
- `npm run build:back` — 9.8초, 여유 메모리
- `npm run build:front` — 31.9초, 피크 585MB/961MB, 페이지 3개(`/`, `/_not-found`) 정적 생성
- Swap 전혀 사용되지 않음 → 방어선으로만 존재

---

## 5. PM2로 프로세스 관리

### `ecosystem.config.js`
- `wt-back`: `cwd=back/`, `script=npm`, `args=run start:prod`, `PORT=3001`, `max_memory_restart=300M`
- `wt-front`: `cwd=front/`, `script=npm`, `args=run start`, `PORT=3000`, `max_memory_restart=400M`
- 둘 다 `interpreter: 'none'` (npm은 shell wrapper라 node로 감싸면 안 됨)
- 로그는 `~/logs/`로

### 첫 기동 크래시 (Node 버전 문제)
- `wt-back`이 즉시 재시작 루프 (16회)
- 로그:
  ```
  Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
    at /home/ec2-user/work-tracking/back/dist/libs/sqlite-db.js:13:23
  ```
- 원인: 백엔드가 `node:sqlite` (Node 내장 SQLite 모듈)을 사용. 이 모듈은 **Node 22.5+** 부터만 존재. 설치한 Node 20에는 없음

### Node 22 업그레이드
- `dnf install -y nodejs`가 기존 버전 스킵 (`Nothing to do`) — NodeSource repo 스위치 후에도
- 해결: `sudo dnf remove -y nodejs` 후 `sudo dnf install -y nodejs` (NodeSource setup_22.x)
- 결과: **Node 22.22.2** 설치 완료
- 검증: `node -e "require('node:sqlite')"` → `OK: function` (experimental warning만)

### 재기동
- `pm2 delete all` → `pm2 kill` → Node 업그레이드 → pm2 재설치 → `pm2 start ecosystem.config.js`
- 정상 기동:
  - `wt-back` PID listen on `:3001` — Nest 부트스트랩 완료, 라우트: `/health`, `/api/dashboard`, `/api/notion-updates`, `/api/github-updates`, `/api/notion/webhook`
  - `wt-front` PID listen on `:3000` — next-server ready

### 영속화
- `pm2 save` — dump 파일 생성
- `pm2 startup systemd -u ec2-user --hp /home/ec2-user` → systemd 유닛 `/etc/systemd/system/pm2-ec2-user.service` 생성 및 enable
- 재부팅 시 자동 복원 확인

### 로컬 검증
- `curl http://127.0.0.1:3001/health` → 200 `{"ok":true,"service":"work-tracking-back"}`
- `curl http://127.0.0.1:3000/` → 200

---

## 6. 도메인 연결 (AWS 쓰기 작업)

### 사전 작업
- `~/.claude.json`의 비공개 AWS 프로필 `READ_OPERATIONS_ONLY`를 `"true"` → `"false"`로 변경
- Claude Code 재시작

### EIP 비용 안내 (사용자 질문에 답변)
- 2024-02-01부터 AWS 퍼블릭 IPv4는 사용 상태 무관하게 과금
- 시간당 $0.005 ≈ **월 $3.65**
- 기존 인스턴스에 이미 퍼블릭 IP가 붙어 있었으므로 EIP를 할당한다고 추가로 드는 비용은 **없음** (동일 금액)
- 이득: 재부팅 시 IP 고정 → Route53 레코드 안 깨짐

### 서브도메인 선택
- `apex (<ROOT_DOMAIN>)` vs `www.<ROOT_DOMAIN>` vs 서브도메인 → **`<PRODUCTION_HOST>`** 선택

### AWS 리소스 생성 (MCP로 직접 처리)
| 작업 | 결과 |
|---|---|
| EIP 할당 | `<EC2_PUBLIC_IP>` (`<EIP_ALLOCATION_ID>`), 태그 `Name=<EC2_INSTANCE_NAME>-eip`, `Purpose=work-tracking` |
| EIP → EC2 연결 | `<EIP_ASSOCIATION_ID>` |
| SG 80/tcp 인바운드 | `<HTTP_SECURITY_GROUP_RULE_ID>` (0.0.0.0/0, Description=http) |
| SG 443/tcp 인바운드 | `<HTTPS_SECURITY_GROUP_RULE_ID>` (0.0.0.0/0, Description=https) |
| Route53 A 레코드 | `<PRODUCTION_HOST> → <EC2_PUBLIC_IP>`, TTL 300, Hosted Zone `<HOSTED_ZONE_ID>`, ChangeId `<ROUTE53_CHANGE_ID>` |

### 퍼블릭 IP 전환
- 기존: `<OLD_PUBLIC_IP>` (dynamic) → 새: **`<EC2_PUBLIC_IP>`** (EIP)
- 기존 SSH 세션은 끊어지지 않고 유지됨 (PM2 프로세스 21분째 정상)
- 신 IP로 `ssh accept-new` 후 재연결 성공

---

## 7. Nginx 리버스 프록시

### 설치
- `sudo dnf install -y nginx certbot python3-certbot-nginx`
- Nginx 1.28.3, certbot 2.6.0

### 설정 파일 `/etc/nginx/conf.d/<PRODUCTION_HOST>.conf`
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <PRODUCTION_HOST>;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

- `nginx -t` 검증 후 `systemctl enable --now nginx`
- 첫 HTTP 검증: `curl http://<PRODUCTION_HOST>/health` → 200 (DNS 전파 완료, 프록시 정상)

---

## 8. HTTPS (Let's Encrypt)

### certbot이 뭔지 사용자에게 설명
- Let's Encrypt라는 무료 인증 기관의 공식 ACME 클라이언트
- `--nginx` 플러그인이 자동으로 Nginx 설정을 수정해 HTTPS 블록 추가 + HTTP→HTTPS 리다이렉트까지 처리
- 90일 단기 인증서, 자동 갱신 전제
- 이 프로젝트 규모에선 ALB+ACM 조합보다 훨씬 저렴 (월 $22 세이브)

### 발급
```bash
sudo certbot --nginx -d <PRODUCTION_HOST> \
  --non-interactive --agree-tos \
  --register-unsafely-without-email \
  --redirect
```

- 결과:
  - Cert: `/etc/letsencrypt/live/<PRODUCTION_HOST>/fullchain.pem`
  - Key: `/etc/letsencrypt/live/<PRODUCTION_HOST>/privkey.pem`
  - Type: ECDSA
  - 만료: **2026-07-14** (89일)
- certbot이 Nginx 설정에 443 리스너 + 301 리다이렉트를 자동 추가

### 자동 갱신 타이머 구성
- AL2023 certbot 패키지가 기본 제공하는 `certbot-renew.timer`가 enabled 상태 아니었음
- 수동으로 `/etc/systemd/system/certbot-renew.timer` 작성 후 활성화
  - `OnCalendar=*-*-* 03,15:00:00`, `RandomizedDelaySec=1h`
  - ExecStart: `certbot renew --quiet --deploy-hook "systemctl reload nginx"`
- `sudo certbot renew --dry-run` → 성공 (전체 파이프라인 검증)

---

## 9. CORS 수정 + 백엔드 재배포

### 문제
- `back/src/main.ts`의 `enableCors`에 `origin: ["http://localhost:3000", "http://127.0.0.1:3000"]`만 있어서 `https://<PRODUCTION_HOST>`에서 브라우저 JS가 API 호출 시 CORS 차단됨

### 수정
- EC2의 `back/src/main.ts`를 sed로 in-place 수정 → `"https://<PRODUCTION_HOST>"` 추가
- `npm run build:back`
- `pm2 restart wt-back`
- ⚠️ **이 수정은 EC2 로컬에서만 적용됨.** 원격 레포(main 브랜치)는 아직 수정 전. `git pull` 하면 덮어씀. PR로 올리는 게 맞음

---

## 10. 최종 E2E 검증

| URL | 결과 |
|---|---|
| `https://<PRODUCTION_HOST>/` | 200, `<title>Work Tracking Dashboard</title>`, Next cache HIT |
| `https://<PRODUCTION_HOST>/health` | 200, `{"ok":true,"service":"work-tracking-back"}` |
| `https://<PRODUCTION_HOST>/api/notion-updates` | 200 |
| `http://<PRODUCTION_HOST>/` | 301 → `https://` |
| TLS | Let's Encrypt `CN=<PRODUCTION_HOST>`, subject matches, verify OK |

---

## 최종 인프라 토폴로지

```
Internet
  │ HTTPS (TLS 1.3, Let's Encrypt ECDSA, auto-renew)
  ▼
Nginx 1.28.3  (EC2 443, 80→301)
  ├── /api/*, /health  →  127.0.0.1:3001  (NestJS, PM2: wt-back)
  └── /                →  127.0.0.1:3000  (Next.js, PM2: wt-front)
  │
  ▼
EC2 t2.micro  <EC2_INSTANCE_ID>
  OS: Amazon Linux 2023, kernel 6.1.166
  Node: 22.22.2 (node:sqlite 지원)
  PM2: 6.0.14 (pm2-ec2-user.service enabled)
  Swap: 2GB (/swapfile, swappiness=10)
  Public IP: <EC2_PUBLIC_IP> (EIP)
  Private IP: <EC2_PRIVATE_IP>
  SG: <SECURITY_GROUP_ID> (22, 80, 443)

DNS: Route53  <ROOT_DOMAIN>  (<HOSTED_ZONE_ID>)
  A  <PRODUCTION_HOST> → <EC2_PUBLIC_IP>
```

---

## 배운 점 / 교훈

1. **AWS 메타데이터의 null 값만 보고 “접속 불가”라고 단정짓지 말 것.** 인스턴스 내부에서 수동으로 `authorized_keys`를 주입했을 수 있음. 실제 SSH 시도로 검증하는 게 맞음.

2. **`node:sqlite`는 Node 22.5+ 전용.** 빌드는 tsc라 통과하지만 런타임에 로드 실패. 새 프로젝트에서 내장 sqlite를 쓰려면 LTS 버전 체크 필수.

3. **t2.micro(1GB RAM)의 Next 16 webpack 빌드**: 프로젝트 규모가 작으면(페이지 3개 수준) 피크 600MB 정도로 끝남. 중대형 프로젝트는 swap 필수.

4. **EIP 과금 정책(2024-02-01 이후)**: “연결돼 있으면 무료”가 더 이상 아님. 퍼블릭 IP 붙이는 순간 시간당 $0.005. 단, 이미 퍼블릭 IP가 있는 인스턴스라면 EIP로 바꿔도 동일 비용.

5. **MCP 서버 `env` 격리**: 같은 스크립트를 여러 MCP 서버에서 재사용할 땐 `.env` 파일 말고 `.claude.json`의 `env` 블록으로 주입해야 서로 영향 안 줌.

6. **npm workspaces + PM2**: `interpreter: 'none'` + `script: 'npm'` + `args: 'run ...'` 패턴이 가장 안정적. 워크스페이스 루트에 hoisted node_modules가 있어도 각 서브패키지의 `npm run` 스크립트가 잘 동작.

7. **certbot `--nginx` 플러그인**: HTTPS 블록 자동 생성 + 80→443 리다이렉트까지 원스텝. 수동으로 nginx conf 짜는 것보다 훨씬 빠름.

---

## 다음에 해야 할 일 (TODO)

- [ ] `back/src/main.ts`의 CORS 수정을 PR로 main에 반영 (현재 EC2 로컬만 반영됨)
- [ ] Notion / GitHub 통합 사용 시 `back/.env`의 `NOTION_API_TOKEN` 등 교체 후 `pm2 restart wt-back`
- [ ] certbot 계정에 실제 이메일 등록: `sudo certbot update_account --email <email>` (만료 임박 알림 수신용)
- [ ] 접근 제어가 필요하면 Nginx basic auth 또는 앱 레벨 인증 추가
- [ ] 백업 전략: SQLite 파일(`back/data/`)의 주기적 스냅샷 (간단히 cron + S3 sync)
- [ ] 모니터링: PM2 metrics 또는 CloudWatch Agent 설치 고려
