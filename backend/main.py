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
    """You are a world-class Knowledge Graph extractor. Your goal is to identify key entities and the semantic relationships between them from the provided text.
    
    1. ENTITIES: Extract all significant entities. Categorize them into one of these types:
       - Person: Individuals.
       - Organization: Companies, institutions, groups.
       - Technology: Software, hardware, tools, frameworks.
       - Skill: Technical or interpersonal proficiencies (e.g., "Python", "Project Management").
       - Concept: Abstract ideas, theories, fields of study.
       - Project: Specific initiatives or products.
       - Event: Notable occurrences.
       - Location: Geographic places or offices.
    
    2. PRIMARY SUBJECT: Identify the main entity the text is about (e.g., the name of the person in a CV). Return its ID in the "primary_subject" field of your JSON.
    
    3. RELATIONSHIPS: Extract the links between these entities. 
       - DO NOT just link everything to the primary subject. 
       - Look for relationships between OTHER entities (e.g., "React" --(is_a)--> "Technology", "Damien" --(works_at)--> "Epitech" --(located_in)--> "Lille").
       - Relationships should be concise (e.g., "works_at", "uses", "located_in", "part_of", "has_skill", "built").
    
    JSON FORMAT EXAMPLE:
    {{
        "primary_subject": "entity-id-1",
        "nodes": [
            {{ "id": "entity-id-1", "label": "Entity Name", "type": "Person", "description": "Brief description" }},
            {{ "id": "entity-id-2", "label": "Another Entity", "type": "Organization", "description": "Another description" }}
        ],
        "edges": [
            {{ "source": "entity-id-1", "target": "entity-id-2", "label": "relationship_label" }}
        ]
    }}
    
    CRITICAL RULES:
    - The "id" MUST be a unique, slugified version of the label (e.g., "slugified-name").
    - DO NOT invent, guess, or hallucinate names. Only extract names exactly as they appear in the text.
    - If a name is only a single word (like a company "Leclerc"), do NOT add a first name to it (e.g., do not turn "Leclerc" into "Luc Leclerc").
    - Distinguish between a "Person" (an individual) and an "Organization" (a company or institution).
    - Extract AS MANY relevant relationships as possible from the text.
    - DO NOT hallucinate. Only extract entities and links explicitly mentioned.
    - Output ONLY raw JSON.
    
    Text: {text}
    
    Output ONLY raw JSON.
    """
)

chat_prompt = ChatPromptTemplate.from_template(
    """You are the SHIN AI Assistant. Help users navigate their knowledge graph.
    CONTEXT: {context} (Relevant document snippets)
    GRAPH: {graph} (Relevant entities and relationships)
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
    connect_to: Optional[str] = None # No longer defaulting to 'candidate'

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
        chunks = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200).split_text(text)
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
        primary_subjects = []
        
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
                        nodes = extracted_dict.get("nodes", [])
                        edges = extracted_dict.get("edges", [])
                        primary_subject = extracted_dict.get("primary_subject")
                        
                        all_extracted_nodes.extend(nodes)
                        all_extracted_edges.extend(edges)
                        
                        if primary_subject:
                            primary_subjects.append(primary_subject)
                            
                            # Heuristic: Link orphan nodes in this chunk to the primary subject
                            # orphan = not a source or target in any extracted edge from this chunk
                            edge_node_ids = set()
                            for e in edges:
                                if isinstance(e, dict):
                                    edge_node_ids.add(str(e.get("source")))
                                    edge_node_ids.add(str(e.get("target")))
                            
                            for n in nodes:
                                if isinstance(n, dict) and "id" in n:
                                    node_id = str(n["id"])
                                    if node_id != primary_subject and node_id not in edge_node_ids:
                                        all_extracted_edges.append({
                                            "source": primary_subject,
                                            "target": node_id,
                                            "label": "related_to"
                                        })

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
                session.add(db_node)
        
        session.flush()

        # 5. Store Edges (extracted relationships only)
        for edge_data in all_extracted_edges:
            if not isinstance(edge_data, dict) or "source" not in edge_data or "target" not in edge_data:
                continue
            
            source_id = str(edge_data["source"])
            target_id = str(edge_data["target"])
            
            # Ensure both nodes exist before creating an edge
            source_exists = session.get(Node, source_id)
            target_exists = session.get(Node, target_id)
            
            if source_exists and target_exists:
                statement = select(Edge).where(Edge.source == source_id, Edge.target == target_id)
                db_edge = session.exec(statement).first()
                if not db_edge:
                    session.add(Edge(
                        source=source_id,
                        target=target_id,
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
        
        # 1. Vector Search for Semantic Context
        docs = vectorstore.similarity_search(request.message, k=3)
        context = "\n---\n".join([d.page_content for d in docs])
        
        # 2. Graph Search for Relational Context
        # We look for nodes mentioned in the user's query or in the top-k document chunks
        all_nodes = session.exec(select(Node)).all()
        relevant_node_ids = []
        
        # Simple heuristic: look for node labels in the message and snippets
        combined_text = (request.message + " " + context).lower()
        for node in all_nodes:
            if node.label.lower() in combined_text:
                relevant_node_ids.append(node.id)
        
        # Fetch 1-hop neighborhood for these relevant nodes
        relevant_edges = []
        if relevant_node_ids:
            statement = select(Edge).where((Edge.source.in_(relevant_node_ids)) | (Edge.target.in_(relevant_node_ids)))
            relevant_edges = session.exec(statement).all()
        
        # Build a concise graph summary for the LLM
        graph_triplets = []
        for edge in relevant_edges:
            graph_triplets.append(f"{edge.source} --({edge.label})--> {edge.target}")
        
        graph_summary = "\n".join(graph_triplets[:20]) # Limit to top 20 triplets to save tokens
        
        llm = get_llm(request.provider)
        chain = chat_prompt | llm | JsonOutputParser()
        return chain.invoke({
            "context": context, 
            "graph": graph_summary if graph_summary else "No relevant graph relationships found.", 
            "question": request.message
        })
    except Exception as e:
        print(f"Chat Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
