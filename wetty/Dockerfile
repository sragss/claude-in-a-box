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

# Prepare SSH directory for runtime configuration
# SSH keys and config will be injected at runtime

# Copy entrypoint script (as root before switching users)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Switch to wetty user
USER wetty

# Set working directory
WORKDIR /home/wetty

# Expose Wetty port
EXPOSE 3001

# Use entrypoint script to handle dynamic configuration
ENTRYPOINT ["/entrypoint.sh"]
CMD ["wetty", "--host", "0.0.0.0", "--port", "3001", "--allow-iframe"]