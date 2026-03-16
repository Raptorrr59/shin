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

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // --- GENERALIZED CLUSTERING LOGIC ---
    // 1. Identify the primary "Person" node (the center)
    const personNode = nodes.find(n => n.type === "Person" || n.id === "candidate");
    
    // 2. Find all unique types that have MORE THAN ONE node (to avoid tiny clusters)
    const allTypes = nodes.filter(n => n.id !== personNode?.id).map(n => n.type || "default");
    const typeCounts = allTypes.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const clusterableTypes = Object.keys(typeCounts).filter(t => typeCounts[t] > 1);
    
    // 3. Create a "Cluster Hub" node for each clusterable type
    const clusterHubs: Node[] = clusterableTypes.map(type => ({
      id: `cluster-${type}`,
      label: `${type}s`,
      type: "Cluster",
      description: `Group for all ${type} entities`,
      // Distribute hubs in a circle to avoid overlap
      x: width / 2 + Math.cos(clusterableTypes.indexOf(type) / clusterableTypes.length * 2 * Math.PI) * 200,
      y: height / 2 + Math.sin(clusterableTypes.indexOf(type) / clusterableTypes.length * 2 * Math.PI) * 200,
    }));

    const displayNodes = [...nodes, ...clusterHubs];
    let displayEdges: Edge[] = [];

    // 4. Link Person to Cluster Hubs
    if (personNode) {
      clusterHubs.forEach(hub => {
        displayEdges.push({
          source: personNode.id,
          target: hub.id,
          label: "contains"
        });
      });
    }

    // 5. Link every node to its corresponding Cluster Hub IF IT HAS ONE
    nodes.forEach(node => {
      if (node.id === personNode?.id) return;

      const type = node.type || "default";
      if (clusterableTypes.includes(type)) {
        displayEdges.push({
          source: `cluster-${type}`,
          target: node.id,
          label: "member_of"
        });
      } else if (personNode) {
        // If no cluster, link directly to person so it's not an orphan
        displayEdges.push({
          source: personNode.id,
          target: node.id,
          label: "related_to"
        });
      }
    });

    // 6. Include original edges ONLY if they are NOT between Person and a node (handled by hubs)
    edges.forEach(edge => {
      const sourceId = typeof edge.source === "string" ? edge.source : (edge.source as any).id;
      const targetId = typeof edge.target === "string" ? edge.target : (edge.target as any).id;
      
      const involvesPerson = sourceId === personNode?.id || targetId === personNode?.id;
      
      if (!involvesPerson) {
        displayEdges.push(edge);
      }
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Safety Filter
    const validEdges = displayEdges.filter(edge => {
      const sourceId = typeof edge.source === "string" ? edge.source : (edge.source as any).id;
      const targetId = typeof edge.target === "string" ? edge.target : (edge.target as any).id;
      
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
         // Person to Hub: Medium
         if (d.label === "contains") return 120;
         // Hub to Node: Short
         if (d.label === "member_of") return 60;
         // Semantic Link: Long
         return 200;
      })
  )
  .force("charge", d3.forceManyBody().strength((d) => (d.type === 'Cluster' ? -1000 : -400)))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .force("collide", d3.forceCollide().radius((d) => (d.type === 'Cluster' ? 60 : 40)));

const link = g
  .append("g")
  .attr("stroke", "#475569")
  .attr("stroke-opacity", 0.6)
  .selectAll("line")
  .data(validEdges)
  .join("line")
  .attr("stroke-dasharray", (d) => (d.label === "member_of" || d.label === "contains") ? "5,5" : "none")
  .attr("stroke-width", (d) => d.label === "contains" ? 2.5 : (d.label === "member_of" ? 1 : 2));

const edgeLabel = g
  .append("g")
  .selectAll("text")
  .data(validEdges)
  .join("text")
  .text((d) => (d.label === "member_of" || d.label === "contains") ? "" : (d.label || ""))

      .attr("fill", "#94a3b8")
      .attr("font-size", "10px")
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
        if (onNodeClick) onNodeClick(d);
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
        if (d.type === "Cluster") return 10;
        return highlightedNodes.includes(d.id) ? 18 : 14;
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
        return highlightedNodes.includes(d.id) ? "animate-pulse" : "hover:brightness-110 transition-all";
      });

    node
      .append("text")
      .text((d) => d.label)
      .attr("x", (d) => d.type === "Cluster" ? 14 : 20)
      .attr("y", 4)
      .attr("fill", (d) => d.type === "Cluster" ? "#64748b" : "#f8fafc")
      .attr("font-size", (d) => d.type === "Cluster" ? "11px" : "14px")
      .attr("font-weight", (d) => d.type === "Cluster" ? "500" : "700")
      .attr("text-transform", (d) => d.type === "Cluster" ? "uppercase" : "none")
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
        .attr("y", (d) => ((d.source as Node).y! + (d.target as Node).y!) / 2 - 5);

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
