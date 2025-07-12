import type { PostSpinupCommand } from '../types';

export interface SessionEndpoints {
  sessionId: string;
  terminalUrl: string;  // Full URL to access terminal
  devUrl: string;       // Full URL to access dev environment
  sshPort?: number;     // For direct SSH access if needed
}

export interface CreateSessionOptions {
  userId: string;
  username: string;
  userEmail?: string;
  postSpinupCommands?: PostSpinupCommand[];
}

export interface ContainerService {
  /**
   * Create a new development session with containers
   */
  createSession(sessionId: string, options: CreateSessionOptions): Promise<SessionEndpoints>;
  
  /**
   * Get the endpoints for an existing session
   */
  getSessionEndpoints(sessionId: string): Promise<SessionEndpoints | null>;
  
  /**
   * Destroy a session and clean up all containers
   */
  destroySession(sessionId: string): Promise<void>;
  
  /**
   * Check if a session exists and is healthy
   */
  isSessionHealthy(sessionId: string): Promise<boolean>;
  
  /**
   * Clean up all sessions (for graceful shutdown)
   */
  cleanupAll(): Promise<void>;
  
  /**
   * Get the internal container IP for proxy purposes
   * (Used by middleware proxy logic)
   */
  getContainerIP(sessionId: string, containerType: 'terminal' | 'dev'): Promise<string | null>;
}

export interface ContainerInfo {
  containerName: string;
  internalIP: string;
  internalPort: number;
  isRunning: boolean;
}

export class ContainerServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly sessionId?: string
  ) {
    super(message);
    this.name = 'ContainerServiceError';
  }
}