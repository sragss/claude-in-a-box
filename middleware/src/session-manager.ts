import type { Session, SessionStats } from './types';

export class SessionManager {
  private sessions: Map<string, Session>;
  private sessionTimeouts: Map<string, NodeJS.Timeout>;
  private readonly SESSION_TIMEOUT: number;

  constructor() {
    this.sessions = new Map();
    this.sessionTimeouts = new Map();
    this.SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  }

  addSession(sessionId: string, session: Session): void {
    this.sessions.set(sessionId, {
      ...session,
      createdAt: new Date(),
      lastAccessed: new Date()
    });

    // Set cleanup timeout
    this.setSessionTimeout(sessionId);
    
    console.log(`📝 Session ${sessionId} added to manager`);
  }

  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Update last accessed time
      session.lastAccessed = new Date();
      
      // Reset timeout
      this.setSessionTimeout(sessionId);
    }
    
    return session;
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    
    // Clear timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }
    
    console.log(`🗑️  Session ${sessionId} removed from manager`);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  private setSessionTimeout(sessionId: string): void {
    // Clear existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      console.log(`⏰ Session ${sessionId} timed out, cleaning up...`);
      this.handleSessionTimeout(sessionId);
    }, this.SESSION_TIMEOUT);

    this.sessionTimeouts.set(sessionId, timeout);
  }

  private async handleSessionTimeout(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      console.log(`🧹 Auto-cleaning up timed out session ${sessionId}`);
      
      try {
        // Import container orchestrator dynamically to avoid circular dependency
        const { ContainerOrchestrator } = await import('./container-orchestrator');
        const orchestrator = new ContainerOrchestrator();
        
        await orchestrator.cleanupSession(session);
        this.removeSession(sessionId);
        
        console.log(`✅ Timed out session ${sessionId} cleaned up successfully`);
      } catch (error) {
        console.error(`❌ Failed to cleanup timed out session ${sessionId}:`, error);
      }
    }
  }

  // Get session statistics
  getSessionStats(): SessionStats {
    const sessions = this.getAllSessions();
    const now = new Date();
    
    return {
      total: sessions.length,
      active: sessions.length,
      averageAge: sessions.length > 0 
        ? sessions.reduce((sum, session) => sum + (now.getTime() - (session.createdAt?.getTime() || 0)), 0) / sessions.length 
        : 0,
      oldestSession: sessions.length > 0 
        ? Math.min(...sessions.map(session => now.getTime() - (session.createdAt?.getTime() || 0)))
        : 0
    };
  }

  // Manual cleanup of old sessions
  async cleanupOldSessions(maxAge: number = this.SESSION_TIMEOUT): Promise<number> {
    const now = new Date();
    const allSessions = Array.from(this.sessions.entries());
    const oldSessions = allSessions.filter(([sessionId, session]) => 
      now.getTime() - (session.lastAccessed?.getTime() || 0) > maxAge
    );

    console.log(`🧹 Cleaning up ${oldSessions.length} old sessions`);

    for (const [sessionId, session] of oldSessions) {
      await this.handleSessionTimeout(sessionId);
    }

    return oldSessions.length;
  }
}