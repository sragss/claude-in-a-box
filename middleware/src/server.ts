import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { toNodeHandler } from "better-auth/node";
import { ContainerOrchestrator } from './container-orchestrator';
import { SessionManager } from './session-manager';
import { auth } from './auth';
import type { PostSpinupCommand } from './types';

const app = express();
const PORT = 8080;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // Frontend URL
  credentials: true // Allow cookies
}));

// Initialize services
const containerOrchestrator = new ContainerOrchestrator();
const sessionManager = new SessionManager();

// Better Auth middleware - use toNodeHandler as per docs
app.all("/api/auth/*", (req, res, next) => {
  console.log(`Auth route hit: ${req.method} ${req.originalUrl}`);
  console.log('Request headers:', req.headers);
  console.log('Query params:', req.query);
  if (req.body) console.log('Request body:', req.body);
  
  // Override res.redirect to see what's happening
  const originalRedirect = res.redirect;
  res.redirect = function(url) {
    console.log('Better Auth attempting redirect to:', url);
    return originalRedirect.call(this, url);
  };
  
  // Override res.json to see JSON responses
  const originalJson = res.json;
  res.json = function(obj) {
    console.log('Better Auth JSON response:', obj);
    return originalJson.call(this, obj);
  };
  
  next();
}, toNodeHandler(auth));

// Add express.json middleware AFTER Better Auth handler
app.use(express.json());

// Authentication middleware to verify user session
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Add user info to request
    (req as any).user = session.user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid session' });
  }
};

app.post('/api/session/create', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { postSpinupCommands = [] }: { 
      postSpinupCommands?: PostSpinupCommand[] 
    } = req.body;
    
    const user = (req as any).user;
    
    console.log(`🚀 Creating new development session for user ${user.name}...`);
    if (postSpinupCommands.length > 0) {
      console.log('📋 Post-spinup commands:', postSpinupCommands.map(cmd => cmd.type).join(', '));
    }
    
    // Generate session ID
    const sessionId = uuidv4();
    
    // Add GitHub user setup to post-spinup commands
    const enhancedCommands: PostSpinupCommand[] = [
      {
        type: 'setup_github_user',
        username: user.name,
        email: user.email
      },
      ...postSpinupCommands
    ];
    
    // Create containers with post-spinup commands and user info
    const session = await containerOrchestrator.createSession(sessionId, { 
      postSpinupCommands: enhancedCommands,
      userId: user.id,
      username: user.name,
      userEmail: user.email
    });
    
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

app.get('/api/session/:sessionId/status', requireAuth, (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const user = (req as any).user;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  // Verify user owns this session
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
});

app.delete('/api/session/:sessionId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const user = (req as any).user;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    // Verify user owns this session
    if (session.userId !== user.id) {
      res.status(403).json({ error: 'Access denied - not your session' });
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
app.get('/terminal/:sessionId', requireAuth, (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const user = (req as any).user;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  // Verify user owns this session
  if (session.userId !== user.id) {
    res.status(403).json({ error: 'Access denied - not your session' });
    return;
  }
  
  // For now, redirect directly to the Wetty container
  // TODO: Implement proper WebSocket proxying with authentication
  res.redirect(`http://localhost:${session.wettyPort}/wetty`);
});

// Redirect after successful OAuth
app.get('/', (req: Request, res: Response): void => {
  // Redirect to frontend after OAuth callback
  res.redirect('http://localhost:5173');
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
  console.log(`🔑 GitHub Client ID: ${process.env.GITHUB_CLIENT_ID ? 'SET' : 'NOT SET'}`);
  console.log(`🔐 GitHub Client Secret: ${process.env.GITHUB_CLIENT_SECRET ? 'SET' : 'NOT SET'}`);
  console.log(`🛡️ Better Auth Secret: ${process.env.BETTER_AUTH_SECRET ? 'SET' : 'NOT SET'}`);
});

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log('🛑 Shutting down middleware server...');
  await containerOrchestrator.cleanupAll();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);