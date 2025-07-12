import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ContainerOrchestrator } from '../container-orchestrator';
import { SessionManager } from '../session-manager';
import type { PostSpinupCommand } from '../types';

const containerOrchestrator = new ContainerOrchestrator();
const sessionManager = new SessionManager();

export const createSession = async (req: Request, res: Response): Promise<void> => {
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
    
    const session = await containerOrchestrator.createSession(sessionId, { 
      postSpinupCommands: enhancedCommands,
      userId: user.id,
      username: user.name,
      userEmail: user.email
    });
    
    sessionManager.addSession(sessionId, session);
    
    console.log(`✅ Session ${sessionId} created successfully`);
    
    res.json({
      success: true,
      sessionId,
      devPort: session.devPort,
      wettyPort: session.wettyPort,
      terminalUrl: `/terminal/${sessionId}`,
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

export const getSessionStatus = (req: Request, res: Response): void => {
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
  
  res.json({
    sessionId,
    status: 'active',
    owner: session.username,
    devContainer: session.devContainer,
    wettyContainer: session.wettyContainer,
    network: session.network,
    ports: {
      dev: session.devPort,
      wetty: session.wettyPort
    }
  });
};

export const deleteSession = async (req: Request, res: Response): Promise<void> => {
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
    
    await containerOrchestrator.cleanupSession(session);
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

export const getTerminalAccess = (req: Request, res: Response): void => {
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
  
  res.redirect(`http://localhost:${session.wettyPort}/wetty`);
};