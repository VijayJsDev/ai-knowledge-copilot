import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { ChatMessage, ChatSession } from '../types/index.js';

export class SessionService {
  private sessions: Map<string, ChatSession> = new Map();
  private storageFilePath: string;
  private maxHistoryMessages = 12; // Sliding window: retain last 12 turns

  constructor() {
    this.storageFilePath = path.join(env.DATA_DIR, 'sessions.json');
    this.initStorage();
  }

  private initStorage() {
    try {
      if (!fs.existsSync(env.DATA_DIR)) {
        fs.mkdirSync(env.DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const data: ChatSession[] = JSON.parse(raw);
        data.forEach((s) => this.sessions.set(s.id, s));
        console.log(`[SessionService] Loaded ${this.sessions.size} sessions from disk`);
      }
    } catch (error) {
      console.error('[SessionService] Error loading sessions:', error);
    }
  }

  private saveToDisk() {
    try {
      const data = Array.from(this.sessions.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[SessionService] Error saving sessions:', error);
    }
  }

  createSession(title = 'New Conversation'): ChatSession {
    const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session: ChatSession = {
      id,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.sessions.set(id, session);
    this.saveToDisk();
    return session;
  }

  getSession(id: string): ChatSession | undefined {
    return this.sessions.get(id);
  }

  getOrCreateSession(id?: string): ChatSession {
    if (id && this.sessions.has(id)) {
      return this.sessions.get(id)!;
    }
    return this.createSession();
  }

  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  addMessage(sessionId: string, message: ChatMessage): void {
    const session = this.getOrCreateSession(sessionId);
    session.messages.push(message);

    // Auto-update title if it's the first user message
    if (session.messages.length === 1 && message.role === 'user') {
      const cleanSnippet = message.content.slice(0, 40).trim();
      session.title = cleanSnippet.length === 40 ? cleanSnippet + '...' : cleanSnippet;
    }

    session.updatedAt = new Date().toISOString();

    // Maintain sliding window
    if (session.messages.length > this.maxHistoryMessages) {
      session.messages = session.messages.slice(-this.maxHistoryMessages);
    }

    this.saveToDisk();
  }

  deleteSession(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      this.saveToDisk();
    }
    return deleted;
  }
}

export const sessionService = new SessionService();
