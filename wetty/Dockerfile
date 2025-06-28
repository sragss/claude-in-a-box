# Standalone Wetty Web Terminal Container
FROM node:18-alpine

# Install build dependencies, Wetty, and SSH client
RUN apk add --no-cache python3 py3-setuptools make g++ \
    && npm install -g wetty@2.5.0 \
    && apk add --no-cache openssh-client

# Create wetty user and SSH directory
RUN addgroup -g 1001 wetty \
    && adduser -D -s /bin/sh -u 1001 -G wetty wetty \
    && mkdir -p /home/wetty/.ssh \
    && chown -R wetty:wetty /home/wetty/.ssh \
    && chmod 700 /home/wetty/.ssh

# Copy SSH private key from build context
COPY wetty_key /home/wetty/.ssh/id_rsa
RUN chown wetty:wetty /home/wetty/.ssh/id_rsa \
    && chmod 600 /home/wetty/.ssh/id_rsa

# Create SSH config to force key authentication only
RUN echo "Host claude-dev" > /home/wetty/.ssh/config \
    && echo "  PreferredAuthentications publickey" >> /home/wetty/.ssh/config \
    && echo "  PubkeyAuthentication yes" >> /home/wetty/.ssh/config \
    && echo "  PasswordAuthentication no" >> /home/wetty/.ssh/config \
    && echo "  IdentityFile /home/wetty/.ssh/id_rsa" >> /home/wetty/.ssh/config \
    && echo "  IdentitiesOnly yes" >> /home/wetty/.ssh/config \
    && echo "  StrictHostKeyChecking no" >> /home/wetty/.ssh/config \
    && chown wetty:wetty /home/wetty/.ssh/config \
    && chmod 600 /home/wetty/.ssh/config

# Switch to wetty user
USER wetty

# Set working directory
WORKDIR /home/wetty

# Expose Wetty port
EXPOSE 3001

# Default command - can be overridden with environment variables
CMD ["wetty", "--host", "0.0.0.0", "--port", "3001", "--ssh-config", "/home/wetty/.ssh/config", "--allow-iframe"]