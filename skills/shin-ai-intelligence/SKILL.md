---
name: shin-ai-intelligence
description: AI intelligence logic for Shin, including ERE and RAG pipelines. Use when writing prompts, configuring LangChain chains, or managing vector store retrieval.
---

# Shin AI Intelligence

This skill governs the interaction between the LLM and Shin's data stores (Graph & Vector).

## 1. Entity-Relationship Extraction (ERE)

When extracting triplets from documents, use a prompt that enforces a JSON-formatted list of objects with specific keys:
- `subject`: The source entity (person, concept, project).
- `predicate`: The relationship (e.g., "is the author of", "depends on").
- `object`: The target entity.
- `type`: Category for subject/object (Person, Concept, Org, Tech).

### Triplet Extraction Rule:
> "Extract up to 5 key relationships from the provided text snippet. Only include factual relationships. Format as JSON."

## 2. RAG Pipeline (Retrieval-Augmented Generation)

Shin uses semantic context retrieval combined with relational context.

### Semantic Search (Vector)
- **Top-K**: Default to `k=4` chunks.
- **Score**: Prefer cosine similarity.

### Relational Context (Graph)
- When a user asks about a specific entity (node), also retrieve its immediate neighbors (1-hop edges) from the SQLModel database.
- **Combined Prompt**: 
  > "Using the following document snippets [Chunks] and known relationships [Graph Triplets], answer the question: [Query]"

## 3. Provider Configurations

### Ollama (Local)
- Model: `qwen2.5:7b` (recommended for high instruction-following).
- Embeddings: `nomic-embed-text`.

### OpenAI (Cloud)
- Model: `gpt-4o`.
- Embeddings: `text-embedding-3-small`.
