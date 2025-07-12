import { Request, Response } from 'express';
import { SessionManager } from '../session-manager';

const sessionManager = new SessionManager();

export const healthCheck = (req: Request, res: Response): void => {
  res.json({ 
    status: 'healthy', 
    service: 'claude-middleware',
    activeSessions: sessionManager.getActiveSessionCount()
  });
};

export const redirectToFrontend = (req: Request, res: Response): void => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(frontendUrl);
};