import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { ContainerOrchestrator } from './container-orchestrator';
import { SessionManager } from './session-manager';
import type { PostSpinupCommand } from './types';

const app = express();
const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const containerOrchestrator = new ContainerOrchestrator();
const sessionManager = new SessionManager();

// Test password for authentication
const TEST_PASSWORD = 'devpassword';

// Routes
app.post('/api/auth/login', (req: Request, res: Response): void => {
  const { password }: { password: string } = req.body;
  
  if (password !== TEST_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  
  // Generate a simple auth token
  const token = uuidv4();
  res.json({ 
    success: true, 
    token,
    message: 'Authentication successful' 
  });
});

app.post('/api/session/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, postSpinupCommands = [] }: { 
      token: string; 
      postSpinupCommands?: PostSpinupCommand[] 
    } = req.body;
    
    if (!token) {
      res.status(401).json({ error: 'Authentication token required' });
      return;
    }
    
    console.log('🚀 Creating new development session...');
    if (postSpinupCommands.length > 0) {
      console.log('📋 Post-spinup commands:', postSpinupCommands.map(cmd => cmd.type).join(', '));
    }
    
    // Generate session ID
    const sessionId = uuidv4();
    
    // Create containers with post-spinup commands
    const session = await containerOrchestrator.createSession(sessionId, { postSpinupCommands });
    
    // Store session
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
});

app.get('/api/session/:sessionId/status', (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  res.json({
    sessionId,
    status: 'active',
    devContainer: session.devContainer,
    wettyContainer: session.wettyContainer,
    network: session.network,
    ports: {
      dev: session.devPort,
      wetty: session.wettyPort
    }
  });
});

app.delete('/api/session/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    console.log(`🧹 Cleaning up session ${sessionId}...`);
    
    // Cleanup containers and network
    await containerOrchestrator.cleanupSession(session);
    
    // Remove from session manager
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
});

// Handle terminal access - redirect to direct Wetty URL for now
app.get('/terminal/:sessionId', (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  // For now, redirect directly to the Wetty container
  // In production, you'd want proper proxying with WebSocket support
  res.redirect(`http://localhost:${session.wettyPort}/wetty`);
});

// Health check
app.get('/health', (req: Request, res: Response): void => {
  res.json({ 
    status: 'healthy', 
    service: 'claude-middleware',
    activeSessions: sessionManager.getActiveSessionCount()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Claude Middleware Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log('🛑 Shutting down middleware server...');
  await containerOrchestrator.cleanupAll();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);