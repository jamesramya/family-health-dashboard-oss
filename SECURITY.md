# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public GitHub issue**. This project handles personal health data and public disclosure before a fix is available could put users at risk.

Instead, please use [GitHub's private vulnerability reporting](https://github.com/jamesramya/family-health-dashboard-oss/security/advisories/new) to submit your report confidentially.

Include as much detail as possible:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested remediation

You can expect an acknowledgement within 48 hours and a status update within 7 days.

## Security expectations for self-hosted deployments

This software is designed to be deployed by individuals for personal use. As the operator of your own deployment, you are responsible for:

**Access control**
- Keep your `JWT_SECRET` secret and long (32+ hex bytes). Rotate it by updating the Worker secret and redeploying — this invalidates all existing sessions.
- Cloudflare Turnstile (bot protection) is enabled by default on the login and setup flows. Do not disable it for public-facing deployments.
- Do not enable public sign-up. Use the invite flow to control who can access your deployment.

**Secrets management**
- Never commit secrets to git. Use `wrangler secret put` for Worker secrets and GitHub Actions encrypted secrets for CI/CD.
- Rotate your AI provider API keys (Google, Anthropic) if you suspect they have been compromised.
- Rotate `JWT_SECRET` if you suspect sessions have been forged.

**Data at rest**
- Health data is stored in Cloudflare D1 (SQLite) and documents in Cloudflare R2. Both are isolated to your Cloudflare account. Cloudflare encrypts data at rest.
- The optional database backup writes an encrypted SQL dump to a private GitHub repository. Ensure that repo has appropriate access controls.

**HTTPS**
- All traffic goes through Cloudflare Pages and Cloudflare Workers, both of which enforce HTTPS by default. Do not route around Cloudflare in a way that removes TLS.

**Keep dependencies up to date**
- Run `npm audit` periodically in the `worker/` and `app/` workspaces. Open a PR to update vulnerable dependencies.

## Scope

Vulnerabilities in the following areas are in scope:
- Authentication bypass or session fixation
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Insecure direct object reference (accessing another user's or patient's data)
- SQL injection via D1
- Secrets exposed in API responses or logs

Out of scope:
- Social engineering
- Vulnerabilities in third-party dependencies that have already been publicly disclosed and have a patch available
- Vulnerabilities requiring physical access to the operator's machine
