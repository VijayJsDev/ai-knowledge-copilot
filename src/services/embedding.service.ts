import { getEmbeddingModel } from '../core/gemini.client.js';

export class EmbeddingService {
  private model = getEmbeddingModel();

  /**
   * Generates a 3072-dimensional vector embedding for a single text string
   */
  async embedText(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

    const maxRetries = 3;
    let delay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.model.embedContent(text);
        return result.embedding.values;
      } catch (error: any) {
        console.warn(`[EmbeddingService] Attempt ${attempt} failed: ${error?.message || error}`);
        if (attempt === maxRetries) {
          throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${error?.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }

    throw new Error('Unexpected embedding failure');
  }

  /**
   * Generates embeddings for multiple texts sequentially with controlled rate
   */
  async embedBatch(texts: string[], onProgress?: (completed: number, total: number) => void): Promise<number[][]> {
    const embeddings: number[][] = [];
    const total = texts.length;

    for (let i = 0; i < texts.length; i++) {
      const emb = await this.embedText(texts[i]);
      embeddings.push(emb);
      if (onProgress) {
        onProgress(i + 1, total);
      }
      // Small 100ms pause between calls to be gentle on quota limits
      if (i < texts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return embeddings;
  }
}

export const embeddingService = new EmbeddingService();
