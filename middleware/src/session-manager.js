export class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeouts = new Map();
    this.SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  }

  addSession(sessionId, session) {
    this.sessions.set(sessionId, {
      ...session,
      createdAt: new Date(),
      lastAccessed: new Date()
    });

    // Set cleanup timeout
    this.setSessionTimeout(sessionId);
    
    console.log(`📝 Session ${sessionId} added to manager`);
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Update last accessed time
      session.lastAccessed = new Date();
      
      // Reset timeout
      this.setSessionTimeout(sessionId);
    }
    
    return session;
  }

  removeSession(sessionId) {
    this.sessions.delete(sessionId);
    
    // Clear timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }
    
    console.log(`🗑️  Session ${sessionId} removed from manager`);
  }

  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      ...session
    }));
  }

  getActiveSessionCount() {
    return this.sessions.size;
  }

  setSessionTimeout(sessionId) {
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

  async handleSessionTimeout(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      console.log(`🧹 Auto-cleaning up timed out session ${sessionId}`);
      
      try {
        // Import container orchestrator dynamically to avoid circular dependency
        const { ContainerOrchestrator } = await import('./container-orchestrator.js');
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
  getSessionStats() {
    const sessions = this.getAllSessions();
    const now = new Date();
    
    return {
      total: sessions.length,
      active: sessions.length,
      averageAge: sessions.length > 0 
        ? sessions.reduce((sum, session) => sum + (now - session.createdAt), 0) / sessions.length 
        : 0,
      oldestSession: sessions.length > 0 
        ? Math.min(...sessions.map(session => now - session.createdAt))
        : 0
    };
  }

  // Manual cleanup of old sessions
  async cleanupOldSessions(maxAge = this.SESSION_TIMEOUT) {
    const now = new Date();
    const oldSessions = this.getAllSessions().filter(session => 
      now - session.lastAccessed > maxAge
    );

    console.log(`🧹 Cleaning up ${oldSessions.length} old sessions`);

    for (const session of oldSessions) {
      await this.handleSessionTimeout(session.sessionId);
    }

    return oldSessions.length;
  }
}