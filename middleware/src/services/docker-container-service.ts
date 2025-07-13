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
  
  // Port allocation mutex to prevent race conditions
  private portAllocationQueue: Promise<void> = Promise.resolve();

  // Get all ports currently in use by Docker containers (single API call)
  private async getAllUsedPorts(): Promise<Set<number>> {
    try {
      const containers = await this.docker.listContainers();
      const usedPorts = new Set<number>();
      
      for (const container of containers) {
        if (container.Ports) {
          for (const portBinding of container.Ports) {
            if (portBinding.PublicPort) {
              usedPorts.add(portBinding.PublicPort);
            }
          }
        }
      }
      
      return usedPorts;
    } catch (error) {
      console.error('Error getting used ports from Docker:', error);
      return new Set(); // Return empty set on error (conservative approach)
    }
  }

  // Smart port allocation - get all used ports once, then find optimal free port
  private async allocateWettyHostPort(): Promise<number> {
    // Use mutex to prevent race conditions during concurrent allocation
    return new Promise((resolve, reject) => {
      this.portAllocationQueue = this.portAllocationQueue.then(async () => {
        try {
          const port = await this.allocateWettyHostPortInternal();
          resolve(port);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Internal port allocation logic (called within mutex)
  private async allocateWettyHostPortInternal(): Promise<number> {
    console.log('🔍 Finding available port...');
    
    // Get all actually used ports from Docker (single API call)
    const dockerUsedPorts = await this.getAllUsedPorts();
    
    // Get ports from our session tracking
    const sessionPorts = new Set(
      Array.from(this.sessions.values())
        .map(session => session.wettyHostPort)
        .filter(port => port !== null)
    );
    
    // Combine all used ports
    const allUsedPorts = new Set([...dockerUsedPorts, ...sessionPorts, ...this.allocatedPorts]);
    
    console.log(`📊 Found ${allUsedPorts.size} ports in use, searching for free port...`);
    
    // Strategy 1: Fill gaps in our range first (reuse low ports)
    for (let port = this.wettyPortStart; port < this.wettyPortStart + 200; port++) {
      if (!allUsedPorts.has(port)) {
        this.allocatedPorts.add(port);
        console.log(`✅ Allocated port ${port} (gap fill)`);
        return port;
      }
    }
    
    // Strategy 2: If no gaps, extend beyond our range
    for (let port = this.wettyPortStart + 200; port < this.wettyPortStart + 1000; port++) {
      if (!allUsedPorts.has(port)) {
        this.allocatedPorts.add(port);
        console.log(`✅ Allocated port ${port} (range extension)`);
        return port;
      }
    }
    
    throw new Error(`Could not find available port in range ${this.wettyPortStart} - ${this.wettyPortStart + 1000}`);
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

  // Clean up zombie containers and sync port tracking
  async cleanupZombieContainers(): Promise<void> {
    try {
      console.log('🧹 Scanning for zombie containers...');
      
      // Get all running containers
      const containers = await this.docker.listContainers();
      const ourContainers = containers.filter(container => 
        container.Names?.some(name => name.includes('claude-dev-') || name.includes('claude-wetty-'))
      );
      
      // Extract session IDs from container names
      const runningSessionIds = new Set<string>();
      for (const container of ourContainers) {
        const name = container.Names?.[0]?.replace('/', '') || '';
        const sessionMatch = name.match(/claude-(?:dev|wetty)-(.+)/);
        if (sessionMatch) {
          runningSessionIds.add(sessionMatch[1]);
        }
      }
      
      // Find containers for sessions we're no longer tracking
      const trackedSessionIds = new Set(this.sessions.keys());
      const zombieSessionIds = Array.from(runningSessionIds).filter(
        sessionId => !trackedSessionIds.has(sessionId)
      );
      
      if (zombieSessionIds.length > 0) {
        console.log(`🧟 Found ${zombieSessionIds.length} zombie sessions: ${zombieSessionIds.slice(0, 3).join(', ')}${zombieSessionIds.length > 3 ? '...' : ''}`);
        
        // Clean up zombie containers
        for (const sessionId of zombieSessionIds) {
          try {
            console.log(`🗑️ Cleaning up zombie session: ${sessionId}`);
            await this.cleanupZombieSession(sessionId);
          } catch (error) {
            console.warn(`Failed to cleanup zombie session ${sessionId}:`, error);
          }
        }
        
        // Sync port tracking with actual Docker state
        await this.syncPortTracking();
      } else {
        console.log('✅ No zombie containers found');
      }
    } catch (error) {
      console.error('Error during zombie cleanup:', error);
    }
  }

  // Clean up a specific zombie session
  private async cleanupZombieSession(sessionId: string): Promise<void> {
    const containerNames = [`claude-dev-${sessionId}`, `claude-wetty-${sessionId}`];
    
    for (const containerName of containerNames) {
      try {
        const container = this.docker.getContainer(containerName);
        await container.stop({ t: 10 });
        await container.remove();
        console.log(`  ✅ Removed container: ${containerName}`);
      } catch (error: any) {
        if (error.statusCode !== 404) {
          console.warn(`  ⚠️ Failed to remove container ${containerName}:`, error.message);
        }
      }
    }
    
    // Clean up network
    try {
      const network = this.docker.getNetwork(`claude-${sessionId}`);
      await network.remove();
      console.log(`  ✅ Removed network: claude-${sessionId}`);
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.warn(`  ⚠️ Failed to remove network claude-${sessionId}:`, error.message);
      }
    }
  }

  // Sync our port tracking with actual Docker state
  private async syncPortTracking(): Promise<void> {
    console.log('🔄 Syncing port tracking with Docker state...');
    
    const dockerUsedPorts = await this.getAllUsedPorts();
    const sessionPorts = new Set(
      Array.from(this.sessions.values())
        .map(session => session.wettyHostPort)
        .filter(port => port !== null)
    );
    
    // Our tracked ports should only include ports that are actually in use
    const validTrackedPorts = Array.from(this.allocatedPorts).filter(port => 
      dockerUsedPorts.has(port) || sessionPorts.has(port)
    );
    
    const removedCount = this.allocatedPorts.size - validTrackedPorts.length;
    this.allocatedPorts = new Set(validTrackedPorts);
    
    if (removedCount > 0) {
      console.log(`🧹 Freed ${removedCount} orphaned port entries`);
    }
    
    console.log(`📊 Port tracking synced: ${this.allocatedPorts.size} ports tracked, ${dockerUsedPorts.size} Docker ports in use`);
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