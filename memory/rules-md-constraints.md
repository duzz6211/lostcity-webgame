---
name: rules-md-constraints
description: 이 레포의 RULES.md 최상위 작업 규칙 — bash/WSL 환경, 실행 금지, 범위 준수
metadata:
  type: feedback
---

lostcity 레포 루트의 RULES.md는 모든 지시보다 우선하는 최상위 규칙.

핵심:
- 환경은 **WSL/Ubuntu(bash)**. PowerShell/CMD 문법·Windows 경로 가정 금지. (단, 이 세션 Bash 도구는 win32라 `wsl -d Ubuntu -- bash -lc "..."`로 감싸 실행.)
- **실행 금지**: npm dev/build/test/install, 서버 구동, 배포, 커밋/push, 의존성 변경은 에이전트가 하지 않음 — 사용자가 직접. 에이전트는 코드/파일 작성·수정만.
- 허락 없이 가능한 점검은 4가지뿐: 수치 재확인, 일치 검토, 오탈자, 정의 누락. 그 외 발견 이슈는 보고만.
- 범위 밖 리팩토링/구조변경/라이브러리 추가 금지. 애매하면 먼저 질문.

**Why:** 사용자가 RULES.md를 "제대로 읽고 작업하라"고 반복 강조.
**How to apply:** 작업 끝나도 빌드/테스트 돌리지 말고 사용자에게 실행을 안내. 관련 [[quoridor-scope]].
