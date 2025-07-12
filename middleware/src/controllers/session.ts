import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from '../session-manager';
import type { ContainerService } from '../services/container-service';
import type { PostSpinupCommand } from '../types';

export const createSession = async (
  req: Request, 
  res: Response,
  containerService: ContainerService,
  sessionManager: SessionManager
): Promise<void> => {
  try {
    const { postSpinupCommands = [] }: { 
      postSpinupCommands?: PostSpinupCommand[] 
    } = req.body;
    
    const user = (req as any).user;
    
    console.log(`🚀 Creating new development session for user ${user.name}...`);
    if (postSpinupCommands.length > 0) {
      console.log('📋 Post-spinup commands:', postSpinupCommands.map(cmd => cmd.type).join(', '));
    }
    
    const sessionId = uuidv4();
    
    const enhancedCommands: PostSpinupCommand[] = [
      {
        type: 'setup_github_user',
        username: user.name,
        email: user.email
      },
      ...postSpinupCommands
    ];
    
    const endpoints = await containerService.createSession(sessionId, { 
      postSpinupCommands: enhancedCommands,
      userId: user.id,
      username: user.name,
      userEmail: user.email
    });
    
    // Create and store session info in SessionManager (legacy for compatibility)
    const sessionInfo = {
      sessionId,
      userId: user.id,
      username: user.name,
      userEmail: user.email,
      network: `claude-${sessionId}`,
      devContainer: `claude-dev-${sessionId}`,
      wettyContainer: `claude-wetty-${sessionId}`,
      devPort: 22,
      wettyPort: 3001,
      sshKeysPath: '',
      postSpinupCommands: enhancedCommands,
      startupDirectory: '/home/node'
    };
    
    sessionManager.addSession(sessionId, sessionInfo);
    
    console.log(`✅ Session ${sessionId} created successfully`);
    
    res.json({
      success: true,
      sessionId,
      terminalUrl: endpoints.terminalUrl,
      devUrl: endpoints.devUrl,
      message: 'Development environment created'
    });
    
  } catch (error: any) {
    console.error('❌ Failed to create session:', error);
    res.status(500).json({ 
      error: 'Failed to create development environment',
      details: error.message 
    });
  }
};

export const getSessionStatus = async (
  req: Request, 
  res: Response, 
  containerService: ContainerService,
  sessionManager: SessionManager
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const user = (req as any).user;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    if (session.userId !== user.id) {
      res.status(403).json({ error: 'Access denied - not your session' });
      return;
    }
    
    // Check if session is healthy
    const isHealthy = await containerService.isSessionHealthy(sessionId);
    const endpoints = await containerService.getSessionEndpoints(sessionId);
    
    res.json({
      sessionId,
      status: isHealthy ? 'active' : 'unhealthy',
      owner: session.username,
      endpoints: endpoints ? {
        terminal: endpoints.terminalUrl,
        dev: endpoints.devUrl
      } : null,
      containers: {
        dev: session.devContainer,
        wetty: session.wettyContainer
      },
      network: session.network
    });
  } catch (error: any) {
    console.error('Error getting session status:', error);
    res.status(500).json({ 
      error: 'Failed to get session status',
      details: error.message 
    });
  }
};

export const deleteSession = async (
  req: Request, 
  res: Response,
  containerService: ContainerService,
  sessionManager: SessionManager
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const user = (req as any).user;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    if (session.userId !== user.id) {
      res.status(403).json({ error: 'Access denied - not your session' });
      return;
    }
    
    console.log(`🧹 Cleaning up session ${sessionId}...`);
    
    await containerService.destroySession(sessionId);
    sessionManager.removeSession(sessionId);
    
    console.log(`✅ Session ${sessionId} cleaned up successfully`);
    
    res.json({ 
      success: true, 
      message: 'Session cleaned up successfully' 
    });
    
  } catch (error: any) {
    console.error('❌ Failed to cleanup session:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup session',
      details: error.message 
    });
  }
};

export const getTerminalAccess = (
  req: Request, 
  res: Response, 
  sessionManager: SessionManager
): void => {
  const { sessionId } = req.params;
  const user = (req as any).user;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  if (session.userId !== user.id) {
    res.status(403).json({ error: 'Access denied - not your session' });
    return;
  }
  
  res.redirect(`/proxy/terminal/${sessionId}/wetty`);
};