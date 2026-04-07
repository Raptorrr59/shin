# Shin (真) Knowledge Graph Navigator - Multi-Phase Development Plan

## Phase 1: Refining Ingestion & ERE (Optimization)
*Goal: Improve the quality and efficiency of extracted knowledge.*

- [x] **Advanced Semantic Chunking:** Implement a more robust chunking strategy in `backend/main.py` to handle large documents without losing context. ✅
- [x] **Entity Deduplication & Merging:** Enhance the backend logic to better handle duplicate entities (e.g., "AI" vs. "Artificial Intelligence") across different document uploads. ✅
- [x] **Multi-Model ERE Support:** Refine the `extraction_prompt` to work reliably across OpenAI, Anthropic, and local Ollama models. ✅
- [x] **Enhanced Metadata Tracking:** Ensure that every extracted node and edge is linked back to its source document's metadata (filename, page number, etc.). ✅

## Phase 2: Advancing the Visual Map (Interactivity & Real-time)
*Goal: Create a more dynamic and interactive graph experience.*

- [x] **Real-time Graph Updates (WebSockets):** Implement a WebSocket server in FastAPI and a client in Next.js to push graph updates as documents are processed, replacing manual refreshes. ✅
- [x] **Generalized Clustering Logic:** Update `KnowledgeGraph.tsx` to handle more diverse knowledge domains, moving away from the "Candidate/Person" centered layout. ✅
- [x] **Enhanced "Click-to-Focus":** Implement a deep-linking feature where clicking a node filters the entire graph view and narrows the chat context to that specific entity. ✅
- [x] **Edge Visuals & Citations:** Add hover overlays to edges in the D3 graph that display the exact text snippet from the document justifying that relationship. ✅

## Phase 3: Conversational Intelligence (Citations & Context)
*Goal: Make the AI-driven chat more grounded and transparent.*

- [x] **Source-Grounded Citations:** Ensure that AI chat responses include clickable citations (e.g., "[Source 1]") that highlight the relevant node or document in the UI. ✅
- [x] **Graph-Augmented RAG:** Optimize the `chat` endpoint to fetch not just vector-based document snippets but also the local graph neighborhood (connected nodes/edges) for better context. ✅
- [x] **Interactive AI Graph Manipulation:** Allow the AI to "suggest" graph changes (adding nodes/edges) during a conversation, which the user can then approve or reject. ✅

## Phase 4: Security & Production Readiness
*Goal: Ensure the application is secure and ready for wider use.*

- [x] **User Account System:** Implemented a full JWT-based authentication system with password hashing (bcrypt) and multi-tenant data isolation. ✅
- [x] **Manual Security Audit:** Perform a deep manual review of the codebase for vulnerabilities: ✅
    - [x] **Prompt Injection:** Sanitize all user inputs before they are sent to the LLM. ✅
    - [x] **Insecure Data Handling:** Each user now has their own isolated ChromaDB instance and SQL records. ✅
    - [x] **Access Control:** Upgraded from simple API Key to secure JWT-based authorization. ✅
- [ ] **Automated Security Scan:** Run `/security:analyze` to catch common vulnerabilities and misconfigurations.
- [x] **Performance Benchmarking:** Optimized the D3 simulation with alphaDecay and tick-limits for 500+ nodes to ensure high performance. ✅
- [x] **Deployment Strategy:** Containerize the full stack using `docker-compose.yml` for easy one-command setup. ✅

---
*Legend: 🟦 In Progress | ✅ Completed | ⬜ To Do*
