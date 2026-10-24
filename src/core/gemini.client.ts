import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

// Initialize the official Google Gen AI SDK
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export function getChatModel(modelName: string = env.GEMINI_CHAT_MODEL) {
  return genAI.getGenerativeModel({
    model: modelName,
  });
}

export function getEmbeddingModel(modelName: string = env.GEMINI_EMBEDDING_MODEL) {
  return genAI.getGenerativeModel({
    model: modelName,
  });
}

export { genAI };
