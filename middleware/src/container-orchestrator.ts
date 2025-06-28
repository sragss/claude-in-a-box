import Docker from 'dockerode';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import type { Session, CreateSessionOptions, PostSpinupCommand } from './types';

export class ContainerOrchestrator {
  private docker: Docker;
  private baseImages: { dev: string; wetty: string };

  constructor() {
    this.docker = new Docker();
    this.baseImages = {
      dev: 'claude-dev-image',
      wetty: 'claude-wetty-image'
    };
  }

  async createSession(sessionId: string, options: CreateSessionOptions = {}): Promise<Session> {
    const { postSpinupCommands = [] } = options;
    
    // Extract cloned repo directory from git_clone commands
    const gitCloneCmd = postSpinupCommands.find(cmd => cmd.type === 'git_clone');
    const startupDirectory = gitCloneCmd ? gitCloneCmd.directory! : '/home/node';
    
    const session: Session = {
      sessionId,
      network: `claude-${sessionId}`,
      devContainer: `claude-dev-${sessionId}`,
      wettyContainer: `claude-wetty-${sessionId}`,
      sshKeysPath: path.join(process.cwd(), 'sessions', sessionId, 'ssh-keys'),
      postSpinupCommands,
      startupDirectory,
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

  private async generateSSHKeys(session: Session): Promise<void> {
    console.log(`🔑 Generating SSH keys for session ${session.sessionId}`);
    
    // Create session directory
    mkdirSync(session.sshKeysPath, { recursive: true });
    
    // Generate SSH key pair
    const keyPath = path.join(session.sshKeysPath, 'id_rsa');
    execSync(`ssh-keygen -t rsa -b 2048 -f "${keyPath}" -N "" -q`, { stdio: 'pipe' });
    
    // Generate post-spinup commands file
    if (session.postSpinupCommands.length > 0) {
      const commandsPath = path.join(session.sshKeysPath, 'post-spinup-commands.json');
      writeFileSync(commandsPath, JSON.stringify(session.postSpinupCommands, null, 2));
      console.log(`📋 Post-spinup commands written to ${commandsPath}`);
    }
    
    console.log(`✅ SSH keys generated at ${session.sshKeysPath}`);
  }

  private async createNetwork(session: Session): Promise<void> {
    console.log(`🌐 Creating network ${session.network}`);
    
    try {
      await this.docker.createNetwork({
        Name: session.network,
        Driver: 'bridge'
      });
      console.log(`✅ Network ${session.network} created`);
    } catch (error: any) {
      if (error.statusCode === 409) {
        console.log(`⚠️  Network ${session.network} already exists`);
      } else {
        throw error;
      }
    }
  }

  private async startDevContainer(session: Session): Promise<void> {
    console.log(`🛠️  Starting dev container ${session.devContainer}`);
    
    // Build environment variables
    const env: string[] = [];
    if (session.postSpinupCommands.length > 0) {
      env.push('POST_SPINUP_COMMANDS_ENABLED=true');
    }
    
    const container = await this.docker.createContainer({
      Image: this.baseImages.dev,
      name: session.devContainer,
      ExposedPorts: { '22/tcp': {} },
      Env: env,
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
    session.devPort = parseInt(containerInfo.NetworkSettings.Ports['22/tcp'][0].HostPort);
    
    console.log(`✅ Dev container ${session.devContainer} started on port ${session.devPort}`);
  }

  private async startWettyContainer(session: Session): Promise<void> {
    console.log(`🖥️  Starting Wetty container ${session.wettyContainer}`);
    
    const container = await this.docker.createContainer({
      Image: this.baseImages.wetty,
      name: session.wettyContainer,
      ExposedPorts: { '3001/tcp': {} },
      Env: [
        `SSH_HOST=${session.devContainer}`,
        'SSH_USER=node',
        'USE_SSH_KEY=true',
        `STARTUP_DIRECTORY=${session.startupDirectory}`
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
    session.wettyPort = parseInt(containerInfo.NetworkSettings.Ports['3001/tcp'][0].HostPort);
    
    console.log(`✅ Wetty container ${session.wettyContainer} started on port ${session.wettyPort}`);
  }

  private async waitForContainers(session: Session): Promise<void> {
    console.log(`⏳ Waiting for containers to be ready...`);
    
    // Simple wait - in production you'd want proper health checks
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`✅ Session ${session.sessionId} is ready`);
  }

  async cleanupSession(session: Session): Promise<void> {
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
        } catch (error: any) {
          console.warn(`⚠️  Failed to cleanup SSH keys: ${error.message}`);
        }
      }
      
      console.log(`✅ Session ${session.sessionId} cleaned up`);
    } catch (error: any) {
      console.error(`❌ Error during cleanup: ${error.message}`);
    }
  }

  private async stopAndRemoveContainer(containerName: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerName);
      
      // Stop container
      try {
        await container.stop({ t: 10 });
      } catch (error: any) {
        if (error.statusCode !== 304) { // 304 = already stopped
          console.warn(`⚠️  Failed to stop ${containerName}: ${error.message}`);
        }
      }
      
      // Remove container
      await container.remove();
      console.log(`✅ Container ${containerName} removed`);
    } catch (error: any) {
      if (error.statusCode !== 404) { // 404 = container not found
        console.warn(`⚠️  Failed to remove ${containerName}: ${error.message}`);
      }
    }
  }

  private async removeNetwork(networkName: string): Promise<void> {
    try {
      const network = this.docker.getNetwork(networkName);
      await network.remove();
      console.log(`✅ Network ${networkName} removed`);
    } catch (error: any) {
      if (error.statusCode !== 404) { // 404 = network not found
        console.warn(`⚠️  Failed to remove network ${networkName}: ${error.message}`);
      }
    }
  }

  async cleanupAll(): Promise<void> {
    console.log('🧹 Cleaning up all Claude sessions...');
    
    try {
      // Find all Claude containers
      const containers = await this.docker.listContainers({ all: true });
      const claudeContainers = containers.filter((container: any) => 
        container.Names.some((name: string) => name.includes('claude-dev-') || name.includes('claude-wetty-'))
      );

      // Remove Claude containers
      for (const containerInfo of claudeContainers) {
        await this.stopAndRemoveContainer(containerInfo.Names[0].substring(1)); // Remove leading '/'
      }

      // Find and remove Claude networks
      const networks = await this.docker.listNetworks();
      const claudeNetworks = networks.filter((network: any) => network.Name.startsWith('claude-'));
      
      for (const networkInfo of claudeNetworks) {
        await this.removeNetwork(networkInfo.Name);
      }

      // Clean up session files
      try {
        rmSync(path.join(process.cwd(), 'sessions'), { recursive: true, force: true });
      } catch (error: any) {
        console.warn(`⚠️  Failed to cleanup session files: ${error.message}`);
      }

      console.log('✅ All Claude sessions cleaned up');
    } catch (error) {
      console.error('❌ Error during global cleanup:', error);
    }
  }
}