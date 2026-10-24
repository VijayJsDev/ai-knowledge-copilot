import { chunkerService } from './chunker.service.js';
import { embeddingService } from './embedding.service.js';
import { vectorStoreService } from './vector-store.service.js';
import { DocumentCitation, DocumentMetadata, SearchResult } from '../types/index.js';

export class RagService {
  /**
   * Ingests a raw text/markdown file, chunks it, generates embeddings, and saves to vector store
   */
  async ingestDocument(
    filename: string,
    content: string,
    mimeType = 'text/markdown',
    fileSize = 0
  ): Promise<DocumentMetadata> {
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const originalName = filename;

    console.log(`[RagService] Ingesting document "${originalName}" (${content.length} chars)...`);

    // 1. Chunk document
    const chunks = chunkerService.chunkText(documentId, originalName, content);
    if (chunks.length === 0) {
      throw new Error('Document produced no readable text chunks');
    }
    console.log(`[RagService] Created ${chunks.length} chunks for "${originalName}"`);

    // 2. Generate embeddings for all chunks
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await embeddingService.embedBatch(chunkTexts, (completed, total) => {
      if (completed % 5 === 0 || completed === total) {
        console.log(`[RagService] Embedding progress: ${completed}/${total} chunks`);
      }
    });

    // 3. Attach embeddings to chunks
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
    }

    // 4. Save metadata
    const metadata: DocumentMetadata = {
      id: documentId,
      filename,
      originalName,
      size: fileSize || Buffer.byteLength(content, 'utf-8'),
      mimeType,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      characterCount: content.length,
    };

    await vectorStoreService.addDocument(metadata, chunks);
    console.log(`[RagService] Successfully indexed "${originalName}" into vector store`);

    return metadata;
  }

  /**
   * Queries the vector store using semantic search
   */
  async retrieveContext(query: string, topK = 4): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    // 1. Embed user query
    const queryVector = await embeddingService.embedText(query);

    // 2. Search nearest neighbors in vector store
    const results = vectorStoreService.search(queryVector, topK);
    return results;
  }

  /**
   * Formats search results into clean citation metadata for the client
   */
  formatCitations(results: SearchResult[]): DocumentCitation[] {
    return results.map((r) => ({
      documentId: r.chunk.documentId,
      documentName: r.chunk.documentName,
      chunkIndex: r.chunk.chunkIndex,
      excerpt: r.chunk.text.slice(0, 200).replace(/\n/g, ' ') + (r.chunk.text.length > 200 ? '...' : ''),
      similarity: Math.round(r.similarity * 100) / 100,
    }));
  }
}

export const ragService = new RagService();
