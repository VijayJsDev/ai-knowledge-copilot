import { DocumentChunk } from '../types/index.js';

interface ChunkerOptions {
  targetChunkSize?: number; // Target characters per chunk (~1000 chars = ~250 tokens)
  chunkOverlap?: number;     // Overlapping characters between adjacent chunks (~150 chars)
}

export class ChunkerService {
  private targetSize: number;
  private overlap: number;

  constructor(options: ChunkerOptions = {}) {
    this.targetSize = options.targetChunkSize ?? 1000;
    this.overlap = options.chunkOverlap ?? 150;
  }

  /**
   * Chunks a document into semantic, overlapping segments
   */
  chunkText(documentId: string, documentName: string, text: string): DocumentChunk[] {
    const normalizedText = text.replace(/\r\n/g, '\n').trim();
    if (!normalizedText) {
      return [];
    }

    // Split text into paragraphs or section blocks
    const paragraphs = normalizedText.split(/\n\s*\n/);
    const chunks: DocumentChunk[] = [];
    let currentChunkText = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const cleanPara = paragraph.trim();
      if (!cleanPara) continue;

      // If adding this paragraph exceeds target size and current chunk is not empty:
      if (currentChunkText.length + cleanPara.length > this.targetSize && currentChunkText.length > 0) {
        chunks.push(this.createChunk(documentId, documentName, chunkIndex++, currentChunkText));

        // Create overlap from the end of currentChunkText
        const overlapText = currentChunkText.slice(-this.overlap);
        currentChunkText = overlapText + '\n\n' + cleanPara;
      } else {
        if (currentChunkText.length > 0) {
          currentChunkText += '\n\n' + cleanPara;
        } else {
          currentChunkText = cleanPara;
        }
      }

      // Handle oversized single paragraphs (e.g., massive unbroken walls of text)
      while (currentChunkText.length > this.targetSize * 1.5) {
        const slicePoint = this.findBestBreakPoint(currentChunkText, this.targetSize);
        const chunkPart = currentChunkText.slice(0, slicePoint).trim();
        chunks.push(this.createChunk(documentId, documentName, chunkIndex++, chunkPart));

        const overlapText = chunkPart.slice(-this.overlap);
        currentChunkText = (overlapText + ' ' + currentChunkText.slice(slicePoint)).trim();
      }
    }

    // Flush remaining text
    if (currentChunkText.trim().length > 0) {
      chunks.push(this.createChunk(documentId, documentName, chunkIndex++, currentChunkText));
    }

    return chunks;
  }

  private findBestBreakPoint(text: string, targetIndex: number): number {
    // Try to break at a period, exclamation, or newline near the target index
    const windowStart = Math.max(0, targetIndex - 100);
    const windowEnd = Math.min(text.length, targetIndex + 100);
    const windowText = text.slice(windowStart, windowEnd);

    const punctuationMatch = windowText.search(/[.\n?!]\s/);
    if (punctuationMatch !== -1) {
      return windowStart + punctuationMatch + 1;
    }

    // Fallback: break at space
    const spaceMatch = windowText.lastIndexOf(' ');
    if (spaceMatch !== -1) {
      return windowStart + spaceMatch;
    }

    // Hard fallback
    return targetIndex;
  }

  private createChunk(
    documentId: string,
    documentName: string,
    chunkIndex: number,
    text: string
  ): DocumentChunk {
    const trimmed = text.trim();
    return {
      id: `${documentId}_chunk_${chunkIndex}`,
      documentId,
      documentName,
      chunkIndex,
      text: trimmed,
      tokenEstimate: Math.ceil(trimmed.length / 4), // Rule of thumb: ~4 chars per token
    };
  }
}

export const chunkerService = new ChunkerService();
