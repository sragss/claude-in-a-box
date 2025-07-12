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

# Execute post-spinup commands if provided
if [ "$POST_SPINUP_COMMANDS_ENABLED" = "true" ] && [ -f "/ssh-keys/post-spinup-commands.json" ]; then
    echo "📋 Executing post-spinup commands..."
    
    # Parse and execute commands
    node -e "
        const fs = require('fs');
        const { execSync } = require('child_process');
        const path = require('path');
        
        try {
            const commands = JSON.parse(fs.readFileSync('/ssh-keys/post-spinup-commands.json', 'utf8'));
            
            for (const cmd of commands) {
                console.log(\`🔄 Executing: \${cmd.type}\`);
                
                if (cmd.type === 'git_clone') {
                    console.log(\`📂 Cloning \${cmd.repo} to \${cmd.directory}\`);
                    const dirName = path.dirname(cmd.directory);
                    const baseName = path.basename(cmd.directory);
                    
                    // Ensure parent directory exists and is owned by node user
                    execSync(\`mkdir -p \${dirName}\`, { stdio: 'inherit' });
                    execSync(\`chown -R node:node \${dirName}\`, { stdio: 'inherit' });
                    
                    // Clone repo as node user using su
                    execSync(\`su node -c 'git clone \${cmd.repo} \${cmd.directory}'\`, { 
                        stdio: 'inherit',
                        cwd: '/'
                    });
                    
                    console.log(\`✅ Repository cloned to \${cmd.directory}\`);
                    
                } else if (cmd.type === 'shell_command') {
                    console.log(\`💻 Running: \${cmd.command}\`);
                    
                    // Run command as node user
                    const workDir = cmd.workingDirectory || '/home/node';
                    execSync(\`su node -c 'cd \${workDir} && \${cmd.command}'\`, {
                        stdio: 'inherit'
                    });
                    console.log(\`✅ Command completed: \${cmd.command}\`);
                } else if (cmd.type === 'setup_github_user') {
                    console.log(\`👤 Setting up GitHub user: \${cmd.username}\`);
                    
                    // Configure git with GitHub user info
                    const gitCommands = [
                        \`git config --global user.name '\${cmd.username}'\`,
                        cmd.email ? \`git config --global user.email '\${cmd.email}'\` : null,
                        \`echo 'export GITHUB_USER="\${cmd.username}"' >> /home/node/.bashrc\`
                    ].filter(Boolean);
                    
                    for (const gitCmd of gitCommands) {
                        execSync(\`su node -c '\${gitCmd}'\`, { stdio: 'inherit' });
                    }
                    
                    console.log(\`✅ GitHub user \${cmd.username} configured\`);
                }
            }
            
            console.log('✅ All post-spinup commands completed');
        } catch (error) {
            console.error('❌ Error executing post-spinup commands:', error.message);
            // Don't fail container startup if post-spinup commands fail
        }
    "
fi

echo "🚀 Starting SSH daemon..."

# Execute the command passed to docker run
exec "$@"