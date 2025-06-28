import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ContainerOrchestrator } from './container-orchestrator.js';
import { SessionManager } from './session-manager.js';

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
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  
  if (password !== TEST_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  // Generate a simple auth token
  const token = uuidv4();
  res.json({ 
    success: true, 
    token,
    message: 'Authentication successful' 
  });
});

app.post('/api/session/create', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }
    
    console.log('🚀 Creating new development session...');
    
    // Generate session ID
    const sessionId = uuidv4();
    
    // Create containers
    const session = await containerOrchestrator.createSession(sessionId);
    
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
    
  } catch (error) {
    console.error('❌ Failed to create session:', error);
    res.status(500).json({ 
      error: 'Failed to create development environment',
      details: error.message 
    });
  }
});

app.get('/api/session/:sessionId/status', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
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

app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
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
    
  } catch (error) {
    console.error('❌ Failed to cleanup session:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup session',
      details: error.message 
    });
  }
});

// Handle terminal access - redirect to direct Wetty URL for now
app.get('/terminal/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // For now, redirect directly to the Wetty container
  // In production, you'd want proper proxying with WebSocket support
  res.redirect(`http://localhost:${session.wettyPort}/wetty`);
});

// Health check
app.get('/health', (req, res) => {
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
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down middleware server...');
  await containerOrchestrator.cleanupAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down middleware server...');
  await containerOrchestrator.cleanupAll();
  process.exit(0);
});