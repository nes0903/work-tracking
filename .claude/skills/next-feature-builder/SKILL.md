---
name: next-feature-builder
description: work-tracking 프론트엔드에 Next.js 페이지·컴포넌트·lib 클라이언트를 추가·수정한다. src/components/work-tracking 및 src/lib 패턴을 엄격히 유지. 사용자가 "프론트 추가", "UI", "페이지", "모달", "대시보드 화면" 같은 말을 하거나 front-engineer가 구현을 시작할 때 반드시 이 스킬을 사용.
---

# next-feature-builder

## 역할

Next.js 16 + React 19 + Tailwind 4 환경에서 새 컴포넌트/페이지/lib 클라이언트를 생성·확장한다. 항상 기존 컴포넌트(`WorkTrackingDashboard.tsx`, `TaskList.tsx`, `CalendarView.tsx`)를 읽어 스타일을 맞춘다.

## 파일 배치 규약

### 라우트 (Next App Router)
```
front/src/app/
├── layout.tsx          # 루트 레이아웃 (건드리지 않는 것이 원칙)
├── page.tsx            # 메인 대시보드
└── {name}/page.tsx     # 신규 라우트
```

### 컴포넌트
- **원시 UI**: `src/components/ui/` — `Button`, `Chip`, `Surface`, `SectionHeading`
  - 새 원시 추가는 설계 합의 후에만. 대부분 기존 원시로 해결 가능.
- **도메인 컴포넌트**: `src/components/work-tracking/{Name}.tsx` 단일 깊이
  - 모달은 `XxxModal.tsx`
  - 탭/리스트/카드는 `XxxList.tsx`, `XxxCard.tsx`

### API 클라이언트 (lib)
```
front/src/lib/
└── {domain}-api.ts
```
- 도메인당 한 파일
- 함수 단위 export (`fetchXxx`, `createXxx`, `updateXxx`, `deleteXxx`)
- 응답 타입은 같은 파일에서 `export type ...`로 선언

## 작성 패턴

### lib 클라이언트 템플릿
```ts
// src/lib/xxx-api.ts
export interface XxxItem {
  id: number;
  title: string;
  // 백엔드 응답과 정확히 일치
}

export interface XxxListResponse {
  ok: boolean;
  items: XxxItem[];
  total: number;
}

export async function fetchXxxList(
  params: { q?: string; status?: string } = {},
): Promise<XxxListResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  const url = `/api/xxx${qs.size ? `?${qs}` : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch xxx: ${res.status}`);
  return res.json();
}
```
- `credentials: "include"` 반드시 포함 (세션 쿠키)
- 에러 응답은 `throw`로 위임 (컴포넌트가 처리)

### 컴포넌트 템플릿
```tsx
"use client";

import { useEffect, useState } from "react";
import { Surface, SectionHeading, Button, Chip } from "@/components/ui";
import { fetchXxxList, type XxxItem } from "@/lib/xxx-api";

export function XxxList() {
  const [items, setItems] = useState<XxxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchXxxList()
      .then((res) => { if (!cancelled) setItems(res.items); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Surface>불러오는 중…</Surface>;
  if (error) return <Surface>오류: {error}</Surface>;
  if (items.length === 0) return <Surface>항목이 없습니다.</Surface>;

  return (
    <Surface>
      <SectionHeading>제목</SectionHeading>
      {/* 실제 렌더링 */}
    </Surface>
  );
}
```

### 3상태 필수
모든 페치 컴포넌트는 **loading / error / empty / data** 4가지를 다 처리.

### Tailwind
- 기존 컴포넌트를 먼저 읽어 클래스 관례(간격·색·둥근 정도) 파악
- 마법 숫자 금지 — 기존에 쓰이는 간격·반경 값 재사용
- 커스텀 CSS 파일 생성 금지. `globals.css`와 Tailwind로 해결.

## 체크리스트

- [ ] lib 응답 타입이 백엔드 DTO와 1:1 일치 (qa가 검증할 항목)
- [ ] 모든 fetch에 `credentials: "include"`
- [ ] loading / error / empty / data 4상태 처리
- [ ] 파일 위치가 `components/ui/` 또는 `components/work-tracking/` 단일 깊이
- [ ] 원시 UI (Button, Chip, Surface, SectionHeading) 재사용
- [ ] `npm run lint:front` 통과
- [ ] `npm run build:front` 통과 (타입체크 포함)

## 금지

- 컴포넌트에서 직접 `fetch()` 호출 — 반드시 lib 경유
- `any` 타입 남용 (응답 타입을 제대로 선언)
- `styles.css` 직접 수정 (Tailwind 빌드 산출물)
- CSS 모듈/styled-components 도입 — 기존 Tailwind로 통일
