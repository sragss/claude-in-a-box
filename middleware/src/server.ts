import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
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
app.use(express.json());

// Initialize services
const containerOrchestrator = new ContainerOrchestrator();
const sessionManager = new SessionManager();

// Better Auth middleware - handles all /api/auth/* routes
app.all("/api/auth/*", async (req, res) => {
  try {
    console.log(`Auth route hit: ${req.method} ${req.originalUrl}`); // Debug log
    console.log('Request headers:', req.headers); // Debug log
    
    // Create a proper URL with the base URL
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    console.log('Full URL:', fullUrl); // Debug log
    
    // Create a Web API Request object
    const webRequest = new globalThis.Request(fullUrl, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    
    const response = await auth.handler(webRequest);
    console.log('Auth response status:', response.status); // Debug log
    console.log('Auth response headers:', [...response.headers.entries()]); // Debug log
    
    // Convert Response to Express response
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    if (response.body) {
      const text = await response.text();
      console.log('Auth response body:', text); // Debug log
      res.send(text);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Auth handler error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
});

// Authentication middleware to verify user session
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    console.log('Auth middleware - session check:', session); // Debug log
    
    if (!session) {
      console.log('Auth middleware - no session found'); // Debug log
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    console.log('Auth middleware - user:', session.user); // Debug log
    // Add user info to request
    (req as any).user = session.user;
    next();
  } catch (error) {
    console.log('Auth middleware - error:', error); // Debug log
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

// Debug session endpoint
app.get('/api/debug/session', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Debug - cookies received:', req.headers.cookie);
    const session = await auth.api.getSession({ headers: req.headers });
    console.log('Debug endpoint - session from auth.api.getSession:', session);
    
    // Try to manually parse the session cookie
    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      
      console.log('Debug - parsed cookies:', Object.keys(cookies));
      console.log('Debug - better-auth.session_data present:', !!cookies['better-auth.session_data']);
      console.log('Debug - better-auth.session_token present:', !!cookies['better-auth.session_token']);
    }
    
    res.json({ 
      session,
      headers: req.headers,
      cookies: req.headers.cookie,
      parsedCookies: req.headers.cookie?.split(';').map(c => c.trim().split('=')[0])
    });
  } catch (error) {
    console.log('Debug endpoint - error:', error);
    res.status(500).json({ error: error.message });
  }
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