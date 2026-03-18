---
name: shin-architecture
description: High-level architectural patterns for the Shin Knowledge Graph Navigator. Use when designing data flows, coordinating between the graph engine and vector store, or maintaining the project's visual style.
---

# Shin Architecture

Shin is an AI-powered document intelligence platform that transforms static notes into an interactive, visual knowledge graph. It relies on a "Dual-Store" architecture and a strict data flow.

## 1. Dual-Store Architecture

### A. Graph Store (Relational)
- **Technology**: SQLModel + PostgreSQL.
- **Purpose**: Stores the explicit entities (Nodes) and relationships (Edges).
- **Nodes**: `{ id: UUID, label: String, type: String, description: Text }`
- **Edges**: `{ source_id: UUID, target_id: UUID, label: String }`

### B. Vector Store (Semantic)
- **Technology**: ChromaDB.
- **Purpose**: Stores semantic document chunks for Retrieval-Augmented Generation (RAG).
- **Embedding Model**: Default to `text-embedding-3-small` (OpenAI) or `nomic-embed-text` (Ollama).

## 2. Data Flow Pipeline

1. **Ingestion**: File upload (.pdf, .md, .txt) -> `backend/main.py`.
2. **Splitting**: Semantic chunking via `langchain_text_splitters`.
3. **Extraction (ERE)**: LLM extracts triplets `(S, P, O)` from chunks.
4. **Persistence**:
   - Triplets -> SQLModel (Graph Store).
   - Chunks + Embeddings -> ChromaDB (Vector Store).
5. **Retrieval**: User Query -> Search ChromaDB (semantic context) + Search SQLModel (relational context).

## 3. Visual Identity ("Shin Aesthetics")
- **Theme**: Dark Mode only.
- **Style**: Glassmorphism (semi-transparent backgrounds, backdrop-blur, subtle borders).
- **Colors**:
  - Primary: Indigo/Blue (#3b82f6)
  - Secondary: Emerald/Green (#10b981)
  - Background: Slate-950 (#020617)
- **Animations**: Framer Motion for node entries and panel transitions.
