# 🧠 Universal AI Knowledge Copilot & RAG Backend Playground

A production-grade, domain-agnostic AI backend architecture and interactive playground for **Document-Grounded Knowledge Assistants**, powered by **Semantic Vector Search** and **LLM Grounding**.

Built with **Node.js, TypeScript, and Express**, designed to ingest **any documentation, technical manuals, policies, or custom notes** (`.txt`, `.md`, `.json`, `.csv`) and provide factual, grounded answers with citations.

---

## 🌟 Architecture & Core Capabilities

```
User (Browser / Webhook / API Client)
       │
  1. Upload Any Knowledge Docs (.md, .txt, .json)
       ▼
┌────────────────────────────────────────────────────────┐
│ Ingestion Pipeline                                     │
│  - Multer upload handler                               │
│  - Semantic Chunker (~1000 chars with overlap)         │
│  - Gemini `gemini-embedding-001` (3072 dimensions)    │
│  - Local Vector Store with Cosine Similarity           │
└────────────────────────────────────────────────────────┘
       │
  2. Ask Question: "What are the rules / procedures?"
       ▼
┌────────────────────────────────────────────────────────┐
│ Grounded Retrieval & Streaming (SSE)                   │
│  - Embed user query & search nearest vector chunks     │
│  - Grounding System Prompt with strict guardrails      │
│  - Gemini 3.5 Flash streaming via Server-Sent Events   │
│  - Automatic multi-model fallback resiliency           │
│  - Source citation badges & relevance scoring          │
└────────────────────────────────────────────────────────┘
```

### ✨ Key Features
1. **Strict Knowledge Grounding & Anti-Hallucination Guardrails:**
   * Answers are strictly synthesized from retrieved document chunks.
   * Prompts instruct the model to cite exact source files and honestly state when a topic is not covered in the knowledge base.
2. **Server-Sent Events (SSE) Real-Time Token Streaming:**
   * Ultra-low latency Time-to-First-Token (TTFT) with live typing animations.
3. **Multi-Model Resiliency & Failover:**
   * Automatically attempts primary model (`gemini-3.5-flash`) with automatic cascading fallback to secondary candidates if capacity limits (503/429) occur.
4. **Local Vector Store with Persistence:**
   * Calculates cosine similarity across 3072-dimensional vectors without requiring external paid cloud vector databases.
   * Documents and chat sessions automatically persist to `./data/` across server restarts.
5. **Multi-Turn Conversational Memory:**
   * Sliding window retains context for contextual follow-up questions while preventing token blowout.
6. **ChatGPT / Gemini Style UI:**
   * Sleek glassmorphism dark-mode interface with drag-and-drop document upload, sample loaders, active document stats, and collapsible citation accordions.

---

## 🚀 Quick Start

### 1. Prerequisites
* **Node.js**: v18+ (tested on Node v20 LTS)
* **Gemini API Key**: from [Google AI Studio](https://aistudio.google.com/)

### 2. Configuration (`.env`)
The `.env` file is pre-configured with your key:
```env
PORT=3000
GEMINI_API_KEY=your_key_here
GEMINI_CHAT_MODEL=gemini-3.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
DATA_DIR=./data
```

### 3. Run Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 📡 API Reference

### 📄 Document Ingestion
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/documents/upload` | Multipart file upload (`.md`, `.txt`, `.json`, `.csv`). Chunks, embeds, and indexes into vector store. |
| `POST` | `/api/documents/raw` | Ingest raw text/markdown payload (`{ filename, content }`). |
| `POST` | `/api/documents/load-samples` | 1-click loads and indexes sample knowledge documents from `sample_docs/`. |
| `GET` | `/api/documents` | Lists all currently indexed documents and chunk statistics. |
| `DELETE`| `/api/documents/:id` | Removes a document and deletes its vector embeddings. |

### 💬 Chat & Grounding
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/chat/stream` | Server-Sent Events (SSE) streaming chat endpoint (`{ sessionId, message, topK }`). |
| `GET` | `/api/chat/sessions` | Lists all chat sessions. |
| `GET` | `/api/chat/sessions/:id` | Retrieves message history and citations for a session. |
| `DELETE`| `/api/chat/sessions/:id` | Deletes a conversation session. |

### 📊 System & Health
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/system/stats` | Returns vector store chunk count, active models, uptime, and memory usage. |

---

## 🏗️ Project Structure

```
AI_POC/
├── src/
│   ├── config/
│   │   └── env.ts               # Zod-validated environment config
│   ├── core/
│   │   └── gemini.client.ts     # Initialized Gemini SDK client
│   ├── types/
│   │   └── index.ts             # Domain types (Document, Chunk, Citation, Session)
│   ├── services/
│   │   ├── chunker.service.ts   # Semantic text chunking with overlap
│   │   ├── embedding.service.ts # 3072-dim vectors via gemini-embedding-001
│   │   ├── vector-store.service.ts # Cosine similarity search & JSON persistence
│   │   ├── rag.service.ts       # Document ingestion & retrieval orchestrator
│   │   ├── session.service.ts   # Chat history memory & sliding window
│   │   └── chat.service.ts      # Streaming SSE response with multi-model fallback
│   ├── routes/
│   │   ├── document.routes.ts   # Document management endpoints
│   │   ├── chat.routes.ts       # Chat streaming & session endpoints
│   │   └── system.routes.ts     # Health and telemetry endpoints
│   └── server.ts                # Express server entry point
├── public/                      # Modern Dark-Mode Web Playground
│   ├── index.html               # Semantic HTML layout
│   ├── styles.css               # Modern glassmorphism CSS
│   └── app.js                   # Client SSE reader & UI controller
├── sample_docs/                 # Pre-loaded Knowledge Manuals
│   ├── order_management_system_guide.md # Sample Operational Guide
│   └── saas_tenant_policies.md          # Sample SLA & Governance Policies
├── package.json
├── tsconfig.json
└── .env
```

---

## 🔄 Moving to Production: Pinecone & PostgreSQL (pgvector)
When scaling this to millions of documents across distributed clusters:
1. **Vector Store:** Replace `src/services/vector-store.service.ts` with a **Pinecone** client (`@pinecone-database/pinecone`) or **PostgreSQL** with the `pgvector` extension. The rest of your application logic (`rag.service.ts`, `chat.service.ts`) remains identical!
2. **Session Memory:** Replace `src/services/session.service.ts` with a **Redis** client (`ioredis`) with key TTLs.
3. **Context Caching:** For large, static documentation (50k+ tokens), use Gemini's native **Context Caching API** to save up to 75% on prompt costs.
