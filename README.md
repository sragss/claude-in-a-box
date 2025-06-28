# Claude in a Box Mark 2

A dockerized web-based development environment providing instant access to AI coding assistants through your browser.

## Architecture

```
┌─────────────────┐    HTTP     ┌─────────────────┐    Dynamic    ┌─────────────────┐
│   Frontend      │ ──────────▶ │   Middleware    │ ──────────▶  │ User Containers │
│   (Vite)        │             │   (Node.js)     │              │   (Docker)      │
│   Port 5175     │             │   Port 8080     │              │   Dynamic Ports │
└─────────────────┘             └─────────────────┘              └─────────────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │  Session Mgmt   │
                                │  SSH Keys       │
                                │  Container      │
                                │  Orchestration  │
                                └─────────────────┘
```

### Components

**Frontend**: Vite TypeScript application with authentication and session management interface.

**Middleware**: Node.js server that orchestrates Docker containers, manages user sessions, and handles authentication.

**User Containers**: Dynamically created Docker containers per session with Node.js, git, Claude Code CLI, and OpenAI Codex CLI pre-installed.

## Quick Start

### Prerequisites
- [Docker](https://docker.com)
- [just](https://github.com/casey/just) command runner

### Middleware Development
```bash
# Start middleware system (recommended)
just middleware

# Access application at http://localhost:5175
# Login password: devpassword
```

### Local Development (Legacy)
```bash
# Start containers directly (without middleware)
just local

# Access terminal at http://localhost:3001
# SSH credentials: node/devpassword
```

### Individual Container Management
```bash
# Start only dev container
just dev

# Start only Wetty (connects to local dev container)
just wetty

# Connect Wetty to remote dev container
just wetty-remote host=remote-server port=2222 user=node

# View logs
just logs

# SSH directly into dev container
just ssh

# Clean up
just clean
```

### Frontend (Manual)
```bash
cd test-frontend
bun run dev
# Access at http://localhost:5175
```

## Features

- ✅ **Fully Dockerized**: No local dependencies except Docker
- ✅ **Portable**: Run containers on different machines
- ✅ **AI-Powered**: Claude Code + OpenAI Codex pre-installed
- ✅ **Web Terminal**: Browser-based development environment
- ✅ **SSH Access**: Direct terminal access via SSH
- ✅ **Just Commands**: Simple orchestration with justfile