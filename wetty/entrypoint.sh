#!/bin/sh
set -e

echo "🖥️  Initializing Wetty container..."

# Default values
SSH_HOST=${SSH_HOST:-"localhost"}
SSH_PORT=${SSH_PORT:-"22"}
SSH_USER=${SSH_USER:-"node"}
USE_SSH_KEY=${USE_SSH_KEY:-"true"}

echo "📡 SSH Target: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"

# Handle SSH key injection
if [ "$USE_SSH_KEY" = "true" ]; then
    if [ -n "$SSH_PRIVATE_KEY" ]; then
        echo "🔑 Injecting SSH private key from environment variable..."
        echo "$SSH_PRIVATE_KEY" > /home/wetty/.ssh/id_rsa
        chmod 600 /home/wetty/.ssh/id_rsa
    elif [ -f "/ssh-keys/id_rsa" ]; then
        echo "🔑 Injecting SSH private key from volume mount..."
        cp /ssh-keys/id_rsa /home/wetty/.ssh/id_rsa
        chmod 600 /home/wetty/.ssh/id_rsa
    else
        echo "⚠️  No SSH private key provided, falling back to password authentication"
        USE_SSH_KEY="false"
    fi
fi

# Generate SSH config dynamically
echo "📝 Generating SSH configuration..."
if [ "$USE_SSH_KEY" = "true" ]; then
    cat > /home/wetty/.ssh/config << EOF
Host ${SSH_HOST}
  PreferredAuthentications publickey
  PubkeyAuthentication yes
  PasswordAuthentication no
  IdentityFile /home/wetty/.ssh/id_rsa
  IdentitiesOnly yes
  StrictHostKeyChecking no
  Port ${SSH_PORT}
  User ${SSH_USER}
EOF
    echo "✅ SSH key authentication configured"
    WETTY_ARGS="--ssh-auth publickey --ssh-key /home/wetty/.ssh/id_rsa"
else
    cat > /home/wetty/.ssh/config << EOF
Host ${SSH_HOST}
  PreferredAuthentications password
  PasswordAuthentication yes
  StrictHostKeyChecking no
  Port ${SSH_PORT}
  User ${SSH_USER}
EOF
    echo "✅ Password authentication configured"
    WETTY_ARGS="--ssh-auth password"
fi

chmod 600 /home/wetty/.ssh/config

# Build the command with dynamic parameters
WETTY_CMD="$1 --ssh-host ${SSH_HOST} --ssh-port ${SSH_PORT} --ssh-user ${SSH_USER} --ssh-config /home/wetty/.ssh/config ${WETTY_ARGS}"

# Add any additional arguments passed to the container
shift
WETTY_CMD="$WETTY_CMD $@"

echo "🚀 Starting Wetty with command: $WETTY_CMD"

# Execute the command
exec $WETTY_CMD