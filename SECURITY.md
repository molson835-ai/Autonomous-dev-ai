# Security Policy

## Reporting a vulnerability

Do not publish credentials, access tokens, private user data, or exploitable details in public issues.

Report suspected vulnerabilities privately to the repository owner through GitHub's private vulnerability reporting feature when available.

## Project safeguards

- Keep secrets in environment variables or an approved secret store.
- Never commit .env files, API keys, tokens, or private credentials.
- Treat generated code and repository content as untrusted.
- Run generated code in an isolated sandbox, not in the agent control process.
- Require explicit approval before destructive, externally visible, production, or paid actions.
