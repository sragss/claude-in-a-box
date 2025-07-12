import Docker from 'dockerode';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import type { PostSpinupCommand, DevSession } from '../types';
import { 
  ContainerService, 
  SessionEndpoints, 
  CreateSessionOptions, 
  ContainerServiceError,
  ContainerInfo 
} from './container-service';

export class DockerContainerService implements ContainerService {
  private docker: Docker;
  private baseImages: { dev: string; wetty: string };
  private sessions: Map<string, DevSession> = new Map();
  private baseUrl: string;
  private wettyPortStart = 13001; // Starting port for wetty host port allocation

  // Track allocated ports to prevent race conditions
  private allocatedPorts = new Set<number>();

  // Check if a port is actually available on the system
  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      // Check if any Docker containers are using this port
      const containers = await this.docker.listContainers();
      for (const container of containers) {
        if (container.Ports) {
          for (const portBinding of container.Ports) {
            if (portBinding.PublicPort === port) {
              console.log(`Port ${port} in use by container ${container.Names?.[0]}`);
              return false;
            }
          }
        }
      }
      
      // Port appears to be free
      return true;
    } catch (error) {
      console.error(`Error checking port ${port} availability:`, error);
      return false; // Assume port is not available if we can't check
    }
  }

  // Allocate next available wetty host port (checks real Docker state)
  private async allocateWettyHostPort(): Promise<number> {
    // Get ports from existing sessions
    const sessionPorts = new Set(
      Array.from(this.sessions.values())
        .map(session => session.wettyHostPort)
        .filter(port => port !== null)
    );
    
    // Combine with currently allocated ports
    const trackedUsedPorts = new Set([...sessionPorts, ...this.allocatedPorts]);
    
    let port = this.wettyPortStart;
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loop
    
    while (attempts < maxAttempts) {
      // Skip if we think it's in use
      if (trackedUsedPorts.has(port)) {
        port++;
        attempts++;
        continue;
      }
      
      // Check if port is actually available in Docker
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        // Reserve this port immediately
        this.allocatedPorts.add(port);
        console.log(`✅ Allocated port ${port} for wetty container`);
        return port;
      }
      
      // Port is in use, try next one
      console.log(`Port ${port} is in use, trying next port`);
      port++;
      attempts++;
    }
    
    throw new Error(`Could not find available port after ${maxAttempts} attempts starting from ${this.wettyPortStart}`);
  }

  // Release port when session is destroyed
  private releaseWettyHostPort(port: number | null): void {
    if (port !== null) {
      this.allocatedPorts.delete(port);
    }
  }

  // Get session data (for debugging)
  getSession(sessionId: string): DevSession | null {
    return this.sessions.get(sessionId) || null;
  }

  // Clear all allocated ports (for debugging/cleanup)
  clearAllocatedPorts(): void {
    console.log('🧹 Clearing all allocated ports');
    this.allocatedPorts.clear();
  }

  // Get current allocated ports (for debugging)
  getAllocatedPorts(): number[] {
    return Array.from(this.allocatedPorts);
  }

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.docker = new Docker();
    this.baseImages = {
      dev: 'claude-dev-image',
      wetty: 'claude-wetty-image'
    };
    this.baseUrl = baseUrl;
  }

  async createSession(sessionId: string, options: CreateSessionOptions): Promise<SessionEndpoints> {
    const { postSpinupCommands = [], userId, username, userEmail } = options;

    if (this.sessions.has(sessionId)) {
      throw new ContainerServiceError(
        `Session ${sessionId} already exists`,
        'SESSION_EXISTS',
        sessionId
      );
    }

    // Extract cloned repo directory from git_clone commands
    const gitCloneCmd = postSpinupCommands.find(cmd => cmd.type === 'git_clone');
    const startupDirectory = gitCloneCmd ? gitCloneCmd.directory! : '/home/node';

    const session: DevSession = {
      sessionId,
      network: `claude-${sessionId}`,
      devContainer: `claude-dev-${sessionId}`,
      wettyContainer: `claude-wetty-${sessionId}`,
      sshKeysPath: path.join(process.cwd(), 'sessions', sessionId, 'ssh-keys'),
      postSpinupCommands,
      startupDirectory,
      devPort: parseInt(process.env.CONTAINER_SSH_PORT || '22'),    // Internal port only
      wettyPort: parseInt(process.env.CONTAINER_WETTY_PORT || '3001'), // Internal port only
      wettyHostPort: await this.allocateWettyHostPort(), // Host port for HTTP access
      userId,
      username,
      userEmail
    };

    try {
      console.log(`🚀 Creating session ${sessionId} for user ${username}`);

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

      // Store session
      this.sessions.set(sessionId, session);

      console.log(`✅ Session ${sessionId} created successfully`);

      return {
        sessionId,
        terminalUrl: `${this.baseUrl}/proxy/terminal/${sessionId}/wetty`,
        devUrl: `${this.baseUrl}/proxy/dev/${sessionId}`,
        sshPort: undefined // SSH only available through proxy
      };

    } catch (error) {
      // Release allocated port on failure
      this.releaseWettyHostPort(session.wettyHostPort);
      
      // Cleanup on failure
      await this.cleanupSessionInternal(session);
      
      if (error instanceof ContainerServiceError) {
        throw error;
      }
      
      throw new ContainerServiceError(
        `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_FAILED',
        sessionId
      );
    }
  }

  async getSessionEndpoints(sessionId: string): Promise<SessionEndpoints | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Verify containers are still running
    try {
      const isHealthy = await this.isSessionHealthy(sessionId);
      if (!isHealthy) {
        this.sessions.delete(sessionId);
        return null;
      }

      return {
        sessionId,
        terminalUrl: `${this.baseUrl}/proxy/terminal/${sessionId}/wetty`,
        devUrl: `${this.baseUrl}/proxy/dev/${sessionId}`,
        sshPort: undefined
      };
    } catch (error) {
      console.error(`Error checking session ${sessionId}:`, error);
      this.sessions.delete(sessionId);
      return null;
    }
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ContainerServiceError(
        `Session ${sessionId} not found`,
        'SESSION_NOT_FOUND',
        sessionId
      );
    }

    try {
      console.log(`🧹 Destroying session ${sessionId}`);
      await this.cleanupSessionInternal(session);
      
      // Release allocated port
      this.releaseWettyHostPort(session.wettyHostPort);
      
      this.sessions.delete(sessionId);
      console.log(`✅ Session ${sessionId} destroyed successfully`);
    } catch (error) {
      throw new ContainerServiceError(
        `Failed to destroy session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DESTROY_FAILED',
        sessionId
      );
    }
  }

  async isSessionHealthy(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Check if both containers are running
      const devContainer = this.docker.getContainer(session.devContainer);
      const wettyContainer = this.docker.getContainer(session.wettyContainer);

      const [devInfo, wettyInfo] = await Promise.all([
        devContainer.inspect(),
        wettyContainer.inspect()
      ]);

      return devInfo.State.Running && wettyInfo.State.Running;
    } catch (error) {
      return false;
    }
  }

  async cleanupAll(): Promise<void> {
    console.log('🧹 Cleaning up all sessions...');
    const sessionIds = Array.from(this.sessions.keys());
    
    await Promise.all(
      sessionIds.map(sessionId => 
        this.destroySession(sessionId).catch(error => 
          console.error(`Failed to cleanup session ${sessionId}:`, error)
        )
      )
    );
    
    console.log('✅ All sessions cleaned up');
  }

  async getContainerIP(sessionId: string, containerType: 'terminal' | 'dev'): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    try {
      const containerName = containerType === 'terminal' 
        ? session.wettyContainer 
        : session.devContainer;
      
      const container = this.docker.getContainer(containerName);
      const containerInfo = await container.inspect();
      
      return containerInfo.NetworkSettings.Networks[session.network]?.IPAddress || null;
    } catch (error) {
      console.error(`Error getting container IP for ${sessionId}:`, error);
      return null;
    }
  }

  // Private methods (moved from ContainerOrchestrator)
  private async generateSSHKeys(session: DevSession): Promise<void> {
    console.log(`🔑 Generating SSH keys for session ${session.sessionId}`);
    
    mkdirSync(session.sshKeysPath, { recursive: true });
    
    const keyPath = path.join(session.sshKeysPath, 'id_rsa');
    execSync(`ssh-keygen -t rsa -b 2048 -f "${keyPath}" -N "" -q`, { stdio: 'pipe' });
    
    if (session.postSpinupCommands.length > 0) {
      const commandsPath = path.join(session.sshKeysPath, 'post-spinup-commands.json');
      writeFileSync(commandsPath, JSON.stringify(session.postSpinupCommands, null, 2));
    }
  }

  private async createNetwork(session: DevSession): Promise<void> {
    try {
      await this.docker.createNetwork({
        Name: session.network,
        Driver: 'bridge'
      });
    } catch (error: any) {
      if (error.statusCode !== 409) { // 409 = already exists
        throw error;
      }
    }
  }

  private async startDevContainer(session: DevSession): Promise<void> {
    const env: string[] = [];
    if (session.postSpinupCommands.length > 0) {
      env.push('POST_SPINUP_COMMANDS_ENABLED=true');
    }
    
    const sshPort = session.devPort;
    const container = await this.docker.createContainer({
      Image: this.baseImages.dev,
      name: session.devContainer,
      ExposedPorts: { [`${sshPort}/tcp`]: {} },
      Env: env,
      HostConfig: {
        NetworkMode: session.network,
        Binds: [`${session.sshKeysPath}:/ssh-keys:ro`]
      },
      WorkingDir: '/workspace'
    });

    await container.start();
  }

  private async startWettyContainer(session: DevSession): Promise<void> {
    const wettyPort = session.wettyPort;
    const wettyHostPort = session.wettyHostPort;
    
    console.log(`📡 Publishing wetty port ${wettyPort} to host port ${wettyHostPort}`);
    
    const container = await this.docker.createContainer({
      Image: this.baseImages.wetty,
      name: session.wettyContainer,
      ExposedPorts: { [`${wettyPort}/tcp`]: {} },
      Env: [
        `SSH_HOST=${session.devContainer}`,
        'SSH_USER=node',
        'USE_SSH_KEY=true',
        `STARTUP_DIRECTORY=${session.startupDirectory}`
      ],
      HostConfig: {
        NetworkMode: session.network,
        Binds: [`${session.sshKeysPath}:/ssh-keys:ro`],
        PortBindings: {
          [`${wettyPort}/tcp`]: [{ HostPort: `${wettyHostPort}` }]
        }
      }
    });

    await container.start();
  }

  private async waitForContainers(session: DevSession): Promise<void> {
    console.log(`⏳ Waiting for containers to be ready...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  private async cleanupSessionInternal(session: DevSession): Promise<void> {
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
    } catch (error: any) {
      console.error(`❌ Error during cleanup: ${error.message}`);
      throw error;
    }
  }

  private async stopAndRemoveContainer(containerName: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: 10 });
      await container.remove();
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.warn(`⚠️  Failed to stop/remove container ${containerName}: ${error.message}`);
      }
    }
  }

  private async removeNetwork(networkName: string): Promise<void> {
    try {
      const network = this.docker.getNetwork(networkName);
      await network.remove();
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.warn(`⚠️  Failed to remove network ${networkName}: ${error.message}`);
      }
    }
  }
}