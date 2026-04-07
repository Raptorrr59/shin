"use client";

import React, { useEffect, useState } from "react";
import { FileText, Trash2, Calendar, Clock, Database } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

interface Document {
  id: number;
  filename: string;
  upload_date: string;
}

interface DocumentLibraryProps {
  onRefreshGraph: () => void;
}

const API_URL = "http://localhost:8000";

const DocumentLibrary: React.FC<DocumentLibraryProps> = ({ onRefreshGraph }) => {
  const { token } = useAuthStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDocuments = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/documents`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteDocument = async (id: number) => {
    if (!confirm("Are you sure you want to delete this document? This will also remove unique graph nodes and embeddings associated with it.")) return;
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/documents/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        setDocuments(documents.filter(doc => doc.id !== id));
        onRefreshGraph();
      }
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [token]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
      <div className="flex items-center space-x-3 mb-2">
        <div className="p-2 bg-blue-600/10 rounded-lg">
          <Database size={18} className="text-blue-500" />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Neural Archive</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase">Managed Provenance</p>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-30">
          <FileText size={48} className="text-slate-700" />
          <p className="text-xs font-black uppercase tracking-widest">Archive Empty</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="group relative bg-slate-900/50 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 group-hover:border-blue-500/30 transition-colors">
                    <FileText size={20} className="text-slate-400 group-hover:text-blue-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-200 truncate max-w-[200px]">{doc.filename}</h3>
                    <div className="flex items-center space-x-3 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                      <span className="flex items-center">
                        <Calendar size={10} className="mr-1" />
                        {new Date(doc.upload_date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center">
                        <Clock size={10} className="mr-1" />
                        {new Date(doc.upload_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => deleteDocument(doc.id)}
                  className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all active:scale-95"
                  title="Expunge Document"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentLibrary;
