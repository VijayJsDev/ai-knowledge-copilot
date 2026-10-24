import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ragService } from '../services/rag.service.js';
import { vectorStoreService } from '../services/vector-store.service.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * Upload one or more documents (.txt, .md, .json, .csv)
 */
router.post('/upload', upload.array('files', 5), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    const ingestedDocs = [];

    for (const file of files) {
      const content = file.buffer.toString('utf-8');
      const doc = await ragService.ingestDocument(
        file.originalname,
        content,
        file.mimetype,
        file.size
      );
      ingestedDocs.push(doc);
    }

    res.status(201).json({
      success: true,
      count: ingestedDocs.length,
      documents: ingestedDocs,
    });
  } catch (error: any) {
    console.error('[DocumentRoutes] Upload error:', error);
    res.status(500).json({ error: error?.message || 'Failed to ingest documents' });
  }
});

/**
 * Ingest raw text or markdown directly via JSON payload
 */
router.post('/raw', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, content, mimeType } = req.body;
    if (!filename || !content) {
      res.status(400).json({ error: 'filename and content are required' });
      return;
    }

    const doc = await ragService.ingestDocument(
      filename,
      content,
      mimeType || 'text/markdown'
    );

    res.status(201).json({
      success: true,
      document: doc,
    });
  } catch (error: any) {
    console.error('[DocumentRoutes] Raw ingest error:', error);
    res.status(500).json({ error: error?.message || 'Failed to ingest text content' });
  }
});

/**
 * Automatically load and ingest all markdown/text files from sample_docs directory
 */
router.post('/load-samples', async (_req: Request, res: Response): Promise<void> => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const sampleDir = path.resolve(process.cwd(), 'sample_docs');

    if (!fs.existsSync(sampleDir)) {
      res.status(404).json({ error: 'sample_docs directory not found' });
      return;
    }

    const files = fs.readdirSync(sampleDir);
    const ingestedDocs = [];

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        const fullPath = path.join(sampleDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const doc = await ragService.ingestDocument(file, content, 'text/markdown');
        ingestedDocs.push(doc);
      }
    }

    res.status(201).json({
      success: true,
      message: `Ingested ${ingestedDocs.length} sample documents`,
      documents: ingestedDocs,
    });
  } catch (error: any) {
    console.error('[DocumentRoutes] Load samples error:', error);
    res.status(500).json({ error: error?.message || 'Failed to load sample documents' });
  }
});

/**
 * List all indexed documents
 */
router.get('/', (_req: Request, res: Response) => {
  const docs = vectorStoreService.getDocuments();
  res.json({
    success: true,
    count: docs.length,
    documents: docs,
  });
});

/**
 * Delete a document and its vector embeddings
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const deleted = await vectorStoreService.deleteDocument(id);
    if (!deleted) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ success: true, message: `Document ${id} removed from vector store` });
  } catch (error: any) {
    console.error('[DocumentRoutes] Delete error:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete document' });
  }
});

export const documentRoutes = router;
