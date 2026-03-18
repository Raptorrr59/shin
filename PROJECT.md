# Project 3: **"Shin" (真) Knowledge Graph Navigator** - Project Details & Roadmap

## 1. Technical Specifications

### A. The AI Intelligence Layer (FastAPI + LangChain)
*   **Entity-Relationship Extraction (ERE):** Instead of just indexing text for search, Shin uses an LLM (GPT-4o or Claude 3) to identify key entities (People, Projects, Concepts) and the semantic links between them.
    *   *Input:* "Alice is the lead developer for Project Kaze."
    *   *Output:* `(Alice) -[lead_developer]-> (Project Kaze)`
*   **RAG Pipeline:**
    *   **Ingestion:** Supports `.pdf`, `.md`, and `.txt` files.
    *   **Chunking:** Semantic chunking strategy to ensure context is preserved across splits.
    *   **Embedding & Vector DB:** Uses `text-embedding-3-small` stored in **ChromaDB** or **Pinecone** for high-speed semantic retrieval.
*   **Knowledge Graph Generation:** A post-processing step that aggregates all extracted triplets into a unified JSON-based graph schema.

### B. The Graph Engine (D3.js & React Flow)
*   **Force-Directed Layout:** Implementing a physics-based layout using D3.js where nodes repel each other and edges act as springs, ensuring an organized view of complex data.
*   **Bi-directional Interaction:**
    *   **Click-to-Focus:** Clicking a node in the graph filters the chat context to that specific concept.
    *   **Source Citation:** Hovering over an edge shows the exact text snippets from your documents that justify that relationship.
*   **Incremental Rendering:** Efficiently adding new nodes to the graph as the user uploads more documents without recalculating the entire layout.

### C. The Frontend (Next.js & Tailwind CSS)
*   **The "Contextual Chat" Interface:** A side-panel chat where the AI doesn't just answer questions but also "manipulates" the graph (e.g., highlighting relevant clusters) to explain its reasoning.
*   **State Management:** Using **Zustand** to sync the state between the document uploader, the interactive graph, and the chat history.
*   **Animations:** Using **Framer Motion** for smooth transitions when nodes appear, move, or are highlighted during a chat session.

### D. Data Flow Pipeline
1.  **Upload:** User drops a folder of Markdown/PDFs.
2.  **Analyze:** Python backend extracts entities and embeddings in parallel.
3.  **Persist:** Entities go to the Graph Store; Embeddings go to the Vector Store.
4.  **Visualize:** Frontend fetches the graph schema and renders the interactive map.
5.  **Query:** User asks a question; AI retrieves relevant chunks + graph neighbors to provide a "grounded" answer.

---

## 2. Highly Detailed Objectives

### Phase 1: Ingestion & Knowledge Extraction (Week 1-2)
*   [ ] **FastAPI Setup:** Build the basic document ingestion endpoints.
*   [ ] **ERE Logic:** Write the prompt engineering logic to extract JSON-formatted triplets from text.
*   [ ] **Vector Store:** Implement a local ChromaDB instance to store and query document embeddings.
*   [ ] **Graph Schema:** Define a stable JSON format for nodes and edges that the frontend can ingest.

### Phase 2: The Visual Map (Week 3)
*   [ ] **D3 Graph Implementation:** Build a force-directed graph component in React that can handle 500+ nodes smoothly.
*   [ ] **Interactive Overlays:** Create "Node Cards" that display a summary of the concept and a list of source documents when clicked.
*   [ ] **Live Updates:** Implement a WebSocket or Long Polling mechanism to update the graph in real-time as the backend processes documents.

### Phase 3: Conversational Intelligence (Week 4-5)
*   [ ] **Grounded Chat:** Build a RAG-based chat that uses both vector search and graph neighbors for context.
*   [ ] **Citation Linking:** Ensure every AI response includes clickable citations that highlight the corresponding node/document in the UI.
*   [ ] **Polished UI:** Implement a cohesive "Glassmorphism" or "Dark Mode" aesthetic using Tailwind CSS.
*   [ ] **Ollama Integration (Bonus):** Add a toggle to switch between OpenAI and a local LLM for privacy-conscious users.

---

## 3. What You Will Learn (Deep Dive)
*   **AI Engineering:** Understanding the difference between Vector Search (semantic) and Graph Search (relational).
*   **Prompt Engineering:** Designing robust prompts that output structured data (JSON) reliably.
*   **Complex Data Visualization:** Mastering D3.js and handling non-linear user interfaces.
*   **Full-stack Performance:** Orchestrating heavy Python AI tasks with a fast React frontend.
