import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/env.js';
import { documentRoutes } from './routes/document.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { systemRoutes } from './routes/system.routes.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend static assets
const publicPath = path.resolve(process.cwd(), 'public');
app.use(express.static(publicPath));

// API Routes
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/system', systemRoutes);

// Fallback route for SPA
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  } else {
    next();
  }
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ServerError]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

app.listen(env.PORT, () => {
  console.log(`
=====================================================
🚀 AI SaaS Copilot & RAG Backend Running!
📡 URL: http://localhost:${env.PORT}
🧠 Chat Model: ${env.GEMINI_CHAT_MODEL}
📐 Embedding Model: ${env.GEMINI_EMBEDDING_MODEL}
💾 Data Directory: ${env.DATA_DIR}
=====================================================
`);
});
