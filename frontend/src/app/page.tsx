"use client";

import { useState, useEffect, useRef } from "react";
import KnowledgeGraph, { Node, Edge } from "@/components/KnowledgeGraph";
import HierarchyView from "@/components/HierarchyView";
import { useAuthStore } from "@/store/useAuthStore";

const API_URL = "http://localhost:8000";

interface Suggestion {
  type: "add_node" | "add_edge";
  data: any;
  status?: "pending" | "approved" | "rejected";
}

interface Message {
  role: "user" | "ai";
  content: string;
  suggestions?: Suggestion[];
}

export default function Home() {
  const { token, user, setAuth, logout, isAuthenticated } = useAuthStore();
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
  
  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (isAuthenticated() && token) {
      fetchGraph();
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//localhost:8000/ws/${token}`;
      const socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          setStatus(data.message);
        } else if (data.type === 'update') {
          setStatus(null);
          fetchGraph();
          setMessages(prev => [...prev, { role: "ai", content: `System Update: ${data.message} (${data.nodes_added} new synapses mapped).` }]);
        } else if (data.type === 'error') {
          setStatus(null);
          setMessages(prev => [...prev, { role: "ai", content: `Neural Error: ${data.message}` }]);
        }
      };

      socketRef.current = socket;
      return () => { socket.close(); };
    }
  }, [token]);

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
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/graph`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.status === 401) { logout(); return; }
      const data = await response.json();
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (error) {
      console.error("Failed to fetch graph:", error);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = isRegistering ? "register" : "token";
    try {
      let body;
      let headers: Record<string, string> = {};
      if (isRegistering) {
        body = JSON.stringify({ username, password });
        headers["Content-Type"] = "application/json";
      } else {
        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);
        body = formData;
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
      const response = await fetch(`${API_URL}/${endpoint}`, { method: "POST", headers, body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Authentication failed");
      const profileRes = await fetch(`${API_URL}/users/me`, { headers: { "Authorization": `Bearer ${data.access_token}` } });
      const profile = await profileRes.json();
      setAuth(data.access_token, profile);
      setUsername(""); setPassword("");
    } catch (error: any) { setAuthError(error.message); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setIsUploading(true);
    setStatus(`Analyzing ${file.name}...`);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`${API_URL}/ingest?provider=${provider}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) throw new Error("Analysis failed");
      await fetchGraph();
      setStatus(null);
    } catch (error: any) { setStatus(`Error: ${error.message}`); } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleApproveSuggestion = async (msgIndex: number, suggestionIndex: number) => {
    const suggestion = messages[msgIndex].suggestions?.[suggestionIndex];
    if (!suggestion || !token) return;
    try {
      const endpoint = suggestion.type === "add_node" ? "nodes" : "edges";
      const response = await fetch(`${API_URL}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(suggestion.data),
      });
      if (!response.ok) throw new Error("Failed to apply suggestion");
      const newMessages = [...messages];
      if (newMessages[msgIndex].suggestions) {
        newMessages[msgIndex].suggestions![suggestionIndex].status = "approved";
        setMessages(newMessages);
      }
      await fetchGraph();
    } catch (error: any) { alert(`Error: ${error.message}`); }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isChatting || !token) return;
    const userMsg = inputMessage;
    setInputMessage("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatting(true);
    try {
      if (userMsg.toLowerCase().startsWith("/add ")) {
        const prompt = userMsg.substring(5);
        const response = await fetch(`${API_URL}/ai-add-node`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ prompt, provider }),
        });
        if (!response.ok) throw new Error("Failed to add node via AI");
        const data = await response.json();
        setMessages((prev) => [...prev, { role: "ai", content: `Neural link established: Node **${data.node.label}** (${data.node.type}) added successfully.` }]);
        await fetchGraph();
      } else {
        const response = await fetch(`${API_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ message: userMsg, provider }),
        });
        if (!response.ok) throw new Error("Interface connection lost");
        const data = await response.json();
        setMessages((prev) => [...prev, { 
          role: "ai", content: data.answer,
          suggestions: data.suggestions?.map((s: any) => ({ ...s, status: "pending" }))
        }]);
        setHighlightedNodes(data.highlights || []);
      }
    } catch (error: any) { setMessages((prev) => [...prev, { role: "ai", content: `ERR: ${error.message}` }]); } finally { setIsChatting(false); }
  };

  const saveNodeEdit = async () => {
    if (!selectedNode || !token) return;
    try {
      const response = await fetch(`${API_URL}/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      if (response.ok) { await fetchGraph(); setIsEditing(false); }
    } catch (error) { console.error("Failed to update node:", error); }
  };

  const deleteNode = async (nodeId: string) => {
    if (!confirm("Delete node and connections?") || !token) return;
    try {
      const response = await fetch(`${API_URL}/nodes/${nodeId}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
      if (response.ok) { setSelectedNode(null); await fetchGraph(); }
    } catch (error) { console.error("Failed to delete node:", error); }
  };

  const renderMessageContent = (msg: Message, msgIndex: number) => {
    const parts = msg.content.split(/(\[Source:.*?Page:.*?\])/g);
    return (
      <div className="space-y-4">
        <div>
          {parts.map((part, i) => (
            part.startsWith("[Source:") && part.endsWith("]") ? (
              <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 bg-blue-500/20 border border-blue-500/30 text-[10px] font-black uppercase tracking-tighter rounded-md text-blue-400 align-middle">
                {part}
              </span>
            ) : part
          ))}
        </div>
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Neural Expansion Proposals</p>
            {msg.suggestions.map((s, si) => (
              <div key={si} className={`p-3 rounded-xl border ${s.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-950 border-slate-800'} transition-all`}>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">
                    {s.type === 'add_node' ? `New ${s.data.type}` : 'New Relationship'}
                  </span>
                  {s.status === 'approved' && <span className="text-[9px] font-black uppercase text-emerald-400">Approved</span>}
                </div>
                <p className="text-xs font-bold mb-1">{s.type === 'add_node' ? s.data.label : `${s.data.source} → ${s.data.target}`}</p>
                {s.type === 'add_edge' && <p className="text-[10px] text-slate-500 italic mb-2">Relationship: {s.data.label}</p>}
                {s.status === 'pending' && (
                  <div className="flex space-x-2 mt-2">
                    <button onClick={() => handleApproveSuggestion(msgIndex, si)} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase rounded-lg transition-all">Integrate</button>
                    <button onClick={() => { const nm = [...messages]; nm[msgIndex].suggestions![si].status = "rejected"; setMessages(nm); }} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-black uppercase rounded-lg transition-all">Ignore</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!isAuthenticated()) {
    return (
      <main className="flex h-screen w-screen bg-slate-950 items-center justify-center font-sans">
        <div className="w-96 bg-slate-900/50 backdrop-blur-3xl border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black tracking-tighter text-blue-500 italic mb-2">SHIN (真)</h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">
              {isRegistering ? "Initialize New Operator" : "Knowledge Navigator"}
            </p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-4">Identifier</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-4">Access Key</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" required />
            </div>
            
            {isRegistering && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-4">Verify Key</label>
                <input type="password" placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" required />
              </div>
            )}

            {authError && <p className="text-[10px] text-red-500 font-black uppercase text-center">{authError}</p>}
            <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-blue-900/20 active:scale-95">
              {isRegistering ? "Authorize Operator" : "Establish Link"}
            </button>
          </form>
          <button onClick={() => setIsRegistering(!isRegistering)} className="w-full mt-6 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-500 transition-colors">{isRegistering ? "Back to Secure Login" : "No Profile? Create One"}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <aside className="w-[400px] border-r border-slate-800 flex flex-col bg-slate-950/50 backdrop-blur-xl shadow-2xl z-20">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div><h1 className="text-2xl font-black tracking-tighter text-blue-500 italic">SHIN (真)</h1><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Knowledge Navigator</p></div>
          <div className="flex space-x-2">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.md,.pdf" />
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-3 bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 rounded-2xl border border-blue-500/20 transition-all active:scale-95"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
            <button onClick={async () => { if (confirm("Wipe graph?")) { await fetch(`${API_URL}/graph`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } }); fetchGraph(); } }} className="p-3 bg-red-600/10 text-red-500 hover:bg-red-600/20 rounded-2xl border border-red-500/20 transition-all active:scale-95"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          </div>
        </div>
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/20">
           <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black uppercase">{user?.username.substring(0, 2)}</div>
              <div><p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Operator</p><p className="text-xs font-bold text-slate-200">{user?.username}</p></div>
           </div>
           <button onClick={logout} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors">Disconnect</button>
        </div>
        <div className="px-6 py-4 flex space-x-2 border-b border-slate-800 bg-slate-900/10">
          <button onClick={() => setView("graph")} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'graph' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-900 text-slate-500 hover:bg-slate-800'}`}>Neural Map</button>
          <button onClick={() => setView("tree")} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'tree' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-900 text-slate-500 hover:bg-slate-800'}`}>Hierarchy</button>
        </div>
        <div className="px-6 py-4 space-y-3 bg-slate-900/20 border-b border-slate-800">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:border-slate-700 transition-all">
            <option value="openai">Core: OpenAI (GPT-4o)</option><option value="ollama">Core: Local (Qwen 2.5)</option><option value="anthropic">Core: Anthropic (Claude)</option><option value="google">Core: Google (Gemini)</option>
          </select>
          {status && <div className="text-[10px] font-black uppercase tracking-tighter text-blue-400 animate-pulse">{status}</div>}
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {messages.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30"><div className="w-12 h-12 rounded-full border-2 border-slate-700 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><p className="text-xs font-black uppercase tracking-widest">Awaiting Neural Query</p></div>}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-xl ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none font-medium" : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"}`}>
                {renderMessageContent(msg, i)}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-6 border-t border-slate-800">
          <form onSubmit={handleSendMessage} className="relative">
            <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} placeholder="Query the map..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-4 pr-12 py-4 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-slate-600" />
            <button type="submit" disabled={isChatting || !inputMessage.trim()} className="absolute right-2 top-2 bottom-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl transition-all active:scale-95">{isChatting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}</button>
          </form>
        </div>
      </aside>
      <section className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden p-6">
        <div className="flex-1 relative">
          {selectedNode && (
            <div className="absolute top-4 left-4 z-30 w-80 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-[2rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-left-4 border-t-blue-500/20">
              <div className="flex justify-between items-start mb-6">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg ${selectedNode.type === 'Project' ? 'bg-blue-600 shadow-blue-900/20' : selectedNode.type === 'Tech' ? 'bg-green-600 shadow-green-900/20' : selectedNode.type === 'Person' ? 'bg-purple-600 shadow-purple-900/20' : 'bg-orange-600 shadow-orange-900/20'}`}>{selectedNode.type}</span>
                <div className="flex space-x-2">
                  <button onClick={() => setIsEditing(!isEditing)} className={`text-slate-500 hover:text-blue-500 transition-colors p-1 ${isEditing ? 'text-blue-500' : ''}`}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                  <button onClick={() => deleteNode(selectedNode.id)} className="text-slate-500 hover:text-red-500 transition-colors p-1"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                  <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white transition-colors p-1"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
              </div>
              {isEditing ? (
                <div className="space-y-4">
                  <input className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-bold" value={editForm.label} onChange={(e) => setEditForm({...editForm, label: e.target.value})} placeholder="Node Name" />
                  <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 min-h-[80px]" value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} placeholder="Description..." />
                  <button onClick={saveNodeEdit} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition-all shadow-lg">Save Changes</button>
                </div>
              ) : (
                <><h2 className="text-2xl font-black mb-4 tracking-tight">{selectedNode.label}</h2><p className="text-sm text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">{selectedNode.description || "Synthesizing neural context..."}</p></>
              )}
            </div>
          )}
          {nodes.length > 0 ? (
            view === "graph" ? <KnowledgeGraph nodes={nodes} edges={edges} focusedNodeId={selectedNode?.id} highlightedNodes={highlightedNodes} onNodeClick={setSelectedNode} /> : <HierarchyView nodes={nodes} edges={edges} onNodeClick={setSelectedNode} />
          ) : <div className="absolute inset-0 flex items-center justify-center text-center p-12"><div className="space-y-4"><div className="text-slate-700 animate-pulse font-black uppercase tracking-[0.5em] text-sm mb-4">Waiting for neural input...</div><p className="text-slate-500 text-xs max-w-xs mx-auto">The network is empty. Upload a document to initialize the graph.</p></div></div>}
          <div className="absolute top-4 right-4 z-10 flex space-x-3 pointer-events-none"><div className="px-5 py-2.5 bg-slate-900/80 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-slate-800 shadow-2xl backdrop-blur-md">Synapses: {nodes.length}</div></div>
        </div>
      </section>
    </main>
  );
}
