"use client";

import { useState, useEffect, useRef } from "react";
import KnowledgeGraph, { Node, Edge } from "@/components/KnowledgeGraph";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Message {
  role: "user" | "ai";
  content: string;
}

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("ollama");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGraph();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    setStatus(`Ingesting ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/ingest?provider=${provider}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      await fetchGraph();
      setStatus(null);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, provider }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const data = await response.json();
      setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
      setHighlightedNodes(data.highlights || []);
    } catch (error: any) {
      setMessages((prev) => [...prev, { role: "ai", content: `Error: ${error.message}` }]);
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
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Neural Navigator</p>
          </div>
          <div className="relative group">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.md" />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-3 bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 rounded-2xl border border-blue-500/20 transition-all active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
          </div>
        </div>

        {/* AI Provider & Status */}
        <div className="px-6 py-4 space-y-3 bg-slate-900/20 border-b border-slate-800">
          <select 
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:border-slate-700 transition-all"
          >
            <option value="ollama">Provider: Local (Ollama)</option>
            <option value="openai">Provider: OpenAI</option>
            <option value="anthropic">Provider: Anthropic</option>
            <option value="google">Provider: Google</option>
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
              <p className="text-xs font-black uppercase tracking-widest">Awaiting Interface Query</p>
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

      {/* Main Content (Graph) */}
      <section className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden p-6">
        <div className="flex-1 relative">
          {/* Node Details Overlay */}
          {selectedNode && (
            <div className="absolute top-4 left-4 z-30 w-72 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-3xl p-6 shadow-2xl animate-in fade-in slide-in-from-left-4">
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white
                  ${selectedNode.type === 'Project' ? 'bg-blue-600' : 
                    selectedNode.type === 'Tech' ? 'bg-green-600' : 
                    selectedNode.type === 'Person' ? 'bg-purple-600' : 'bg-orange-600'}`}
                >
                  {selectedNode.type}
                </span>
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <h2 className="text-xl font-bold mb-2">{selectedNode.label}</h2>
              <p className="text-sm text-slate-400 leading-relaxed italic">
                {selectedNode.description || "Initializing neural context..."}
              </p>
            </div>
          )}

          {/* Stats Bar */}
          <div className="absolute top-4 right-4 z-10 flex space-x-3 pointer-events-none">
            <div className="px-4 py-2 bg-slate-900/80 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-800 shadow-2xl backdrop-blur-md">
              Nodes: {nodes.length}
            </div>
          </div>

          <KnowledgeGraph 
            nodes={nodes} 
            edges={edges} 
            highlightedNodes={highlightedNodes} 
            onNodeClick={(node) => setSelectedNode(node)}
          />
        </div>
      </section>
    </main>
  );
}
