import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env
dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required in .env'),
  GEMINI_CHAT_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  DATA_DIR: z.string().default('./data'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = {
  ...parsed.data,
  DATA_DIR: path.resolve(process.cwd(), parsed.data.DATA_DIR),
};
