from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Shin AI Backend")

# Enable CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Shin AI Backend is running"}

@app.post("/ingest")
async def ingest_document(file: UploadFile = File(...)):
    return {"filename": file.filename, "status": "processing"}

@app.get("/graph")
async def get_graph():
    # Placeholder for the knowledge graph data
    return {"nodes": [], "edges": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
