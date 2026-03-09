import os
import json
import io
import shutil
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel as PydanticBaseModel
from sqlmodel import SQLModel, Field, create_engine, Session, select, delete
from dotenv import load_dotenv
from pypdf import PdfReader

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

# --- Database Setup ---
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://shin_user:shin_password@db:5432/shin_db")
engine = create_engine(DATABASE_URL)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session

# --- SQLModel Models ---
class Node(SQLModel, table=True):
    id: str = Field(primary_key=True)
    label: str
    type: str 
    description: Optional[str] = ""

class Edge(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source: str
    target: str
    label: str = ""

# --- Pydantic Models (API) ---
class KnowledgeGraph(PydanticBaseModel):
    nodes: List[Node]
    edges: List[Edge]

class ChatRequest(PydanticBaseModel):
    message: str
    provider: str = "openai"

# --- App Setup ---
app = FastAPI(title="Shin AI Backend")

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent Vector Store
CHROMA_PATH = "chroma_db"
os.makedirs(CHROMA_PATH, exist_ok=True)

# --- AI Model Factory ---
def get_llm(provider: str):
    if provider == "openai":
        return ChatOpenAI(model="gpt-4o", temperature=0)
    elif provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        return ChatOllama(
            model="qwen2.5:3b", 
            temperature=0, 
            base_url=base_url,
            timeout=300
        )
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

# --- REFINED EXTRACTION PROMPT ---
extraction_prompt = ChatPromptTemplate.from_template(
    """You are a world-class Knowledge Graph extractor specialized in Resumes and CVs.
    
    1. IDENTITY: Identify the candidate's FULL NAME. Node: id="primary-person", type="Person", label=FullName.
    2. ENTITIES: Extract ALL relevant entities.
       CRITICAL: The "label" MUST be the specific name of the entity, NEVER the category name.
       - Experience: Label="Company Name" (e.g. "Google", "Epitech").
       - Tech: Label="Framework/Language Name" (e.g. "React", "Rust").
       - Skills: Label="Specific Skill" (e.g. "Distributed Systems", "Graphic Design").
       - Projects: Label="Project Name" (e.g. "Shin", "Kaze").
    3. RELATIONSHIPS: Every extracted node MUST have an edge connecting it to "primary-person".
    
    JSON FORMAT:
    {{
        "nodes": [
            {{ "id": "unique-slug", "label": "Specific Name", "type": "Project|Tech|Person|Concept|Experience|Skill|Hobby", "description": "Summary" }}
        ],
        "edges": [
            {{ "source": "primary-person", "target": "unique-slug", "label": "has_skill|worked_at|built" }}
        ]
    }}
    
    Text: {text}
    
    Output ONLY raw JSON.
    """
)

chat_prompt = ChatPromptTemplate.from_template(
    """You are the SHIN AI Assistant. Help users navigate their graph.
    CONTEXT: {context}
    GRAPH: {graph}
    QUESTION: {question}
    Format response as JSON: {{"answer": "...", "highlights": ["node_id_1"]}}
    """
)

# --- Endpoints ---
@app.get("/")
async def root():
    return {"status": "online"}

@app.post("/ingest")
async def ingest_document(file: UploadFile = File(...), provider: str = "openai", session: Session = Depends(get_session)):
    print(f"--- Ingesting: {file.filename} with {provider} ---")
    try:
        # 1. Read Content
        filename = file.filename.lower()
        if filename.endswith(".pdf"):
            pdf_content = await file.read()
            reader = PdfReader(io.BytesIO(pdf_content))
            text = "\n".join([page.extract_text() for page in reader.pages if page.extract_text()])
        else:
            content = await file.read()
            text = content.decode("utf-8")
        
        # 2. Vector Store (RAG)
        print(f"--- Step 1: Generating Embeddings ---")
        embeddings = get_embeddings(provider)
        vectorstore = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)
        chunks = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100).split_text(text)
        print(f"Adding {len(chunks)} chunks to vector store...")
        vectorstore.add_texts(texts=chunks, metadatas=[{"source": file.filename}] * len(chunks))
        
        # Give Ollama a moment to breathe
        import time
        if provider == "ollama":
            print("Cooling down Ollama...")
            time.sleep(2)

        # 3. AI Extraction
        print(f"--- Step 2: Extracting Knowledge Graph ---")
        llm = get_llm(provider)
        parser = JsonOutputParser(pydantic_object=KnowledgeGraph)
        chain = extraction_prompt | llm | parser
        
        raw_extracted = chain.invoke({"text": text})
        print(f"RAW AI OUTPUT: {json.dumps(raw_extracted, indent=2)}")
        
        # --- ROBUST DATA NORMALIZATION ---
        if isinstance(raw_extracted, list):
            nodes_list = [n for n in raw_extracted if isinstance(n, dict) and "label" in n]
            edges_list = [e for e in raw_extracted if isinstance(e, dict) and "source" in e]
            extracted_dict = {"nodes": nodes_list, "edges": edges_list}
        elif isinstance(raw_extracted, dict):
            extracted_dict = raw_extracted
        else:
            extracted_dict = {"nodes": [], "edges": []}

        # 4. Store in DB
        nodes_added = 0
        for node_data in extracted_dict.get("nodes", []):
            if not isinstance(node_data, dict) or "id" not in node_data:
                continue
                
            node_id = str(node_data["id"])
            node_label = str(node_data.get("label", ""))
            node_type = str(node_data.get("type", "Concept"))
            
            # CRITICAL: Prevent merging if label is just the type name (lazy AI)
            is_generic_label = node_label.lower() == node_type.lower()
            
            db_node = session.get(Node, node_id)
            if not db_node and not is_generic_label:
                # Only fallback to label-match if the label is actually specific
                statement = select(Node).where(Node.label == node_label, Node.type == node_type)
                db_node = session.exec(statement).first()
            
            if not db_node:
                new_node = Node(
                    id=node_id,
                    label=node_label,
                    type=node_type,
                    description=str(node_data.get("description", ""))
                )
                session.add(new_node)
                nodes_added += 1
            else:
                # Update existing node
                if node_data.get("description") and not db_node.description:
                    db_node.description = str(node_data["description"])
                # Ensure edges link to the actual ID in the DB
                node_data["id"] = db_node.id 
                session.add(db_node)
        
        # Ensure session is flushed so nodes are available for edge verification
        session.flush()

        for edge_data in extracted_dict.get("edges", []):
            if not isinstance(edge_data, dict) or "source" not in edge_data or "target" not in edge_data:
                continue
            
            # Verify source and target exist in DB (or were just added)
            statement = select(Edge).where(Edge.source == edge_data["source"], Edge.target == edge_data["target"])
            db_edge = session.exec(statement).first()
            if not db_edge:
                session.add(Edge(
                    source=str(edge_data["source"]),
                    target=str(edge_data["target"]),
                    label=str(edge_data.get("label", ""))
                ))
        
        session.commit()
        return {"status": "success", "nodes_added": nodes_added}
    except Exception as e:
        print(f"Ingest Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/graph")
