# Claude in a Box Mark 2

![Claude in a Box](claude-box-big.png)

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

### Quick Start
```bash
# Start middleware server (in one terminal)
just local

# Start frontend (in another terminal)
just frontend

# Access application at http://localhost:5175
# Login password: devpassword
```

### Development Commands
```bash
# View logs
just logs

# Clean up containers
just clean

# Rebuild everything
just rebuild
```

## Features

- ✅ **Fully Dockerized**: No local dependencies except Docker
- ✅ **Portable**: Run containers on different machines
- ✅ **AI-Powered**: Claude Code + OpenAI Codex pre-installed
- ✅ **Web Terminal**: Browser-based development environment
- ✅ **SSH Access**: Direct terminal access via SSH
- ✅ **Just Commands**: Simple orchestration with justfile

## TODO
- [x] **xterm.js direct**: Don't iframe the wetty xterm directly, instead xterm and proxy the connections through the middleware to the wetty docker image.
- [ ] **Client Context Handling**: Make session management and login management less shit.
- [ ] **Combine wetty & dev container images**: Currently uses separate containers for dev environment and web terminal. Combining them would reduce complexity, eliminate SSH overhead between containers, and simplify networking architecture.
