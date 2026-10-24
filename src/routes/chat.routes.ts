import { Router, Request, Response } from 'express';
import { chatService } from '../services/chat.service.js';
import { sessionService } from '../services/session.service.js';

const router = Router();

/**
 * SSE Streaming chat endpoint
 */
router.post('/stream', async (req: Request, res: Response): Promise<void> => {
  const { sessionId, message, topK } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'A non-empty "message" string is required' });
    return;
  }

  await chatService.streamGroundedChat({
    sessionId,
    message: message.trim(),
    res,
    topK: typeof topK === 'number' ? topK : 6,
  });
});

/**
 * List all chat sessions
 */
router.get('/sessions', (_req: Request, res: Response) => {
  const sessions = sessionService.getAllSessions();
  res.json({
    success: true,
    sessions,
  });
});

/**
 * Create a new chat session
 */
router.post('/sessions', (req: Request, res: Response) => {
  const { title } = req.body;
  const session = sessionService.createSession(title);
  res.status(201).json({
    success: true,
    session,
  });
});

/**
 * Get message history for a specific session
 */
router.get('/sessions/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const session = sessionService.getSession(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({
    success: true,
    session,
  });
});

/**
 * Delete a session
 */
router.delete('/sessions/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const deleted = sessionService.deleteSession(id);
  if (!deleted) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ success: true, message: 'Session deleted' });
});

export const chatRoutes = router;
