import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { toNodeHandler } from "better-auth/node";
import { SessionManager } from './session-manager';
import { DockerContainerService } from './services/docker-container-service';
import { auth } from './auth';
import * as sessionController from './controllers/session';
import * as healthController from './controllers/health';

const app = express();
const PORT = parseInt(process.env.PORT || '8080');
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Initialize services
const containerService = new DockerContainerService(BASE_URL);
const sessionManager = new SessionManager();

// Middleware (proper order: CORS → Better Auth → body parsing → routes)
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

// Better Auth middleware MUST come before express.json()
app.all("/api/auth/*", toNodeHandler(auth));

// Add express.json middleware AFTER Better Auth handler
app.use(express.json());

// Request logging (errors only)
app.use((req, res, next) => {
  next();
});

// Authentication middleware using Better Auth's built-in session verification
const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.log(`🔐 Auth check for: ${req.method} ${req.path}`);
  const session = await auth.api.getSession({ 
    headers: new Headers(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']))
  });
  
  if (!session) {
    console.log(`❌ Auth failed for: ${req.method} ${req.path}`);
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  console.log(`✅ Auth success for: ${req.method} ${req.path} (user: ${session.user.id})`);
  (req as any).user = session.user;
  next();
};


// Routes (with Container Service injection)
app.post('/api/session/create', requireAuth, (req, res) => sessionController.createSession(req, res, containerService, sessionManager));
app.get('/api/session/:sessionId/status', requireAuth, (req, res) => sessionController.getSessionStatus(req, res, containerService, sessionManager));
app.delete('/api/session/:sessionId', requireAuth, (req, res) => sessionController.deleteSession(req, res, containerService, sessionManager));
app.get('/terminal/:sessionId', requireAuth, (req, res) => sessionController.getTerminalAccess(req, res, sessionManager));

// Proxy routes will be added after server creation

// General routes
app.get('/', healthController.redirectToFrontend);
app.get('/health', healthController.healthCheck);

// Debug endpoint to check and clear allocated ports
app.get('/debug/ports', (req: Request, res: Response) => {
  const allocatedPorts = containerService.getAllocatedPorts();
  res.json({ 
    allocatedPorts,
    message: `Currently tracking ${allocatedPorts.length} allocated ports`,
    timestamp: new Date().toISOString() 
  });
});

app.get('/debug/clear-ports', (req: Request, res: Response) => {
  const beforeCount = containerService.getAllocatedPorts().length;
  containerService.clearAllocatedPorts();
  res.json({ 
    message: 'Allocated ports cleared', 
    clearedCount: beforeCount,
    timestamp: new Date().toISOString() 
  });
});

// Debug endpoint for wetty testing (bypasses auth)
app.get('/debug/wetty-test', async (req: Request, res: Response) => {
  console.log('🔧 Debug wetty test endpoint called');
  let testSessionId: string | null = null;
  
  try {
    // Generate random test session ID
    testSessionId = `test-${Math.random().toString(36).substring(2, 15)}`;
    console.log(`🔧 Creating test session: ${testSessionId}`);
    
    // Create temporary session (bypass auth)
    const session = await containerService.createSession(testSessionId, 'debug-user-id', {});
    console.log(`🔧 Test session created successfully`);
    
    const results: any = {
      testSessionId,
      timestamp: new Date().toISOString(),
      tests: {}
    };
    
    // Test 1: Get session info and ports
    console.log('🔧 Step 1: Getting session info...');
    const sessionData = containerService.getSession(testSessionId);
    if (!sessionData) {
      throw new Error('Test session not found');
    }
    
    const terminalIP = await containerService.getContainerIP(testSessionId, 'terminal');
    const devIP = await containerService.getContainerIP(testSessionId, 'dev');
    const wettyHostPort = sessionData.wettyHostPort;
    
    results.tests.sessionInfo = { 
      terminalIP, 
      devIP, 
      wettyHostPort,
      wettyPort: sessionData.wettyPort 
    };
    console.log(`🔧 Session Info - Terminal IP: ${terminalIP}, Dev IP: ${devIP}, Wetty Host Port: ${wettyHostPort}`);
    
    if (!wettyHostPort) {
      throw new Error('Failed to get wetty host port');
    }
    
    // Test 2: Direct wetty HTTP connection via host port
    console.log('🔧 Step 2: Testing wetty HTTP via host port...');
    let wettyHttpTest = 'failed';
    try {
      const fetch = (await import('node-fetch')).default;
      const wettyUrl = `http://localhost:${wettyHostPort}/wetty/`;
      console.log(`🔧 Testing wetty at: ${wettyUrl}`);
      
      const fetchPromise = fetch(wettyUrl);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('HTTP timeout after 10 seconds')), 10000)
      );
      
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      wettyHttpTest = response.ok ? 'success' : `http-${response.status}`;
      console.log(`🔧 Wetty HTTP test result: ${wettyHttpTest}`);
    } catch (error: any) {
      wettyHttpTest = `error: ${error.message}`;
      console.log(`🔧 Wetty HTTP test error: ${error.message}`);
    }
    results.tests.wettyHttp = wettyHttpTest;
    
    // Test 3: Check wetty process
    console.log('🔧 Step 3: Checking wetty process...');
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const containerName = `claude-wetty-${testSessionId}`;
      const { stdout } = await execAsync(`docker exec ${containerName} ps aux`);
      const wettyProcess = stdout.includes('wetty') ? 'running' : 'not-found';
      results.tests.wettyProcess = wettyProcess;
      console.log(`🔧 Wetty process status: ${wettyProcess}`);
      
      // Get wetty command line
      const wettyLine = stdout.split('\n').find(line => line.includes('wetty'));
      if (wettyLine) {
        results.tests.wettyCommand = wettyLine.trim();
      }
    } catch (error: any) {
      results.tests.wettyProcess = `error: ${error.message}`;
      console.log(`🔧 Process check error: ${error.message}`);
    }
    
    // Test 4: Check wetty logs
    console.log('🔧 Step 4: Getting wetty logs...');
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const containerName = `claude-wetty-${testSessionId}`;
      const { stdout } = await execAsync(`docker logs ${containerName} 2>&1 | tail -10`);
      results.tests.wettyLogs = stdout.split('\n').slice(-5); // Last 5 lines
    } catch (error: any) {
      results.tests.wettyLogs = [`Error getting logs: ${error.message}`];
    }
    
    // Overall assessment
    results.overall = wettyHttpTest === 'success' ? 'PASS' : 'FAIL';
    results.recommendation = wettyHttpTest === 'success' 
      ? 'Wetty is working correctly via host port - distributed architecture ready!'
      : 'Wetty HTTP server is not responding via host port - check port publishing and configuration';
    
    console.log(`🔧 Debug test complete. Result: ${results.overall}`);
    res.json(results);
    
  } catch (error: any) {
    console.error('🔧 Debug test error:', error);
    res.status(500).json({
      error: error.message,
      testSessionId,
      overall: 'ERROR'
    });
  } finally {
    // Cleanup test session
    if (testSessionId) {
      try {
        console.log(`🔧 Cleaning up test session: ${testSessionId}`);
        await containerService.destroySession(testSessionId);
        console.log(`🔧 Test session cleanup complete`);
      } catch (cleanupError) {
        console.error(`🔧 Cleanup error:`, cleanupError);
      }
    }
  }
});

