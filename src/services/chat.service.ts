import { Response } from 'express';
import { getChatModel } from '../core/gemini.client.js';
import { env } from '../config/env.js';
import { ragService } from './rag.service.js';
import { sessionService } from './session.service.js';
import { ChatMessage, SearchResult } from '../types/index.js';

interface StreamChatOptions {
  sessionId?: string;
  message: string;
  res: Response;
  topK?: number;
}

export class ChatService {
  /**
   * Streams a grounded response using Server-Sent Events (SSE)
   */
  async streamGroundedChat(options: StreamChatOptions): Promise<void> {
    const { message, res, topK = 4 } = options;
    const session = sessionService.getOrCreateSession(options.sessionId);
    const sessionId = session.id;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('status', {
        sessionId,
        stage: 'retrieving',
        message: 'Searching indexed knowledge...',
      });

      // 1. Retrieve relevant chunks from vector store
      const searchResults: SearchResult[] = await ragService.retrieveContext(message, topK);
      const citations = ragService.formatCitations(searchResults);

      sendEvent('citations', {
        citations,
        count: citations.length,
      });

      // 2. Build the Grounding System Prompt
      let contextBlock = '';
      if (searchResults.length > 0) {
        contextBlock = searchResults
          .map(
            (sr, idx) =>
              `--- Context Source [${idx + 1}]: "${sr.chunk.documentName}" (Relevance: ${(sr.similarity * 100).toFixed(1)}%) ---\n${sr.chunk.text}`
          )
          .join('\n\n');
      } else {
        contextBlock = 'No matching documents found in the knowledge base.';
      }

      const systemInstruction = `You are a high-precision AI Knowledge Copilot and Principal Technical Assistant.
Your mission is to provide accurate, authoritative, and well-structured answers based strictly on the uploaded knowledge base.

CRITICAL OPERATIONAL RULES:
1. STRICT GROUNDING: Answer questions using the provided Context Sources below.
2. CODE & ARCHITECTURE CITATIONS: Whenever explaining a rule, workflow, status, or feature, cite the exact code symbols (e.g. \`OrderStatus\`, \`LineItem\`, \`Orders::ChangeStatus\`) and file paths (e.g. \`app/models/\`, \`app/services/\`) mentioned in the documentation.
3. STRUCTURED PRESENTATION: Use clear markdown headings, bullet points, and markdown tables for comparisons or state machines.
4. ANTI-HALLUCINATION: If the information needed is NOT in the provided context, state clearly and politely: "I could not find information regarding this in the uploaded documentation." Do NOT invent hypothetical details.
5. SUGGESTED FOLLOW-UPS: At the very end of your response, always propose 2 or 3 insightful follow-up questions that dive deeper into related aspects, formatted strictly as:
### 💡 Suggested Follow-ups:
- [Follow-up Question 1]?
- [Follow-up Question 2]?
- [Follow-up Question 3]?

================== RETRIEVED CONTEXT SOURCES ==================
${contextBlock}
===============================================================`;

      // 3. Construct multi-turn history for Gemini
      // Convert previous session messages to Gemini format (user / model)
      const formattedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      // Include recent history (skipping the current message)
      for (const msg of session.messages) {
        if (msg.role === 'user' || msg.role === 'model') {
          formattedHistory.push({
            role: msg.role,
            parts: [{ text: msg.content }],
          });
        }
      }

      sendEvent('status', {
        sessionId,
        stage: 'generating',
        message: 'Synthesizing grounded response...',
      });

      // 4. Multi-Model Resiliency Fallback Candidates
      const modelCandidates = [
        env.GEMINI_CHAT_MODEL,
        'gemini-3.5-flash',
        'gemini-3.6-flash',
        'gemini-3.7-flash',
        'gemini-3-flash-preview',
      ];
      // Deduplicate
      const uniqueModels = Array.from(new Set(modelCandidates));

      let resultStream: any = null;
      let usedModel = uniqueModels[0];
      let streamError: any = null;

      for (const candidate of uniqueModels) {
        try {
          const model = getChatModel(candidate);
          const chat = model.startChat({
            history: formattedHistory,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
            systemInstruction: {
              role: 'system',
              parts: [{ text: systemInstruction }],
            },
          });

          resultStream = await chat.sendMessageStream(message);
          usedModel = candidate;
          streamError = null;
          break; // Succeeded
        } catch (err: any) {
          console.warn(`[ChatService] Model ${candidate} failed (${err?.message?.slice(0, 80)}). Trying fallback...`);
          streamError = err;
        }
      }

      if (!resultStream) {
        throw streamError || new Error('All model candidates failed to generate stream');
      }

      // 5. Stream the response chunks to the client
      let fullGeneratedText = '';

      for await (const chunk of resultStream.stream) {
        const chunkText = chunk.text();
        fullGeneratedText += chunkText;
        sendEvent('chunk', { text: chunkText });
      }

      // 6. Record messages in session history
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'model',
        content: fullGeneratedText,
        timestamp: new Date().toISOString(),
        citations,
      };

      sessionService.addMessage(sessionId, userMsg);
      sessionService.addMessage(sessionId, assistantMsg);

      // 7. Complete SSE stream
      sendEvent('done', {
        sessionId,
        messageId: assistantMsg.id,
        citations,
        totalChars: fullGeneratedText.length,
      });

      res.end();
    } catch (error: any) {
      console.error('[ChatService] Error in streamGroundedChat:', error);
      sendEvent('error', {
        message: error?.message || 'An error occurred while generating the response',
      });
      res.end();
    }
  }
}

export const chatService = new ChatService();
