---
name: quoridor-scope
description: Quoridor 구현 범위 결정 — 2인 전용, src/quoridor 독립 모듈, 로컬 핫시트 MVP
metadata:
  type: project
---

task/05-29-task-1.md(Quoridor 명세)에 따라 lostcity 레포에 Quoridor를 구현하는 작업.

확정 범위:
- **2인 전용**. 4인 플레이(명세 3.2)는 구현하지 않음 — 사용자가 명시적으로 2인만 요청.
- 배치: `src/quoridor/` 독립 모듈(engine/ui/net + controllers.ts). 기존 Lost Cities 코드와 격리. App.tsx 라우팅 `#/quoridor*` → QuoridorApp(내부 라우터: lobby / local / r/CODE).
- 1차(05-30): 룰 엔진 + 로컬 핫시트 UI (MVP 1~7단계).
- 2차(05-31): **벽 설치 드래그앤드롭**(WallTray에서 끌어 보드로, snapWall로 가장 가까운 교차점+방향 스냅, 모드리스 UX), **Supabase 멀티플레이**.

멀티플레이 = **클라이언트 권위** 모델(사용자 선택):
- 룰 검증은 TS 엔진(`engine/`)에서. DB는 턴 소유권+version+상대입장만 enforce.
- 마이그레이션: `supabase/migrations/2026-05-30-quoridor.sql`. 테이블 `quoridor_games`(공개 상태 JSONB, Realtime publish) + `quoridor_players`(토큰 비공개, RLS 잠금). RPC: quoridor_create/join/apply/restart (security definer).
- **토큰은 절대 quoridor_games에 넣지 말 것** — Realtime/SELECT로 노출되어 턴 위조 가능. players 테이블에만.
- 클라이언트: `net/quoridorApi.ts`(RPC+직접 select+realtime 구독), `controllers.ts`(useLocalController/useOnlineController, 공통 Controller 인터페이스).

**Why:** SQL로 BFS/점프/벽규칙 재구현은 과대, 완전정보 게임이라 상태 공개 무방.
**How to apply:** 4인 로직 금지. 사용자가 SQL 마이그레이션을 Supabase에 직접 적용해야 함. [[rules-md-constraints]] 준수.
