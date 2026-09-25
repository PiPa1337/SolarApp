# Estado de GitHub Actions

Desde el 2026-09-25, `.github/workflows/ci.yml` se activa en cada push de
cualquier rama y en todos los pull requests. Conserva los nombres de checks
usados en GitHub, pero cada job termina con éxito sin instalar dependencias ni
ejecutar formatter, typecheck, tests, E2E, build, budgets o benchmarks.

El check verde es intencionalmente sólo una señal operativa: **no confirma que la
aplicación compile ni que sus tests pasen**. Los comandos de validación local
siguen disponibles en [`TESTING.md`](TESTING.md), pero GitHub no los ejecuta.
