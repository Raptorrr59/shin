import os
import json
import uuid
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain Providers
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
import uvicorn

# Load environment variables
load_dotenv()

app = FastAPI(title="Shin AI Backend")

# Enable CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory graph storage
graph_data = {
    "nodes": [],
    "edges": []
}

# Persistent Vector Store
CHROMA_PATH = "chroma_db"
os.makedirs(CHROMA_PATH, exist_ok=True)

# --- Pydantic Models ---
class Node(BaseModel):
    id: str
    label: str
    type: str
    description: Optional[str] = ""

class Edge(BaseModel):
    source: str
    target: str
    label: str = ""

class KnowledgeGraph(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

class ChatRequest(BaseModel):
    message: str
    provider: str = "openai"

# --- Model & Embedding Factory ---
def get_llm(provider: str):
    if provider == "openai":
        return ChatOpenAI(model="gpt-4o", temperature=0)
    elif provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        return ChatOllama(model="qwen2.5:3b", temperature=0, base_url=base_url)
    elif provider == "anthropic":
        return ChatAnthropic(model="claude-3-5-sonnet-20240620", temperature=0)
    elif provider == "google":
        return ChatGoogleGenerativeAI(model="gemini-1.5-pro", temperature=0)
    return ChatOpenAI(model="gpt-4o", temperature=0)

def get_embeddings(provider: str):
    if provider == "openai":
        return OpenAIEmbeddings()
    elif provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        return OllamaEmbeddings(model="qwen2.5:3b", base_url=base_url)
    elif provider == "google":
        return GoogleGenerativeAIEmbeddings(model="models/embedding-001")
    return OpenAIEmbeddings()

# --- Knowledge Extraction Logic ---
extraction_prompt = ChatPromptTemplate.from_template(
    """You are an expert at extracting knowledge graphs from text. 
    Format the output as a JSON object with two keys: "nodes" and "edges".
    
    Each node must have:
    - "id": unique string id
    - "label": name of entity
    - "type": MUST be one of [Project, Tech, Person, Concept]
    - "description": a one-sentence summary of what this entity is
    
    Each edge must have: "source" (node id), "target" (node id), and "label".
    
    Text to analyze:
    {text}
    """
)

# --- Chat Prompt ---
chat_prompt = ChatPromptTemplate.from_template(
    """You are the SHIN AI Assistant. You help users navigate their personal knowledge graph.
    
    CONTEXT FROM DOCUMENTS:
    {context}
    
    CURRENT KNOWLEDGE GRAPH (Partial):
    {graph}
    
    USER QUESTION:
    {question}
    
    Answer the user's question based on the context. 
    If you mention entities that are in the knowledge graph, list their IDs in a "highlights" array.
    
    Format response as JSON:
    {{
        "answer": "Your detailed answer...",
        "highlights": ["node_id_1", "node_id_2"]
    }}
    """
)

@app.get("/")
async def root():
    return {"status": "online"}

@app.post("/ingest")
async def ingest_document(file: UploadFile = File(...), provider: str = "openai"):
    try:
        content = await file.read()
        text = content.decode("utf-8")
        
        embeddings = get_embeddings(provider)
        vectorstore = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = text_splitter.split_text(text)
        vectorstore.add_texts(texts=chunks, metadatas=[{"source": file.filename}] * len(chunks))
        
        llm = get_llm(provider)
        parser = JsonOutputParser(pydantic_object=KnowledgeGraph)
        chain = extraction_prompt | llm | parser
        
        extracted_data = chain.invoke({"text": text})
        
        for node in extracted_data.get("nodes", []):
            if not any(n["id"] == node["id"] for n in graph_data["nodes"]):
                graph_data["nodes"].append(node)
            else:
                # Update description if it was empty before
                for n in graph_data["nodes"]:
                    if n["id"] == node["id"] and not n.get("description"):
                        n["description"] = node.get("description")
        
        for edge in extracted_data.get("edges", []):
            if not any(e["source"] == edge["source"] and e["target"] == edge["target"] for e in graph_data["edges"]):
                graph_data["edges"].append(edge)
                
        return {"status": "success", "nodes_added": len(extracted_data.get("nodes", []))}
    except Exception as e:
        print(f"Ingest Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        embeddings = get_embeddings(request.provider)
        vectorstore = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)
        docs = vectorstore.similarity_search(request.message, k=3)
        context = "\n---\n".join([d.page_content for d in docs])
        
        graph_summary = json.dumps(graph_data["nodes"][:50])
        
        llm = get_llm(request.provider)
        chain = chat_prompt | llm | JsonOutputParser()
        
        response = chain.invoke({
            "context": context,
            "graph": graph_summary,
            "question": request.message
        })
        
        return response
    except Exception as e:
        print(f"Chat Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/graph")
async def get_graph():
    return graph_data

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
