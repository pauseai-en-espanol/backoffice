---
'@backoffice/db': patch
'@backoffice/api': patch
---

Every database connection runs without Postgres's JIT. The planner's estimate for the attention view passes
`jit_above_cost` with a few hundred people, and compiling the plan took ~0.6 s of a ~0.65 s Hoy (and as much of the
Onboarding Pipeline), on every load: the query itself runs in ~20 ms.
