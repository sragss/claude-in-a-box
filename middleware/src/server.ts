import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { toNodeHandler } from "better-auth/node";
import { ContainerOrchestrator } from './container-orchestrator';
import { auth } from './auth';
import * as sessionController from './controllers/session';
import * as healthController from './controllers/health';

const app = express();
const PORT = 8080;

// Initialize services
const containerOrchestrator = new ContainerOrchestrator();

// Middleware (proper order: CORS → Better Auth → body parsing → routes)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// Better Auth middleware MUST come before express.json()
app.all("/api/auth/*", toNodeHandler(auth));

// Add express.json middleware AFTER Better Auth handler
app.use(express.json());

// Authentication middleware using Better Auth's built-in session verification
const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await auth.api.getSession({ 
    headers: new Headers(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']))
  });
  
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  (req as any).user = session.user;
  next();
};

// Routes
app.post('/api/session/create', requireAuth, sessionController.createSession);
app.get('/api/session/:sessionId/status', requireAuth, sessionController.getSessionStatus);
app.delete('/api/session/:sessionId', requireAuth, sessionController.deleteSession);
app.get('/terminal/:sessionId', requireAuth, sessionController.getTerminalAccess);

// General routes
app.get('/', healthController.redirectToFrontend);
app.get('/health', healthController.healthCheck);

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