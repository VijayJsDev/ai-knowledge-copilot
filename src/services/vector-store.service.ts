import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { DocumentChunk, DocumentMetadata, SearchResult, VectorStoreStats } from '../types/index.js';

interface SerializedStore {
  documents: DocumentMetadata[];
  chunks: DocumentChunk[];
}

export class VectorStoreService {
  private documents: Map<string, DocumentMetadata> = new Map();
  private chunks: Map<string, DocumentChunk> = new Map();
  private storageFilePath: string;

  constructor() {
    this.storageFilePath = path.join(env.DATA_DIR, 'vector_store.json');
    this.initStorage();
  }

  private initStorage() {
    try {
      if (!fs.existsSync(env.DATA_DIR)) {
        fs.mkdirSync(env.DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const data: SerializedStore = JSON.parse(raw);
        data.documents.forEach((doc) => this.documents.set(doc.id, doc));
        data.chunks.forEach((chunk) => this.chunks.set(chunk.id, chunk));
        console.log(`[VectorStore] Loaded ${this.documents.size} documents and ${this.chunks.size} chunks from disk`);
      }
    } catch (error) {
      console.error('[VectorStore] Error initializing vector store from disk:', error);
    }
  }

  private saveToDisk() {
    try {
      const data: SerializedStore = {
        documents: Array.from(this.documents.values()),
        chunks: Array.from(this.chunks.values()),
      };
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[VectorStore] Error saving store to disk:', error);
    }
  }

  /**
   * Adds or updates document metadata and its associated vector chunks
   */
  async addDocument(metadata: DocumentMetadata, chunks: DocumentChunk[]): Promise<void> {
    this.documents.set(metadata.id, metadata);
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
    this.saveToDisk();
  }

  /**
   * Calculates cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Searches for top-K chunks semantically closest to the query vector
   */
  search(queryVector: number[], topK = 4, minSimilarity = 0.35): SearchResult[] {
    const results: SearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      if (!chunk.embedding || chunk.embedding.length === 0) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryVector, chunk.embedding);
      if (similarity >= minSimilarity) {
        results.push({
          chunk,
          similarity,
        });
      }
    }

    // Sort descending by similarity
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, topK);
  }

  /**
   * Removes a document and all of its chunks
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    if (!this.documents.has(documentId)) {
      return false;
    }

    this.documents.delete(documentId);

    // Delete all chunks for this document
    for (const [chunkId, chunk] of this.chunks.entries()) {
      if (chunk.documentId === documentId) {
        this.chunks.delete(chunkId);
      }
    }

    this.saveToDisk();
    return true;
  }

  /**
   * Retrieves all registered documents
   */
  getDocuments(): DocumentMetadata[] {
    return Array.from(this.documents.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  /**
   * Returns current store stats
   */
  getStats(): VectorStoreStats {
    let size = 0;
    try {
      if (fs.existsSync(this.storageFilePath)) {
        size = fs.statSync(this.storageFilePath).size;
      }
    } catch {
      size = 0;
    }

    return {
      totalDocuments: this.documents.size,
      totalChunks: this.chunks.size,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
      chatModel: env.GEMINI_CHAT_MODEL,
      storageSizeBytes: size,
    };
  }
}

export const vectorStoreService = new VectorStoreService();
