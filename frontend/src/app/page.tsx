"use client";

import { useState, useEffect, useRef } from "react";
import KnowledgeGraph, { Node, Edge } from "@/components/KnowledgeGraph";
import HierarchyView from "@/components/HierarchyView";

const API_URL = "http://localhost:8000";

interface Message {
  role: "user" | "ai";
  content: string;
}

export default function Home() {
  const [view, setView] = useState<"graph" | "tree">("graph");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("openai");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ label: "", description: "", type: "" });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGraph();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedNode) {
      setEditForm({
        label: selectedNode.label || "",
        description: selectedNode.description || "",
        type: selectedNode.type || "Concept"
      });
      setIsEditing(false);
    }
  }, [selectedNode]);

  const fetchGraph = async () => {
    try {
      const response = await fetch(`${API_URL}/graph`);
      const data = await response.json();
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (error) {
      console.error("Failed to fetch graph:", error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatus(`Analyzing ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/ingest?provider=${provider}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Analysis failed");

      await fetchGraph();
      setStatus(null);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveNodeEdit = async () => {
    if (!selectedNode) return;
    try {
      const response = await fetch(`${API_URL}/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (response.ok) {
        const updatedNode = await response.json();
        setSelectedNode(updatedNode);
        setIsEditing(false);
        await fetchGraph();
      }
    } catch (error) {
      console.error("Failed to update node:", error);
    }
  };

  const deleteNode = async (nodeId: string) => {
    if (!confirm("Are you sure you want to delete this node and its connections?")) return;
    
    try {
      const response = await fetch(`${API_URL}/nodes/${nodeId}`, { method: "DELETE" });
      if (response.ok) {
        setSelectedNode(null);
        await fetchGraph();
      }
    } catch (error) {
      console.error("Failed to delete node:", error);
    }
  };

  const clearAll = async () => {
    if (!confirm("WARNING: This will permanently wipe your entire Knowledge Graph and all document embeddings. Continue?")) return;
    
    try {
      const response = await fetch(`${API_URL}/graph`, { method: "DELETE" });
      if (response.ok) {
        setSelectedNode(null);
        setMessages([]);
        setNodes([]);
        setEdges([]);
        setHighlightedNodes([]);
        await fetchGraph();
      }
    } catch (error) {
      console.error("Failed to clear graph:", error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isChatting) return;

    const userMsg = inputMessage;
    setInputMessage("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatting(true);

    try {
      if (userMsg.toLowerCase().startsWith("/add ")) {
        const prompt = userMsg.substring(5);
        const response = await fetch(`${API_URL}/ai-add-node`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, provider }),
        });

        if (!response.ok) throw new Error("Failed to add node via AI");

        const data = await response.json();
        setMessages((prev) => [...prev, { role: "ai", content: `Neural link established: Node **${data.node.label}** (${data.node.type}) added successfully.` }]);
        await fetchGraph();
      } else {
        const response = await fetch(`${API_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMsg, provider }),
        });

        if (!response.ok) throw new Error("Interface connection lost");

        const data = await response.json();
        setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
        setHighlightedNodes(data.highlights || []);
      }
    } catch (error: any) {
      setMessages((prev) => [...prev, { role: "ai", content: `ERR: ${error.message}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <main className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar (Chat & Controls) */}
      <aside className="w-[400px] border-r border-slate-800 flex flex-col bg-slate-950/50 backdrop-blur-xl shadow-2xl z-20">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-blue-500 italic">SHIN (真)</h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Knowledge Navigator</p>
          </div>
          <div className="flex space-x-2">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.md,.pdf" />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-3 bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 rounded-2xl border border-blue-500/20 transition-all active:scale-95"
              title="Ingest Documents"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
            <button 
              onClick={clearAll}
              className="p-3 bg-red-600/10 text-red-500 hover:bg-red-600/20 rounded-2xl border border-red-500/20 transition-all active:scale-95"
              title="Reset All Knowledge"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="px-6 py-4 flex space-x-2 border-b border-slate-800 bg-slate-900/10">
          <button 
            onClick={() => setView("graph")}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'graph' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-900 text-slate-500 hover:bg-slate-800'}`}
          >
            Neural Map
          </button>
          <button 
            onClick={() => setView("tree")}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'tree' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-900 text-slate-500 hover:bg-slate-800'}`}
          >
            Hierarchy
          </button>
        </div>

        {/* AI Provider & Status */}
        <div className="px-6 py-4 space-y-3 bg-slate-900/20 border-b border-slate-800">
          <select 
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:border-slate-700 transition-all"
          >
            <option value="openai">Core: OpenAI (GPT-4o)</option>
            <option value="ollama">Core: Local (Qwen 2.5)</option>
            <option value="anthropic">Core: Anthropic (Claude)</option>
            <option value="google">Core: Google (Gemini)</option>
          </select>
          {status && (
            <div className="text-[10px] font-black uppercase tracking-tighter text-blue-400 animate-pulse">{status}</div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
              <div className="w-12 h-12 rounded-full border-2 border-slate-700 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <p className="text-xs font-black uppercase tracking-widest">Awaiting Neural Query</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-xl ${
                msg.role === "user" 
                ? "bg-blue-600 text-white rounded-tr-none font-medium" 
                : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-slate-800">
          <form onSubmit={handleSendMessage} className="relative">
            <input 
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Query the map..."
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-4 pr-12 py-4 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-slate-600"
            />
            <button 
              type="submit"
              disabled={isChatting || !inputMessage.trim()}
              className="absolute right-2 top-2 bottom-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl transition-all active:scale-95"
            >
              {isChatting ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              )}
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <section className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden p-6">
        <div className="flex-1 relative">
          {/* Node Details Overlay */}
          {selectedNode && (
            <div className="absolute top-4 left-4 z-30 w-80 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-[2rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-left-4 border-t-blue-500/20">
              <div className="flex justify-between items-start mb-6">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg
                  ${selectedNode.type === 'Project' ? 'bg-blue-600 shadow-blue-900/20' : 
                    selectedNode.type === 'Tech' ? 'bg-green-600 shadow-green-900/20' : 
                    selectedNode.type === 'Person' ? 'bg-purple-600 shadow-purple-900/20' : 
                    selectedNode.type === 'Experience' ? 'bg-emerald-600 shadow-emerald-900/20' : 
                    selectedNode.type === 'Education' ? 'bg-yellow-600 shadow-yellow-900/20' : 
                    selectedNode.type === 'Hard Skill' ? 'bg-cyan-600 shadow-cyan-900/20' : 
                    selectedNode.type === 'Soft Skill' ? 'bg-rose-600 shadow-rose-900/20' : 
                    selectedNode.type === 'Skill' ? 'bg-cyan-600 shadow-cyan-900/20' : 
                    selectedNode.type === 'Language' ? 'bg-indigo-600 shadow-indigo-900/20' : 
                    selectedNode.type === 'Hobby' ? 'bg-pink-600 shadow-pink-900/20' : 
                    'bg-orange-600 shadow-orange-900/20'}`}
                >
                  {selectedNode.type}
                </span>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`text-slate-500 hover:text-blue-500 transition-colors p-1 ${isEditing ? 'text-blue-500' : ''}`}
                    title="Edit Node"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button 
                    onClick={() => deleteNode(selectedNode.id)}
                    className="text-slate-500 hover:text-red-500 transition-colors p-1"
                    title="Delete Node"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                  <button 
                    onClick={() => setSelectedNode(null)}
                    className="text-slate-500 hover:text-white transition-colors p-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
              
              {isEditing ? (
                <div className="space-y-4">
                  <input 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-bold"
                    value={editForm.label}
                    onChange={(e) => setEditForm({...editForm, label: e.target.value})}
                    placeholder="Node Name"
                  />
                  <select 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    value={editForm.type}
                    onChange={(e) => setEditForm({...editForm, type: e.target.value})}
                  >
                    <option value="Project">Project</option>
                    <option value="Tech">Tech</option>
                    <option value="Experience">Experience</option>
                    <option value="Skill">Skill</option>
                    <option value="Hobby">Hobby</option>
                    <option value="Concept">Concept</option>
                  </select>
                  <textarea 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 min-h-[80px]"
                    value={editForm.description}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    placeholder="Node Description..."
                  />
                  <button 
                    onClick={saveNodeEdit}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition-all shadow-lg"
                  >
                    Save Changes
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-black mb-4 tracking-tight">{selectedNode.label}</h2>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                      {selectedNode.description || "Synthesizing neural context..."}
                    </p>
                    {selectedNode.type === 'Experience' && (
                      <div className="pt-4 border-t border-slate-800">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Status</p>
                        <p className="text-xs text-emerald-400 font-bold italic">Verified Professional Entry</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Visualization Layer */}
          {nodes.length > 0 ? (
            view === "graph" ? (
              <KnowledgeGraph 
                nodes={nodes} 
                edges={edges} 
                highlightedNodes={highlightedNodes} 
                onNodeClick={setSelectedNode}
              />
            ) : (
              <HierarchyView 
                nodes={nodes} 
                edges={edges} 
                onNodeClick={setSelectedNode}
              />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-center p-12">
               <div className="space-y-4">
                  <div className="text-slate-700 animate-pulse font-black uppercase tracking-[0.5em] text-sm mb-4">
                    Waiting for neural input...
                  </div>
                  <p className="text-slate-500 text-xs max-w-xs mx-auto">
                    The network is empty. Upload a document to initialize the graph.
                  </p>
               </div>
            </div>
          )}

          {/* Stats Bar */}
          <div className="absolute top-4 right-4 z-10 flex space-x-3 pointer-events-none">
            <div className="px-5 py-2.5 bg-slate-900/80 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-slate-800 shadow-2xl backdrop-blur-md">
              Synapses: {nodes.length}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
