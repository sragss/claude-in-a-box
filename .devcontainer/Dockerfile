# Start with the official Node.js dev container
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Switch to root for installations
USER root

# Install AI CLI tools via npm
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Verify installations work
RUN node --version && npm --version && git --version && claude --version && codex --version

# Switch back to the node user
USER node

# Set working directory
WORKDIR /workspace