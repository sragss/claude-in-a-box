# Claude in a Box Mark 2

A dockerized web-based development environment providing instant access to AI coding assistants through your browser.

## Architecture

```
┌─────────────────┐    HTTP     ┌─────────────────┐    SSH     ┌─────────────────┐
│   Frontend      │ ──────────▶ │   Wetty         │ ─────────▶ │   Dev Container │
│   (Manual)      │             │   (Docker)      │            │   (Docker)      │
│   Port 5175     │             │   Port 3001     │            │   Port 2222     │
└─────────────────┘             └─────────────────┘            └─────────────────┘
```

### Components

**Frontend**: Vite TypeScript application serving the web interface with an embedded terminal iframe (manual setup).

**Wetty Container**: Dockerized web terminal emulator that connects to any SSH host, enabling remote development.

**Dev Container**: Standalone Docker container with Node.js, git, Claude Code CLI, and OpenAI Codex CLI pre-installed.

## Quick Start

### Prerequisites
- [Docker](https://docker.com)
- [just](https://github.com/casey/just) command runner

### Local Development
```bash
# Start both containers locally
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