# Claude in a Box Mark 2

A web-based development environment that provides instant access to Claude Code CLI through your browser.

## Architecture

```
┌─────────────────┐    HTTP     ┌─────────────────┐    SSH     ┌─────────────────┐
│   Frontend      │ ──────────▶ │   Wetty Proxy   │ ─────────▶ │   DevPod VM     │
│   (Vite + TS)   │             │   (Terminal)    │            │   (Ubuntu +     │
│   Port 5175     │             │   Port 3001     │            │   Claude Code)  │
└─────────────────┘             └─────────────────┘            └─────────────────┘
```

### Components

**Frontend**: Vite TypeScript application serving the web interface with an embedded terminal iframe.

**Wetty Proxy**: Web terminal emulator that proxies browser connections to the DevPod container via SSH.

**DevPod VM**: Containerized Ubuntu environment with Node.js, git, Claude Code CLI, and OpenAI Codex CLI pre-installed for instant AI-powered development.

## Quick Start

1. Start the frontend: `bun run dev`
2. Start Wetty: `wetty --host localhost --port 3001 --ssh-host <container>.devpod --ssh-user node --allow-iframe`
3. Create DevPod container: `devpod up . --id <name> --ide none`
4. Access at `http://localhost:5175`

## Features

- ✅ Web-based terminal access
- ✅ Claude Code CLI pre-installed
- ✅ OpenAI Codex CLI pre-installed
- ✅ Git and Node.js ready
- ✅ Instant container spin-up
- ✅ No local dev environment needed