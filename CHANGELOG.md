# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [v2026-05-31] - 2026-05-31

### Added
- OAuth 2.1 authorization server: discovery endpoints, dynamic client registration, PKCE authorize/decision flow, token endpoint, revoke endpoint
- Consent UI with scope toggle — users can downgrade write→read access at the consent screen
- Integrations settings page — OAuth client management, revocation, MCP connect guide, access log
- AppMark component with Simple Icons CC0 brand glyphs for common OAuth clients
- MCP + OpenAPI Pages Function proxies (`/mcp`, `/openapi.json`)
- Physician share links — read-only access to patient records for external clinicians
- Account export, storage usage, and document review settings pages
- AI provider key management and per-use-case routing
- `favicon.ico` with 16/32/48px rasterized PNG layers

### Changed
- Personal Access Tokens (PAT) replaced by OAuth 2.1 tokens with `mcp_` prefix — PAT CRUD routes removed
- Worker: `CORS_ORIGIN` var, `JWT_SECRET` startup guard, `RATE_LIMITER` binding, AI Gateway cache TTL
- `requireSuperAdmin` now passes `x-api-key` requests through for internal service calls

### Fixed
- MCP: detect and normalize midnight-UTC timestamps emitted by LLMs
- MCP: fall back to current UTC time when only a date (no time) is provided for vitals/medications/notes
- OAuth: bypass Worker proxy for `GET /oauth/authorize` to prevent redirect loop
- PWA: explicit `favicon.ico` link for clients that cannot render inline SVG

## [2026-05-10] - 2026-05-10

### Changed
- Removed internal sanitization script that contained private identifiers
- Made branding and source links configurable for forks via Vite env vars
- Parameterized Cloudflare Pages project names in CI deploy workflow
- Added OSS community health files (Code of Conduct, issue/PR templates, Dependabot config)

## [1.4.2] - 2026-04

Initial public OSS release.
