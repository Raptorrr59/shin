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
}

interface KnowledgeGraphProps {
  nodes: Node[];
  edges: Edge[];
  highlightedNodes?: string[];
  onNodeClick?: (node: Node) => void;
}

const typeColors: Record<string, string> = {
  Project: "#3b82f6",    // Blue
  Tech: "#22c55e",       // Green
  Person: "#a855f7",     // Purple
  Concept: "#f97316",    // Orange
  Experience: "#10b981", // Emerald/Teal
  Education: "#eab308",  // Yellow/Gold
  "Hard Skill": "#06b6d4", // Cyan
  "Soft Skill": "#f43f5e", // Rose
  Skill: "#06b6d4",      // Cyan (Fallback)
  Language: "#4f46e5",   // Indigo
  Hobby: "#ec4899",      // Pink
  default: "#64748b",    // Slate
};

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ 
  nodes, 
  edges, 
  highlightedNodes = [],
  onNodeClick 
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    // --- CLUSTERING LOGIC ---
    // 1. Identify the candidate node
    const candidateNode = nodes.find((n) => n.id === "candidate" || n.type === "Person");
    
    let displayNodes = [...nodes];
    let displayEdges = [...edges];

    if (candidateNode) {
      // 2. Find all unique types (excluding Person/Candidate itself)
      const types = Array.from(new Set(nodes.filter(n => n.id !== candidateNode.id).map(n => n.type || "default")));
      
      // 3. Create a cluster node for each type
      const clusterNodes: Node[] = types.map(type => ({
        id: `cluster-${type}`,
        label: `${type}s`,
        type: "Cluster", // Special type for rendering
        description: `Group of all ${type}s`,
        // Start them slightly offset from center to help physics
        x: candidateNode.x! + (Math.random() - 0.5) * 50,
        y: candidateNode.y! + (Math.random() - 0.5) * 50,
      }));

      displayNodes = [...nodes, ...clusterNodes];

      // 4. Rewire edges
      displayEdges = [];
      
      // Link candidate to clusters
      types.forEach(type => {
        displayEdges.push({
          source: candidateNode.id,
          target: `cluster-${type}`,
          label: `has_${type.toLowerCase()}`
        });
      });

      // Link actual nodes to their respective clusters (or keep original edge if it doesn't involve candidate)
      edges.forEach(edge => {
        const sourceId = typeof edge.source === "string" ? edge.source : (edge.source as any).id;
        const targetId = typeof edge.target === "string" ? edge.target : (edge.target as any).id;
        
        if (sourceId === candidateNode.id) {
          // This edge originally went from Candidate -> Node.
          // Rewire it to go from Cluster -> Node.
          const targetNode = nodes.find(n => n.id === targetId);
          if (targetNode) {
            displayEdges.push({
              source: `cluster-${targetNode.type || "default"}`,
              target: targetId,
              label: edge.label
            });
          }
        } else if (targetId === candidateNode.id) {
           // Node -> Candidate (rare but possible)
           const sourceNode = nodes.find(n => n.id === sourceId);
           if (sourceNode) {
            displayEdges.push({
              source: sourceId,
              target: `cluster-${sourceNode.type || "default"}`,
              label: edge.label
            });
           }
        } else {
          // Edge between two regular nodes (keep as is)
          displayEdges.push(edge);
        }
      });
    }

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Safety Filter
    const validEdges = displayEdges.filter(edge => {
      const sourceId = typeof edge.source === "string" ? edge.source : (edge.source as any).id;
      const targetId = typeof edge.target === "string" ? edge.target : (edge.target as any).id;
      
      // An edge is valid if both its source and target are in the displayNodes array
      return displayNodes.some(n => n.id === sourceId) && displayNodes.some(n => n.id === targetId);
    });

    svg.call(
      d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
    );

    const simulation = d3
      .forceSimulation<Node>(displayNodes)
      .force(
        "link",
        d3.forceLink<Node, Edge>(validEdges)
          .id((d) => d.id)
          .distance((d) => {
             // Clusters stay closer to the candidate, items spread out further
             const sourceNode = displayNodes.find(n => n.id === (typeof d.source === 'string' ? d.source : (d.source as any).id));
             if (sourceNode?.id === candidateNode?.id) return 100;
             return 160;
          })
      )
      .force("charge", d3.forceManyBody().strength((d) => (d.type === 'Cluster' ? -800 : -400)))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    const link = g
      .append("g")
      .attr("stroke", "#334155")
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(validEdges)
      .join("line")
      .attr("stroke-dasharray", (d) => {
         const sourceNode = displayNodes.find(n => n.id === (typeof d.source === 'string' ? d.source : (d.source as any).id));
         return sourceNode?.id === candidateNode?.id ? "5,5" : "none"; // Dashed lines for Candidate->Cluster
      })
      .attr("stroke-width", (d) => {
         const sourceNode = displayNodes.find(n => n.id === (typeof d.source === 'string' ? d.source : (d.source as any).id));
         return sourceNode?.id === candidateNode?.id ? 2.5 : 1.5; // Thicker lines for Candidate->Cluster
      });

    const edgeLabel = g
      .append("g")
      .selectAll("text")
      .data(validEdges)
      .join("text")
      .text((d) => d.label || "")
      .attr("fill", "#64748b")
      .attr("font-size", "9px")
      .attr("font-style", "italic")
      .attr("text-anchor", "middle")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 2px rgba(0,0,0,0.8)");

    const node = g
      .append("g")
      .selectAll("g")
      .data(displayNodes)
      .join("g")
      .attr("class", "cursor-pointer")
      .on("click", (event, d) => {
        if (d.type !== "Cluster" && onNodeClick) onNodeClick(d);
      })
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    node
      .append("circle")
      .attr("r", (d) => {
        if (d.type === "Cluster") return 8;
        if (d.id === candidateNode?.id) return 20;
        return highlightedNodes.includes(d.id) ? 16 : 12;
      })
      .attr("fill", (d) => {
        if (d.type === "Cluster") return "transparent";
        return typeColors[d.type || "default"] || typeColors.default;
      })
      .attr("stroke", (d) => {
        if (d.type === "Cluster") return "#475569";
        return highlightedNodes.includes(d.id) ? "#fff" : "transparent";
      })
      .attr("stroke-width", (d) => d.type === "Cluster" ? 2 : 3)
      .attr("class", (d) => {
        if (d.type === "Cluster") return "";
        return highlightedNodes.includes(d.id) ? "animate-pulse shadow-2xl" : "shadow-md hover:brightness-110 transition-all";
      });

    node
      .append("text")
      .text((d) => d.label)
      .attr("x", (d) => {
         if (d.id === candidateNode?.id) return 26;
         if (d.type === "Cluster") return 12;
         return 18;
      })
      .attr("y", 4)
      .attr("fill", (d) => d.type === "Cluster" ? "#cbd5e1" : "#f8fafc")
      .attr("font-size", (d) => {
        if (d.id === candidateNode?.id) return "16px";
        if (d.type === "Cluster") return "10px";
        return "13px";
      })
      .attr("font-weight", (d) => d.type === "Cluster" ? "500" : "700")
      .attr("text-transform", (d) => d.type === "Cluster" ? "uppercase" : "none")
      .attr("letter-spacing", (d) => d.type === "Cluster" ? "0.1em" : "normal")
      .style("pointer-events", "none")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,0.5)");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as Node).x!)
        .attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!)
        .attr("y2", (d) => (d.target as Node).y!);

      edgeLabel
        .attr("x", (d) => ((d.source as Node).x! + (d.target as Node).x!) / 2)
        .attr("y", (d) => ((d.source as Node).y! + (d.target as Node).y!) / 2 - 4);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, highlightedNodes, onNodeClick]);

  return (
    <div className="w-full h-full bg-slate-950 overflow-hidden relative border border-slate-800 rounded-[3rem] shadow-2xl group">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

export default KnowledgeGraph;
