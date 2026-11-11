# Autonomous Dev AI

An Android-first autonomous software development agent. The goal is to let a person describe a software outcome from a phone and have an agent research, plan, implement, test, and report on the work—with approval gates around consequential actions.

## First milestone: agent foundation

- [x] Establish the project and operating rules.
- [x] Add the initial eve-based TypeScript manifest.
- [ ] Install dependencies and validate in Node.js 24.
- [ ] Add phone-friendly web chat.
- [ ] Add safe GitHub repository workflows.

This is a foundation, not a finished autonomous coding product. Capabilities count as complete only after implementation and verification.

## Architecture

- Runtime: [eve](https://github.com/vercel/eve), an open-source framework for durable agents, sandboxed execution, tools, and approvals.
- Language: TypeScript.
- Interface: browser-based web chat designed for Android screens.
- Workflow: inspect → plan → implement → verify → report.
- Repository integration: GitHub feature branches and pull requests.
- Models: configurable; avoid locking the project to one paid provider.

## Requirements

- Node.js 24 or newer
- npm
- Access to an AI model supported by eve. Provider sign-in or credentials may be required.

## Start

After dependencies are installed, run:

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run build
npm run typecheck
```

Runtime setup and web-channel configuration remain to be completed. The repository can be edited from GitHub's mobile website, but running the development server requires a compatible Node.js environment.

## Safety

The agent may research, plan, edit in an isolated workspace, and run non-destructive checks. It must ask before merging, production deployment, destructive changes, paid usage, or externally visible actions. It must report actual verification evidence and never claim an unrun check passed.

## License

MIT. See [LICENSE](LICENSE).
