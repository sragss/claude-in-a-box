# Standalone AI Development Container with SSH
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Switch to root for installations
USER root

# Install SSH server and AI CLI tools
RUN apt-get update && apt-get install -y \
    openssh-server \
    sudo \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code @openai/codex

# Configure SSH and create SSH key for Wetty access
RUN mkdir /var/run/sshd \
    && echo 'root:devpassword' | chpasswd \
    && echo 'node:devpassword' | chpasswd \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && echo 'node ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Create SSH key pair for Wetty access
RUN ssh-keygen -t rsa -b 2048 -f /tmp/wetty_key -N "" \
    && mkdir -p /home/node/.ssh \
    && cat /tmp/wetty_key.pub >> /home/node/.ssh/authorized_keys \
    && chown -R node:node /home/node/.ssh \
    && chmod 700 /home/node/.ssh \
    && chmod 600 /home/node/.ssh/authorized_keys

# Set up git config for node user
USER node
RUN git config --global init.defaultBranch main \
    && git config --global user.name 'DevPod User' \
    && git config --global user.email 'user@devpod.local'

# Switch back to root for service startup
USER root

# Expose SSH port
EXPOSE 22

# Set working directory
WORKDIR /workspace

# Start SSH daemon
CMD ["/usr/sbin/sshd", "-D"]