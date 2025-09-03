<!-- Powered by BMAD™ Core | seed v1 -->
# System Architecture Overview

Project: example-project
Version: draft (BMAD v4 compatible)

## 1. Context
- Business context: TODO
- Users and external systems: TODO

## 2. Tech Stack
- Node.js: 24.7.0 (asdf)
- Python: 3.13.7 (asdf)
- Package managers: npm, pip
- Env tooling: direnv, asdf

## 3. High-Level Diagram
Describe core components and how they interact. Add a diagram later.

## 4. Source Tree
- app entrypoint: index.js
- scripts: package.json (dev/start)
- docs: docs/ (PRD, Architecture)

## 5. Cross-Cutting Concerns
- Configuration: .envrc, .tool-versions
- Observability: TODO
- Security: TODO

## 6. Quality & Testing
- Test levels: unit, integration, e2e (see .bmad-core/data/test-levels-framework.md)
- Strategy: TODO

## 7. Risks & Mitigations
- Risk: TODO
- Mitigation: TODO

## 8. Architecture Decisions (ADR Log)
- ADR-0001: Initialize minimal dev server and docs (this file)

---
Generated as a minimal seed aligned with .bmad-core/core-config.yaml (architecture v4).