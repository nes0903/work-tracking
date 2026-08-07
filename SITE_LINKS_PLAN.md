# 사이트 링크 관리 계획

> 사이드바에 하드코딩되어 있던 외부 사이트 바로가기들을
> **DB에 저장된 동적 목록 + 사이드바의 "사이트 링크" 버튼 → 모달** 로 전환한다.

---

## 1. 요구사항

1. 기존 하드코딩 링크 이름 개선
   - "서비스 열기" → **서비스 A 운영**
2. 신규 링크 추가
   - 서비스 B 관리자 개발 · `https://dev-admin.service-b.example.com`
   - 서비스 C 이용자 개발 · `https://dev.service-c.example.com`
   - 서비스 C 관리자 개발 · `https://admin-dev.service-c.example.com`
   - 서비스 B 이용자 개발 · `https://test.service-b.example.com`
   - 서비스 A 안내 · `https://info.service-a.example.com`
   - 서비스 A 개발 · `https://dev.service-a.example.com`
   - 서비스 D 개발 · `https://dev.service-d.example.com`
3. 사이드바에 직접 박지 않고, **"사이트 링크" 버튼** → **모달** 띄워 리디렉트
4. 하드코딩이 아닌 **동적 추가 / 수정 / 삭제** 가능

---

## 2. 데이터 모델

### `site_links` 테이블

```sql
CREATE TABLE IF NOT EXISTS site_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_site_links_order ON site_links(sort_order);
```

마이그레이션: `back/sqlite/schema.sql` + `runColumnMigrations(db)` 에서 빈 테이블이면 **초기 13개 링크 seed**.

---

## 3. API

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/site-links` | `sort_order ASC` 전체 조회 |
| POST | `/api/site-links` | `{label, url}` 생성 (sort_order 자동 = MAX+1) |
| PATCH | `/api/site-links/:id` | `{label?, url?, sortOrder?}` 부분 수정 |
| DELETE | `/api/site-links/:id` | 삭제 |

모든 엔드포인트 `AuthGuard` 적용.

---

## 4. 프론트

### `SiteLinksModal`
- 기본 모드: 링크 리스트 — 클릭 시 `window.open(url, "_blank", "noopener")`
- 편집 모드 토글: 각 항목에 **제거(×)** 버튼, 하단에 **"+ 새 링크"** 폼 (label / url)
- 편집 모드에서 label/url 클릭 시 inline 수정 (간단히 prompt 사용 or 텍스트 필드)

### 사이드바
- `QUICK_LINKS` 하드코딩 제거
- `사이드바-footer` 최상단에 **`사이트 링크` 버튼** 추가
- 버튼 클릭 → 모달 오픈

---

## 5. 파일 변경

```
back/
  sqlite/schema.sql                                     [수정] site_links 테이블
  src/libs/sqlite-db.ts                                 [수정] runColumnMigrations 에 seed 로직
  src/libs/site-links-db.ts                             [신규] CRUD 함수
  src/services/site-links/site-links.module.ts          [신규]
  src/services/site-links/controllers/site-links.controller.ts [신규]
  src/services/generals.ts                              [수정] 모듈 등록

front/
  src/lib/site-links-api.ts                             [신규]
  src/components/work-tracking/SiteLinksModal.tsx        [신규]
  src/components/work-tracking/WorkTrackingDashboard.tsx [수정] QUICK_LINKS 제거 + 버튼 + 모달
  styles.css                                             [수정] site-links 스타일
```

---

*작성일: 2026-04-20.*
