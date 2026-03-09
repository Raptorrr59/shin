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
            model="qwen2.5:7b", 
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
        return OllamaEmbeddings(
            model="nomic-embed-text", 
            base_url=base_url,
            client_kwargs={"timeout": 60.0}
        )
    elif provider == "google":
        return GoogleGenerativeAIEmbeddings(model="models/embedding-001")
    return OpenAIEmbeddings()

# --- REFINED EXTRACTION PROMPT ---
extraction_prompt = ChatPromptTemplate.from_template(
    """You are a world-class Knowledge Graph extractor specialized in Resumes and CVs.
    
    1. IDENTITY: Identify the candidate's FULL NAME. 
    2. ENTITIES: Extract ALL relevant entities. Pay special attention to often-missed categories:
       - Experience: Professional work history. Label = Company Name. Description = Role, Location, Summary.
       - Education: Academic degrees, schools, and universities. DO NOT put these under Projects. Label = Degree or School.
       - Projects: Academic, personal, or professional projects. Label = Project Name. Description = Goal or role in project.
       - Tech: Frameworks, tools, and platforms.
       - Hard Skill: Technical skills, tools, and programming languages. MUST use type "Hard Skill".
       - Soft Skill: Interpersonal skills. MUST use type "Soft Skill".
       - Language: Spoken languages. MUST use type "Language".
       - Hobby: Personal interests and activities. MUST use type "Hobby".
    
    JSON FORMAT EXAMPLE:
    {{
        "nodes": [
            {{ "id": "candidate", "label": "Full Name Here", "type": "Person", "description": "Candidate Profile" }},
            {{ "id": "example-hard-skill", "label": "Example Hard Skill", "type": "Hard Skill", "description": "Programming Language" }},
            {{ "id": "example-soft-skill", "label": "Example Soft Skill", "type": "Soft Skill", "description": "Interpersonal Skill" }},
            {{ "id": "example-language", "label": "Example Language", "type": "Language", "description": "Fluent" }},
            {{ "id": "example-hobby", "label": "Example Hobby", "type": "Hobby", "description": "Personal Interest" }},
            {{ "id": "example-school", "label": "Example University", "type": "Education", "description": "Degree Name" }},
            {{ "id": "example-company", "label": "Example Company", "type": "Experience", "description": "Job Title, Location. Summary." }},
            {{ "id": "example-project", "label": "Example Project", "type": "Project", "description": "Project summary." }}
        ],
        "edges": [
            {{ "source": "candidate", "target": "example-hard-skill", "label": "has_hard_skill" }},
            {{ "source": "candidate", "target": "example-soft-skill", "label": "has_soft_skill" }},
            {{ "source": "candidate", "target": "example-language", "label": "speaks" }},
            {{ "source": "candidate", "target": "example-hobby", "label": "enjoys" }},
            {{ "source": "candidate", "target": "example-school", "label": "studied_at" }},
            {{ "source": "candidate", "target": "example-company", "label": "worked_at" }},
            {{ "source": "candidate", "target": "example-project", "label": "built_project" }}
        ]
    }}
    
    CRITICAL RULES:
    - The Person node MUST have the id "candidate".
    - ALL edges must have "source": "candidate".
    - Distinguish clearly between professional "Experience" (working for a company) and "Project" (building a specific software/tool).
    - You MUST extract Projects, Hard Skills, Soft Skills, and Hobbies if they exist.
    - DO NOT hallucinate. Only extract entities that are explicitly written in the text. DO NOT copy the examples.
    - DO NOT use the generic "Skill" type. You MUST classify as either "Hard Skill" or "Soft Skill".
    - DO NOT escape characters like dashes (-) or underscores (_) in your JSON values.
    
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

class NodeUpdate(PydanticBaseModel):
    label: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None

class NodeCreate(PydanticBaseModel):
    id: str
    label: str
    type: str
    description: Optional[str] = ""
    connect_to: Optional[str] = "candidate" # Default link to the primary person

# --- Endpoints ---
@app.get("/")
async def root():
    return {"status": "online"}

@app.put("/nodes/{node_id}")
async def update_node(node_id: str, update_data: NodeUpdate, session: Session = Depends(get_session)):
    node = session.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    if update_data.label is not None:
        node.label = update_data.label
    if update_data.type is not None:
        node.type = update_data.type
    if update_data.description is not None:
        node.description = update_data.description
        
    session.add(node)
    session.commit()
    session.refresh(node)
    return node

@app.post("/nodes")
async def create_node(node_data: NodeCreate, session: Session = Depends(get_session)):
    # Create the node
    db_node = session.get(Node, node_data.id)
    if db_node:
        raise HTTPException(status_code=400, detail="Node with this ID already exists")
        
    new_node = Node(
        id=node_data.id,
        label=node_data.label,
        type=node_data.type,
        description=node_data.description
    )
    session.add(new_node)
    
    # Create the connecting edge
    if node_data.connect_to:
        target_node = session.get(Node, node_data.connect_to)
        if target_node:
            new_edge = Edge(
                source=node_data.connect_to,
                target=new_node.id,
                label="has_" + node_data.type.lower()
            )
            session.add(new_edge)
            
    session.commit()
    return {"status": "success", "node": new_node}

class AIManualNodeRequest(PydanticBaseModel):
    prompt: str
    provider: str = "openai"

# --- Prompts ---
manual_node_prompt = ChatPromptTemplate.from_template(
    """You are a Knowledge Graph assistant. 
    The user has given you a brief instruction to add a new entity to their graph.
    Extract the necessary details to create a single node AND a relevant relationship edge.
    
    RULES:
    - id: A slugified version of the name.
    - label: The actual name of the entity.
    - type: Must be one of [Project, Tech, Person, Concept, Experience, Skill, Hobby]. Guess the best fit.
    - description: A brief summary based on the user's prompt.
    - edge_label: The relationship between the Candidate and this node (e.g., "has_skill", "built_project", "worked_at", "enjoys").
    
    USER PROMPT: {prompt}
    
    Output ONLY a raw JSON object:
    {{
        "id": "slug-name",
        "label": "Real Name",
        "type": "Skill",
        "description": "Short description",
        "edge_label": "has_skill"
    }}
    """
)

@app.post("/ai-add-node")
async def ai_add_node(request: AIManualNodeRequest, session: Session = Depends(get_session)):
    try:
        llm = get_llm(request.provider)
        parser = JsonOutputParser()
        chain = manual_node_prompt | llm | parser
        
        node_data = chain.invoke({"prompt": request.prompt})
        
        node_id = str(node_data.get("id"))
        db_node = session.get(Node, node_id)
        
        if db_node:
             raise HTTPException(status_code=400, detail="Node already exists with this derived ID")
             
        new_node = Node(
            id=node_id,
            label=str(node_data.get("label", node_id)),
            type=str(node_data.get("type", "Concept")),
            description=str(node_data.get("description", ""))
        )
        session.add(new_node)
        
        # Link to candidate automatically with AI-generated label
        new_edge = Edge(
            source="candidate",
            target=node_id,
            label=str(node_data.get("edge_label", "is_related_to"))
        )
        session.add(new_edge)
        
        session.commit()
        session.refresh(new_node)
        return {"status": "success", "node": new_node.dict()}
    except Exception as e:
        print(f"AI Add Node Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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

        # 3. AI Extraction (Chunked)
        print(f"--- Step 2: Extracting Knowledge Graph (Chunked) ---")
        llm = get_llm(provider)
        
        # Split text into smaller chunks for extraction
        extraction_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
        extraction_chunks = extraction_splitter.split_text(text)
        print(f"Processing {len(extraction_chunks)} extraction passes...")
        
        all_extracted_nodes = []
        all_extracted_edges = []
        
        import re
        
        for i, chunk in enumerate(extraction_chunks):
            print(f"Extraction pass {i+1}/{len(extraction_chunks)}...")
            try:
                # We use string output to manually parse it and avoid strict Pydantic errors
                from langchain_core.output_parsers import StrOutputParser
                chain = extraction_prompt | llm | StrOutputParser()
                
                raw_output = chain.invoke({"text": chunk})
                
                # Find JSON block in the output
                json_match = re.search(r'\{.*\}', raw_output.replace('\n', ''), re.DOTALL)
                if not json_match:
                    # Try to find it with newlines
                    json_match = re.search(r'\{[\s\S]*\}', raw_output)
                    
                if json_match:
                    json_str = json_match.group(0)
                    
                    # LLMs sometimes incorrectly escape characters in JSON
                    json_str = json_str.replace(r'\_', '_').replace(r'\-', '-')
                    # Fix unescaped newlines in strings
                    json_str = json_str.replace('\n', ' ')
                    
                    try:
                        extracted_dict = json.loads(json_str)
                    except json.JSONDecodeError as e:
                        print(f"JSON Decode Error on chunk {i+1}: {e}\nRaw String: {json_str}")
                        continue
                        
                    if isinstance(extracted_dict, dict):
                        all_extracted_nodes.extend(extracted_dict.get("nodes", []))
                        all_extracted_edges.extend(extracted_dict.get("edges", []))
                else:
                    print(f"No JSON found in chunk {i+1} output.")
                
                # Small pause between chunks for Ollama
                if provider == "ollama":
                    time.sleep(1)
            except Exception as e:
                print(f"Extraction chunk {i+1} failed: {e}")
                continue

        print(f"Extraction complete! Found {len(all_extracted_nodes)} raw nodes.")

        # 4. Store in DB (with deduplication)
        nodes_added = 0
        for node_data in all_extracted_nodes:
            if not isinstance(node_data, dict) or "id" not in node_data:
                continue
                
            node_id = str(node_data["id"])
            node_label = str(node_data.get("label", ""))
            node_type = str(node_data.get("type", "Concept"))
            
            # Prevent generic merging
            is_generic_label = node_label.lower() == node_type.lower()
            
            db_node = session.get(Node, node_id)
            if not db_node and not is_generic_label:
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
                if node_data.get("description") and not db_node.description:
                    db_node.description = str(node_data["description"])
                node_data["id"] = db_node.id 
                node_id = db_node.id # Update node_id to the DB's actual ID
                session.add(db_node)

            # FORCE EDGE CREATION: Make absolutely sure this node is linked to the candidate
            if node_id != "candidate":
                statement = select(Edge).where(Edge.source == "candidate", Edge.target == node_id)
                db_edge = session.exec(statement).first()
                if not db_edge:
                    # Find a label if the AI provided one, otherwise guess
                    found_label = next((e.get("label") for e in all_extracted_edges if isinstance(e, dict) and e.get("target") == node_id), None)
                    edge_label = str(found_label) if found_label else f"has_{node_type.lower().replace(' ', '_')}"
                    
                    session.add(Edge(
                        source="candidate",
                        target=node_id,
                        label=edge_label
                    ))
        
        session.flush()

        for edge_data in all_extracted_edges:
            if not isinstance(edge_data, dict) or "source" not in edge_data or "target" not in edge_data:
                continue
            
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
