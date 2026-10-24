import { Router, Request, Response } from 'express';
import { vectorStoreService } from '../services/vector-store.service.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/stats', (_req: Request, res: Response) => {
  const stats = vectorStoreService.getStats();
  const memory = process.memoryUsage();

  res.json({
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    models: {
      chatModel: env.GEMINI_CHAT_MODEL,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
    },
    vectorStore: stats,
    systemMemory: {
      rssMb: (memory.rss / (1024 * 1024)).toFixed(1),
      heapUsedMb: (memory.heapUsed / (1024 * 1024)).toFixed(1),
    },
  });
});

export const systemRoutes = router;
