"use client";

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type?: string;
  description?: string;
}

export interface Edge extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  label?: string;
  description?: string;
}

interface KnowledgeGraphProps {
  nodes: Node[];
  edges: Edge[];
  primarySubjectId?: string; 
  focusedNodeId?: string | null;
  highlightedNodes?: string[];
  onNodeClick?: (node: Node) => void;
}

const typeColors: Record<string, string> = {
  Project: "#3b82f6",    // Blue
  Tech: "#22c55e",       // Green
  Technology: "#22c55e",  // Green
  Person: "#a855f7",     // Purple
  Concept: "#f97316",    // Orange
  Organization: "#10b981", // Emerald
  Experience: "#10b981", // Emerald/Teal
  Education: "#eab308",  // Yellow/Gold
  Skill: "#06b6d4",      // Cyan
  "Hard Skill": "#06b6d4", // Cyan
  "Soft Skill": "#f43f5e", // Rose
  Language: "#4f46e5",   // Indigo
  Hobby: "#ec4899",      // Pink
  Location: "#ef4444",   // Red
  Cluster: "transparent",
  default: "#64748b",    // Slate
};

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ 
  nodes, 
  edges, 
  primarySubjectId,
  focusedNodeId,
  highlightedNodes = [],
  onNodeClick 
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // --- GENERALIZED CLUSTERING LOGIC ---
    
    // 1. Identify Central Node (Priority: prop > "candidate" > first node)
    const centralNode = nodes.find(n => n.id === primarySubjectId) || 
                        nodes.find(n => n.id === "candidate") || 
                        nodes[0];
    
    // 2. Map nodes to their types
    const types = Array.from(new Set(nodes.map(n => n.type || "Concept")));
    
    // 3. Create Cluster Hubs
    const clusterHubs: Node[] = types.map((type, i) => ({
      id: `cluster-${type}`,
      label: type,
      type: "Cluster",
      description: `Hub for ${type}s`,
      // Position hubs in a wide circle
      x: width / 2 + Math.cos(i / types.length * 2 * Math.PI) * 250,
      y: height / 2 + Math.sin(i / types.length * 2 * Math.PI) * 250,
    }));

    const displayNodes = [...nodes, ...clusterHubs];
    let displayEdges: Edge[] = [];

    // 4. Connect every node to its Type Hub
    nodes.forEach(node => {
      const type = node.type || "Concept";
      displayEdges.push({
        source: `cluster-${type}`,
        target: node.id,
        label: "type_of"
      });
    });

    // 5. Connect Central Node to all Cluster Hubs (to pull everything together)
    if (centralNode) {
      clusterHubs.forEach(hub => {
        displayEdges.push({
          source: centralNode.id,
          target: hub.id,
          label: "central_link"
        });
      });
    }

    // 6. Include original semantic edges from data
    edges.forEach(edge => {
      displayEdges.push(edge);
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const g = svg.append("g");

    // Filter valid edges
    const validEdges = displayEdges.filter(edge => {
      const sourceId = typeof edge.source === "string" ? edge.source : (edge.source as any).id;
      const targetId = typeof edge.target === "string" ? edge.target : (edge.target as any).id;
      return displayNodes.some(n => n.id === sourceId) && displayNodes.some(n => n.id === targetId);
    });

    svg.call(d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => { g.attr("transform", event.transform); }));

    const simulation = d3
      .forceSimulation<Node>(displayNodes)
      .alphaDecay(nodes.length > 500 ? 0.05 : 0.0228)
      .force("link", d3.forceLink<Node, Edge>(validEdges).id(d => d.id).distance(d => {
         if (d.label === "central_link") return 150;
         if (d.label === "type_of") return 50;
         return 120;
      }))
      .force("charge", d3.forceManyBody().strength(d => (d.type === 'Cluster' ? -800 : -300)).theta(0.9))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => (d.type === 'Cluster' ? 50 : 35)));

    const relatedIds = new Set<string>();
    if (focusedNodeId) {
      relatedIds.add(focusedNodeId);
      validEdges.forEach(e => {
        const s = typeof e.source === "string" ? e.source : (e.source as any).id;
        const t = typeof e.target === "string" ? e.target : (e.target as any).id;
        if (s === focusedNodeId) relatedIds.add(t);
        if (t === focusedNodeId) relatedIds.add(s);
      });
    }

    const link = g.append("g")
      .attr("stroke", "#334155")
      .selectAll("line")
      .data(validEdges)
      .join("line")
      .attr("stroke-opacity", d => {
        if (!focusedNodeId) return 0.4;
        const s = typeof d.source === "string" ? d.source : (d.source as any).id;
        const t = typeof d.target === "string" ? d.target : (d.target as any).id;
        return (s === focusedNodeId || t === focusedNodeId) ? 0.8 : 0.05;
      })
      .attr("stroke-dasharray", d => (d.label === "type_of" || d.label === "central_link") ? "4,4" : "none")
      .attr("stroke-width", d => (d.label === "central_link" ? 1.5 : (d.label === "type_of" ? 0.8 : 2)));

    link.append("title").text(d => d.description || d.label || "");

    const edgeLabel = g.append("g")
      .selectAll("text")
      .data(validEdges)
      .join("text")
      .text(d => (d.label === "type_of" || d.label === "central_link") ? "" : (d.label || ""))
      .attr("fill", "#64748b")
      .attr("font-size", "9px")
      .attr("text-anchor", "middle")
      .attr("opacity", d => {
        if (!focusedNodeId) return 1;
        const s = typeof d.source === "string" ? d.source : (d.source as any).id;
        const t = typeof d.target === "string" ? d.target : (d.target as any).id;
        return (s === focusedNodeId || t === focusedNodeId) ? 1 : 0.1;
      })
      .style("pointer-events", "auto") // Enable hover for title
      .style("cursor", "help");

    edgeLabel.append("title").text(d => d.description || d.label || "");

    const node = g.append("g")
      .selectAll("g")
      .data(displayNodes)
      .join("g")
      .attr("class", "cursor-pointer")
      .attr("opacity", d => {
        if (!focusedNodeId || d.type === 'Cluster') return 1;
        return relatedIds.has(d.id) ? 1 : 0.1;
      })
      .on("click", (event, d) => { if (onNodeClick) onNodeClick(d); })
      .call(d3.drag<SVGGElement, Node>()
        .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    node.append("circle")
      .attr("r", d => d.type === "Cluster" ? 8 : (highlightedNodes.includes(d.id) ? 18 : 12))
      .attr("fill", d => typeColors[d.type || "default"] || typeColors.default)
      .attr("stroke", d => d.type === "Cluster" ? "#475569" : (highlightedNodes.includes(d.id) ? "#fff" : "transparent"))
      .attr("stroke-width", d => d.type === "Cluster" ? 1.5 : 3)
      .attr("class", d => highlightedNodes.includes(d.id) ? "animate-pulse" : "hover:brightness-110 transition-all");

    node.append("text")
      .text(d => d.label)
      .attr("x", d => d.type === "Cluster" ? 12 : 18)
      .attr("y", 4)
      .attr("fill", d => d.type === "Cluster" ? "#475569" : "#f8fafc")
      .attr("font-size", d => d.type === "Cluster" ? "10px" : "13px")
      .attr("font-weight", d => d.type === "Cluster" ? "600" : "700")
      .attr("text-transform", d => d.type === "Cluster" ? "uppercase" : "none")
      .style("pointer-events", "none")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,0.5)");

    let ticks = 0;
    simulation.on("tick", () => {
      ticks++;
      if (nodes.length > 500 && ticks > 300) {
        simulation.stop();
      }
      link.attr("x1", d => (d.source as Node).x!).attr("y1", d => (d.source as Node).y!).attr("x2", d => (d.target as Node).x!).attr("y2", d => (d.target as Node).y!);
      edgeLabel.attr("x", d => ((d.source as Node).x! + (d.target as Node).x!) / 2).attr("y", d => ((d.source as Node).y! + (d.target as Node).y!) / 2 - 5);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [nodes, edges, highlightedNodes, onNodeClick, primarySubjectId, focusedNodeId]);

  return (
    <div className="w-full h-full bg-slate-950 overflow-hidden relative border border-slate-800 rounded-[3rem] shadow-2xl group">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

export default KnowledgeGraph;
