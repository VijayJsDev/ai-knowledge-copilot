export interface DocumentMetadata {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  chunkCount: number;
  characterCount: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  text: string;
  tokenEstimate: number;
  embedding?: number[];
}

export interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}

export interface DocumentCitation {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  excerpt: string;
  similarity: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: string;
  citations?: DocumentCitation[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface VectorStoreStats {
  totalDocuments: number;
  totalChunks: number;
  embeddingModel: string;
  chatModel: string;
  storageSizeBytes: number;
}