// Test route to verify proxy functionality (especially WebSocket)
app.get('/test/proxy/:sessionId', requireAuth, async (req: Request, res: Response) => {
  console.log(`🧪 Test route reached! ${req.method} ${req.path}`);
  try {
    const { sessionId } = req.params;
    const user = (req as any).user;
    
    console.log('🧪 Testing proxy for session:', sessionId);
    
    // Get session info
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    if (session.userId !== user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    const results: any = {
      sessionId,
      timestamp: new Date().toISOString(),
      tests: {}
    };
    
    // Test 1: Container health
    console.log('🧪 Step 1: Checking container health...');
    results.tests.containerHealth = await containerService.isSessionHealthy(sessionId);
    console.log('🧪 Step 1: Container health result:', results.tests.containerHealth);
    
    // Test 2: Container IPs and session data
    console.log('🧪 Step 2: Getting container IPs and session data...');
    const terminalIP = await containerService.getContainerIP(sessionId, 'terminal');
    console.log('🧪 Step 2a: Terminal IP:', terminalIP);
    const devIP = await containerService.getContainerIP(sessionId, 'dev');
    console.log('🧪 Step 2b: Dev IP:', devIP);
    
    // Get session data for host port
    const sessionData = containerService.getSession(sessionId);
    const wettyHostPort = sessionData?.wettyHostPort;
    console.log('🧪 Step 2c: Wetty Host Port:', wettyHostPort);
    
    results.tests.containerIPs = { terminal: terminalIP, dev: devIP };
    results.tests.wettyHostPort = wettyHostPort;
    
    // Test 3: Direct wetty access via host port
    console.log('🧪 Step 3: Testing direct wetty access via host port...');
    let wettyDirectAccess = 'failed';
    if (wettyHostPort) {
      try {
        const wettyUrl = `http://localhost:${wettyHostPort}/wetty/`;
        console.log(`🧪 Step 3: Testing direct access to ${wettyUrl}`);
        const fetch = (await import('node-fetch')).default;
        
        const fetchPromise = fetch(wettyUrl, { 
          headers: { 'User-Agent': 'Claude-Test-Client' }
        });
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Fetch timeout after 5 seconds')), 5000)
        );
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        wettyDirectAccess = response.ok ? 'success' : `http-${response.status}`;
        console.log('🧪 Step 3: Wetty direct access result:', wettyDirectAccess);
      } catch (error: any) {
        wettyDirectAccess = `error: ${error.message.substring(0, 50)}`;
        console.log('🧪 Step 3: Wetty direct access error:', error.message);
      }
    } else {
      console.log('🧪 Step 3: Skipping - no host port');
    }
    results.tests.wettyDirectAccess = wettyDirectAccess;
    
    // Test 4: HTTP proxy access (simulate what the iframe does)
    console.log('🧪 Step 4: Testing HTTP proxy access...');
    let httpProxyAccess = 'failed';
    try {
      const fetch = (await import('node-fetch')).default;
      
      const proxyUrl = `${BASE_URL}/proxy/terminal/${sessionId}/wetty`;
      console.log(`🧪 Step 4: Testing proxy URL: ${proxyUrl}`);
      
      const fetchPromise = fetch(proxyUrl, {
        headers: {
          'Cookie': req.headers.cookie || '',
          'User-Agent': 'Claude-Test-Client'
        },
        redirect: 'manual'
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Proxy fetch timeout after 5 seconds')), 5000)
      );
      
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      httpProxyAccess = response.ok ? 'success' : `http-${response.status}`;
      console.log('🧪 Step 4: HTTP proxy access result:', httpProxyAccess);
    } catch (error: any) {
      httpProxyAccess = `error: ${error.message.substring(0, 50)}`;
      console.log('🧪 Step 4: HTTP proxy access error:', error.message);
    }
    results.tests.httpProxyAccess = httpProxyAccess;
    
    // Test 5: WebSocket proxy (basic connection test)
    let websocketProxyTest = 'not-implemented';
    // Note: Full WebSocket testing would require a WebSocket client library
    // For now, we rely on the HTTP tests as WebSocket uses the same auth path
    
    results.tests.websocketProxy = websocketProxyTest;
    
    // Overall assessment
    console.log('🧪 Step 5: Computing overall assessment...');
    const allTestsPassed = 
      results.tests.containerHealth &&
      terminalIP && devIP &&
      wettyDirectAccess === 'success' &&
      httpProxyAccess === 'success';
    
    results.overall = allTestsPassed ? 'PASS' : 'FAIL';
    results.recommendation = allTestsPassed 
      ? 'Proxy should be working correctly'
      : 'Check failed tests above - likely WebSocket issues if HTTP works but terminal is blank';
    
    console.log('🧪 Final results:', results.overall);
    console.log('🧪 Sending JSON response...');
    res.json(results);
    
  } catch (error: any) {
    console.error('Proxy test error:', error);
    res.status(500).json({ 
      error: error.message,
      overall: 'ERROR'
    });
  }
});

// Helper functions for proxy logic
const extractSessionId = (url: string): string | null => {
  const match = url.match(/^\/proxy\/terminal\/([^\/]+)/);
  return match ? match[1] : null;
};

const isAuthenticated = async (req: any): Promise<{ user: any; sessionId: string } | null> => {
  try {
    // Check Better Auth session
    const authSession = await auth.api.getSession({ 
      headers: new Headers(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']))
    });
    
    if (!authSession) return null;
    
    // Extract session ID from URL
    const sessionId = extractSessionId(req.url);
    if (!sessionId) return null;
    
    // Check session ownership
    const session = sessionManager.getSession(sessionId);
    if (!session || session.userId !== authSession.user.id) return null;
    
    return { user: authSession.user, sessionId };
  } catch (error) {
    console.error('Authentication check failed:', error);
    return null;
  }
};

// Single terminal proxy using pathFilter pattern
const terminalProxy = createProxyMiddleware({
  pathFilter: (pathname, req) => {
    return pathname.startsWith('/proxy/terminal/');
  },
  router: async (req) => {
    try {
      // Extract session ID from URL
      const sessionId = extractSessionId(req.url);
      if (!sessionId) throw new Error('No session ID in URL');
      
      // Check authentication and session ownership
      const authSession = await auth.api.getSession({ 
        headers: new Headers(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']))
      });
      
      if (!authSession) throw new Error('Not authenticated');
      
      // Check session ownership
      const session = sessionManager.getSession(sessionId);
      if (!session) throw new Error('Session not found');
      if (session.userId !== authSession.user.id) throw new Error('Session access denied');
      
      // Get session data with host port
      const sessionData = containerService.getSession(sessionId);
      if (!sessionData || !sessionData.wettyHostPort) {
        throw new Error('Session data or host port not found');
      }
      
      const targetUrl = `http://localhost:${sessionData.wettyHostPort}`;
      return targetUrl;
    } catch (error) {
      console.error('Terminal proxy router error:', error);
      return 'http://localhost:1'; // Invalid target to trigger error
    }
  },
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Handle both wetty HTTP requests and Socket.IO WebSocket requests
    let newPath;
    if (path.includes('/socket.io/')) {
      // Socket.IO requests: /proxy/terminal/{sessionId}/socket.io/... → /wetty/socket.io/...
      newPath = path.replace(/^\/proxy\/terminal\/[^\/]+\/socket\.io/, '/wetty/socket.io');
    } else {
      // HTTP requests: /proxy/terminal/{sessionId}/wetty → /wetty
      newPath = path.replace(/^\/proxy\/terminal\/[^\/]+\/wetty/, '/wetty');
    }
    return newPath;
  },
  logLevel: 'info'
});

// Dev proxy for SSH access (similar pattern)
const devProxy = createProxyMiddleware({
  pathFilter: (pathname, req) => {
    return pathname.startsWith('/proxy/dev/');
  },
  router: async (req) => {
    try {
      const sessionId = req.url.match(/^\/proxy\/dev\/([^\/]+)/)?.[1];
      if (!sessionId) throw new Error('No session ID in URL');
      
      const authSession = await auth.api.getSession({ 
        headers: new Headers(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']))
      });
      
      if (!authSession) throw new Error('Not authenticated');
      
      const session = sessionManager.getSession(sessionId);
      if (!session || session.userId !== authSession.user.id) throw new Error('Access denied');
      
      const devIP = await containerService.getContainerIP(sessionId, 'dev');
      if (!devIP) throw new Error('Dev container IP not found');
      
      const sshPort = parseInt(process.env.CONTAINER_SSH_PORT || '22');
      return `http://${devIP}:${sshPort}`;
    } catch (error) {
      console.error('Dev proxy router error:', error);
      return 'http://localhost:1';
    }
  },
  changeOrigin: true,
  pathRewrite: {
    '^/proxy/dev/[^/]+': ''
  },
  logLevel: 'info'
});

// Add proxies to app (order matters - most specific first)
app.use(terminalProxy);
app.use(devProxy);

// Create HTTP server
const server = createServer(app);

// Standard server upgrade subscription for WebSocket support
server.on('upgrade', async (req, socket, head) => {
  if (req.url && req.url.startsWith('/proxy/terminal/') && req.url.includes('/socket.io/')) {
    try {
      const sessionId = extractSessionId(req.url);
      if (!sessionId) {
        socket.destroy();
        return;
      }

      const authSession = await auth.api.getSession({ 
        headers: new Headers(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']))
      });
      
      if (!authSession) {
        socket.destroy();
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (!session || session.userId !== authSession.user.id) {
        socket.destroy();
        return;
      }

      terminalProxy.upgrade(req, socket, head);
    } catch (error) {
      console.error('WebSocket upgrade error:', error);
      socket.destroy();
    }
  } else {
    socket.destroy();
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Claude Middleware Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 GitHub Client ID: ${process.env.GITHUB_CLIENT_ID ? 'SET' : 'NOT SET'}`);
  console.log(`🔐 GitHub Client Secret: ${process.env.GITHUB_CLIENT_SECRET ? 'SET' : 'NOT SET'}`);
  console.log(`🛡️ Better Auth Secret: ${process.env.BETTER_AUTH_SECRET ? 'SET' : 'NOT SET'}`);
});

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log('🛑 Shutting down middleware server...');
  await containerService.cleanupAll();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);