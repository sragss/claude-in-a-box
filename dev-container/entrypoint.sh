#!/bin/bash
set -e

echo "🔧 Initializing dev container..."

# Handle SSH key injection from environment variable or volume mount
if [ -n "$SSH_PUBLIC_KEY" ]; then
    echo "📝 Injecting SSH public key from environment variable..."
    echo "$SSH_PUBLIC_KEY" > /home/node/.ssh/authorized_keys
elif [ -f "/ssh-keys/id_rsa.pub" ]; then
    echo "📝 Injecting SSH public key from volume mount..."
    cp /ssh-keys/id_rsa.pub /home/node/.ssh/authorized_keys
else
    echo "⚠️  No SSH public key provided. Password authentication will be required."
fi

# Set proper permissions if authorized_keys exists
if [ -f /home/node/.ssh/authorized_keys ]; then
    chown node:node /home/node/.ssh/authorized_keys
    chmod 600 /home/node/.ssh/authorized_keys
    echo "✅ SSH key configured for passwordless access"
fi

# Generate host keys if they don't exist
if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    echo "🔑 Generating SSH host keys..."
    ssh-keygen -A
fi

echo "🚀 Starting SSH daemon..."

# Execute the command passed to docker run
exec "$@"