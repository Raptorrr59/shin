"use client";

import React, { useState } from "react";
import { Node, Edge } from "./KnowledgeGraph";

interface HierarchyViewProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (node: Node) => void;
}

const HierarchyView: React.FC<HierarchyViewProps> = ({ nodes, edges, onNodeClick }) => {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["Experience", "Project", "Skill"]);

  const toggleGroup = (type: string) => {
    setExpandedGroups(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // Identify the "Primary Person" (Candidate)
  const person = nodes.find(n => n.type === "Person" || n.id === "primary-person");

  // Group nodes by type, excluding the main person
  const groups = nodes
    .filter(n => n.id !== person?.id)
    .reduce((acc, node) => {
      const type = node.type || "default";
      if (!acc[type]) acc[type] = [];
      acc[type].push(node);
      return acc;
    }, {} as Record<string, Node[]>);

  const groupColors: Record<string, string> = {
    Project: "text-blue-400",
    Tech: "text-green-400",
    Person: "text-purple-400",
    Concept: "text-orange-400",
    Experience: "text-emerald-400",
    Education: "text-yellow-400",
    "Hard Skill": "text-cyan-400",
    "Soft Skill": "text-rose-400",
    Skill: "text-cyan-400", // Fallback
    Language: "text-indigo-400",
    Hobby: "text-pink-400",
    default: "text-slate-400",
  };

  return (
    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-md rounded-[3rem] border border-slate-800 overflow-hidden flex flex-col p-10 m-6 shadow-2xl">
      {/* Header with Primary Person */}
      <div className="mb-10 shrink-0 border-b border-slate-800 pb-8 flex items-center space-x-6">
        <div className="w-16 h-16 rounded-3xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shadow-lg shadow-blue-900/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-400"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase italic text-white leading-none mb-2">
            {person ? person.label : "Candidate Profile"}
          </h2>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Neural Career Mapping</p>
        </div>
      </div>

      {/* Grouped Categories */}
      <div className="flex-1 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent space-y-6 pb-12">
        {Object.entries(groups).sort().map(([type, groupNodes]) => (
          <div key={type} className="space-y-3">
            <button 
              onClick={() => toggleGroup(type)}
              className="flex items-center space-x-4 w-full group hover:bg-slate-800/40 p-2 rounded-2xl transition-all border border-transparent hover:border-slate-700/30"
            >
              <div className={`w-1.5 h-1.5 rounded-full bg-current ${groupColors[type] || groupColors.default} shadow-[0_0_10px_rgba(255,255,255,0.2)]`} />
              <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${groupColors[type] || groupColors.default}`}>
                {type}s
              </span>
              <div className="h-[1px] flex-1 bg-slate-800/50" />
              <span className="text-[10px] font-black text-slate-600 tabular-nums">[{groupNodes.length}]</span>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="14" height="14" 
                viewBox="0 0 24 24" fill="none" 
                stroke="currentColor" strokeWidth="4" 
                className={`text-slate-700 transition-transform duration-300 ${expandedGroups.includes(type) ? 'rotate-90' : ''}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {expandedGroups.includes(type) && (
              <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
                {groupNodes.map(node => (
                  <button 
                    key={node.id}
                    onClick={() => onNodeClick(node)}
                    className="flex flex-col items-start w-full p-4 rounded-2xl bg-slate-900/40 hover:bg-slate-800/60 transition-all text-left border border-slate-800 hover:border-blue-500/30 group/item shadow-sm hover:shadow-xl hover:shadow-blue-900/10 active:scale-[0.98]"
                  >
                    <span className="text-sm font-bold text-slate-100 group-hover/item:text-blue-400 transition-colors mb-1">{node.label}</span>
                    <span className="text-[10px] text-slate-500 font-medium line-clamp-2 leading-relaxed italic">{node.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default HierarchyView;
