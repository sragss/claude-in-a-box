# Claude in a Box - Container Orchestration

# Variables
network_name := "claude-network"
dev_container_name := "claude-dev"
wetty_container_name := "claude-wetty"
dev_port := "2222"
wetty_port := "3001"

# Default recipe
default:
    @just --list

# Start middleware server (backend only)
local: clean
    @echo "🚀 Starting Claude in a Box middleware..."
    @docker build -q -t claude-dev-image ./dev-container
    @docker build -q -t claude-wetty-image ./wetty
    @echo "✅ Container images built"
    @echo "🌐 Starting middleware server..."
    @cd middleware && bun run dev

# Start frontend development server
frontend:
    @echo "🖥️  Starting frontend development server..."
    @cd test-frontend && bun run dev

# Create Docker network
network:
    @echo "🌐 Creating Docker network..."
    @docker network create {{network_name}} 2>/dev/null || true

# Generate SSH key pair for session
generate-ssh-keys:
    @echo "🔑 Generating SSH key pair..."
    @mkdir -p ./ssh-keys
    @ssh-keygen -t rsa -b 2048 -f ./ssh-keys/id_rsa -N "" -q
    @echo "✅ SSH keys generated"

# Start development container
dev: network generate-ssh-keys
    @echo "🛠️  Starting development container..."
    @docker build -t claude-dev-image ./dev-container
    @docker run -d \
        --name {{dev_container_name}} \
        --network {{network_name}} \
        -p {{dev_port}}:22 \
        -v $(pwd):/workspace \
        -v $(pwd)/ssh-keys:/ssh-keys:ro \
        claude-dev-image

# Start Wetty container (connects to dev container)
wetty: dev
    @echo "🖥️  Starting Wetty terminal..."
    @docker build -t claude-wetty-image ./wetty
    @docker run -d \
        --name {{wetty_container_name}} \
        --network {{network_name}} \
        -p {{wetty_port}}:3001 \
        -v $(pwd)/ssh-keys:/ssh-keys:ro \
        -e SSH_HOST={{dev_container_name}} \
        -e SSH_USER=node \
        -e USE_SSH_KEY=true \
        claude-wetty-image

# Start Wetty connecting to remote dev container
wetty-remote host="localhost" port="2222" user="node":
    @echo "🖥️  Starting Wetty (connecting to {{user}}@{{host}}:{{port}})..."
    @docker build -t claude-wetty-image ./wetty
    @docker run -d \
        --name {{wetty_container_name}} \
        -p {{wetty_port}}:3001 \
        claude-wetty-image \
        wetty --host 0.0.0.0 --port 3001 --ssh-host {{host}} --ssh-port {{port}} --ssh-user {{user}} --allow-iframe

# Show container logs
logs container="":
    #!/bin/bash
    if [ "{{container}}" = "dev" ] || [ "{{container}}" = "" ]; then
        echo "=== Dev Container Logs ==="
        docker logs {{dev_container_name}} --tail 20
    fi
    if [ "{{container}}" = "wetty" ] || [ "{{container}}" = "" ]; then
        echo "=== Wetty Container Logs ==="
        docker logs {{wetty_container_name}} --tail 20
    fi

# Show container status
status:
    @echo "📊 Container Status:"
    @docker ps --filter "name={{dev_container_name}}" --filter "name={{wetty_container_name}}"

# SSH into dev container
ssh:
    @ssh -p {{dev_port}} -o StrictHostKeyChecking=no node@localhost

# Stop containers
stop:
    @echo "🛑 Stopping containers..."
    @docker stop {{dev_container_name}} {{wetty_container_name}} 2>/dev/null || true

# Clean up containers and network
clean: stop
    @echo "🧹 Cleaning up..."
    @docker rm {{dev_container_name}} {{wetty_container_name}} 2>/dev/null || true
    @docker network rm {{network_name}} 2>/dev/null || true
    @rm -rf ./ssh-keys 2>/dev/null || true
    @rm -f ./wetty/wetty_key 2>/dev/null || true

# Rebuild containers
rebuild: clean
    @echo "🔄 Rebuilding containers..."
    @docker rmi claude-dev-image claude-wetty-image 2>/dev/null || true
    @just local