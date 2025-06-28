import Docker from 'dockerode';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';

export class ContainerOrchestrator {
  constructor() {
    this.docker = new Docker();
    this.baseImages = {
      dev: 'claude-dev-image',
      wetty: 'claude-wetty-image'
    };
  }

  async createSession(sessionId) {
    const session = {
      sessionId,
      network: `claude-${sessionId}`,
      devContainer: `claude-dev-${sessionId}`,
      wettyContainer: `claude-wetty-${sessionId}`,
      sshKeysPath: path.join(process.cwd(), 'sessions', sessionId, 'ssh-keys'),
      devPort: null,
      wettyPort: null
    };

    try {
      // 1. Generate SSH keys
      await this.generateSSHKeys(session);

      // 2. Create Docker network
      await this.createNetwork(session);

      // 3. Start dev container
      await this.startDevContainer(session);

      // 4. Start Wetty container
      await this.startWettyContainer(session);

      // 5. Wait for containers to be ready
      await this.waitForContainers(session);

      return session;
    } catch (error) {
      // Cleanup on failure
      await this.cleanupSession(session);
      throw error;
    }
  }

  async generateSSHKeys(session) {
    console.log(`🔑 Generating SSH keys for session ${session.sessionId}`);
    
    // Create session directory
    mkdirSync(session.sshKeysPath, { recursive: true });
    
    // Generate SSH key pair
    const keyPath = path.join(session.sshKeysPath, 'id_rsa');
    execSync(`ssh-keygen -t rsa -b 2048 -f "${keyPath}" -N "" -q`, { stdio: 'pipe' });
    
    console.log(`✅ SSH keys generated at ${session.sshKeysPath}`);
  }

  async createNetwork(session) {
    console.log(`🌐 Creating network ${session.network}`);
    
    try {
      await this.docker.createNetwork({
        Name: session.network,
        Driver: 'bridge'
      });
      console.log(`✅ Network ${session.network} created`);
    } catch (error) {
      if (error.statusCode === 409) {
        console.log(`⚠️  Network ${session.network} already exists`);
      } else {
        throw error;
      }
    }
  }

  async startDevContainer(session) {
    console.log(`🛠️  Starting dev container ${session.devContainer}`);
    
    const container = await this.docker.createContainer({
      Image: this.baseImages.dev,
      name: session.devContainer,
      ExposedPorts: { '22/tcp': {} },
      HostConfig: {
        NetworkMode: session.network,
        PortBindings: { '22/tcp': [{ HostPort: '0' }] }, // Dynamic port
        Binds: [`${session.sshKeysPath}:/ssh-keys:ro`]
      },
      WorkingDir: '/workspace'
    });

    await container.start();
    
    // Get assigned port
    const containerInfo = await container.inspect();
    session.devPort = containerInfo.NetworkSettings.Ports['22/tcp'][0].HostPort;
    
    console.log(`✅ Dev container ${session.devContainer} started on port ${session.devPort}`);
  }

  async startWettyContainer(session) {
    console.log(`🖥️  Starting Wetty container ${session.wettyContainer}`);
    
    const container = await this.docker.createContainer({
      Image: this.baseImages.wetty,
      name: session.wettyContainer,
      ExposedPorts: { '3001/tcp': {} },
      Env: [
        `SSH_HOST=${session.devContainer}`,
        'SSH_USER=node',
        'USE_SSH_KEY=true'
      ],
      HostConfig: {
        NetworkMode: session.network,
        PortBindings: { '3001/tcp': [{ HostPort: '0' }] }, // Dynamic port
        Binds: [`${session.sshKeysPath}:/ssh-keys:ro`]
      }
    });

    await container.start();
    
    // Get assigned port
    const containerInfo = await container.inspect();
    session.wettyPort = containerInfo.NetworkSettings.Ports['3001/tcp'][0].HostPort;
    
    console.log(`✅ Wetty container ${session.wettyContainer} started on port ${session.wettyPort}`);
  }

  async waitForContainers(session) {
    console.log(`⏳ Waiting for containers to be ready...`);
    
    // Simple wait - in production you'd want proper health checks
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`✅ Session ${session.sessionId} is ready`);
  }

  async cleanupSession(session) {
    console.log(`🧹 Cleaning up session ${session.sessionId}`);
    
    try {
      // Stop and remove containers
      await this.stopAndRemoveContainer(session.devContainer);
      await this.stopAndRemoveContainer(session.wettyContainer);
      
      // Remove network
      await this.removeNetwork(session.network);
      
      // Clean up SSH keys
      if (session.sshKeysPath) {
        try {
          rmSync(path.dirname(session.sshKeysPath), { recursive: true, force: true });
        } catch (error) {
          console.warn(`⚠️  Failed to cleanup SSH keys: ${error.message}`);
        }
      }
      
      console.log(`✅ Session ${session.sessionId} cleaned up`);
    } catch (error) {
      console.error(`❌ Error during cleanup: ${error.message}`);
    }
  }

  async stopAndRemoveContainer(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      
      // Stop container
      try {
        await container.stop({ t: 10 });
      } catch (error) {
        if (error.statusCode !== 304) { // 304 = already stopped
          console.warn(`⚠️  Failed to stop ${containerName}: ${error.message}`);
        }
      }
      
      // Remove container
      await container.remove();
      console.log(`✅ Container ${containerName} removed`);
    } catch (error) {
      if (error.statusCode !== 404) { // 404 = container not found
        console.warn(`⚠️  Failed to remove ${containerName}: ${error.message}`);
      }
    }
  }

  async removeNetwork(networkName) {
    try {
      const network = this.docker.getNetwork(networkName);
      await network.remove();
      console.log(`✅ Network ${networkName} removed`);
    } catch (error) {
      if (error.statusCode !== 404) { // 404 = network not found
        console.warn(`⚠️  Failed to remove network ${networkName}: ${error.message}`);
      }
    }
  }

  async cleanupAll() {
    console.log('🧹 Cleaning up all Claude sessions...');
    
    try {
      // Find all Claude containers
      const containers = await this.docker.listContainers({ all: true });
      const claudeContainers = containers.filter(container => 
        container.Names.some(name => name.includes('claude-dev-') || name.includes('claude-wetty-'))
      );

      // Remove Claude containers
      for (const containerInfo of claudeContainers) {
        await this.stopAndRemoveContainer(containerInfo.Names[0].substring(1)); // Remove leading '/'
      }

      // Find and remove Claude networks
      const networks = await this.docker.listNetworks();
      const claudeNetworks = networks.filter(network => network.Name.startsWith('claude-'));
      
      for (const networkInfo of claudeNetworks) {
        await this.removeNetwork(networkInfo.Name);
      }

      // Clean up session files
      try {
        rmSync(path.join(process.cwd(), 'sessions'), { recursive: true, force: true });
      } catch (error) {
        console.warn(`⚠️  Failed to cleanup session files: ${error.message}`);
      }

      console.log('✅ All Claude sessions cleaned up');
    } catch (error) {
      console.error('❌ Error during global cleanup:', error);
    }
  }
}