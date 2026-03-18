# Project 3: **"Shin" (真) Knowledge Graph Navigator**
*An AI-powered document intelligence platform that transforms static notes into an interactive, visual knowledge graph.*

## Vision
Shin is designed to solve the "Black Hole" problem of personal knowledge management—where documents are ingested but rarely interconnected. By combining Retrieval-Augmented Generation (RAG) with automated entity-relationship extraction, Shin builds a living map of your data, allowing you to "see" how concepts relate across hundreds of files.

## High-Level Architecture
- **AI Intelligence Layer (FastAPI + LangChain):** Performs Entity-Relationship Extraction (ERE) and manages the RAG pipeline using ChromaDB or Pinecone.
- **Graph Engine (D3.js & React Flow):** Renders a physics-based, interactive force-directed layout of extracted knowledge.
- **Frontend (Next.js & Tailwind CSS):** A polished, side-panel chat interface synchronized with the interactive graph via Zustand.
- **Data Flow:** Documents are uploaded, analyzed for entities and embeddings, persisted in graph and vector stores, and then visualized and queried through a grounded chat.

---
For detailed technical specifications, roadmap, and learning objectives, see [PROJECT.md](./PROJECT.md).