async def get_graph(session: Session = Depends(get_session)):
    nodes = session.exec(select(Node)).all()
    edges = session.exec(select(Edge)).all()
    return {"nodes": nodes, "edges": edges}

@app.delete("/nodes/{node_id}")
async def delete_node(node_id: str, session: Session = Depends(get_session)):
    node = session.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    edges_statement = delete(Edge).where((Edge.source == node_id) | (Edge.target == node_id))
    session.exec(edges_statement)
    session.delete(node)
    session.commit()
    return {"status": "deleted"}

@app.delete("/graph")
async def clear_graph(session: Session = Depends(get_session)):
    session.exec(delete(Edge))
    session.exec(delete(Node))
    session.commit()
    if os.path.exists(CHROMA_PATH):
        shutil.rmtree(CHROMA_PATH)
        os.makedirs(CHROMA_PATH, exist_ok=True)
    return {"status": "cleared"}

@app.post("/chat")
async def chat(request: ChatRequest, session: Session = Depends(get_session)):
    try:
        embeddings = get_embeddings(request.provider)
        vectorstore = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)
        docs = vectorstore.similarity_search(request.message, k=3)
        context = "\n---\n".join([d.page_content for d in docs])
        nodes = session.exec(select(Node).limit(50)).all()
        graph_summary = json.dumps([n.dict() for n in nodes])
        llm = get_llm(request.provider)
        chain = chat_prompt | llm | JsonOutputParser()
        return chain.invoke({"context": context, "graph": graph_summary, "question": request.message})
    except Exception as e:
        print(f"Chat Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
