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
  Skill: "#06b6d4",      // Cyan
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

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Safety Filter: Only keep edges where BOTH source and target exist in the nodes array
    const validEdges = edges.filter(edge => {
      const sourceId = typeof edge.source === "string" ? edge.source : (edge.source as any).id;
      const targetId = typeof edge.target === "string" ? edge.target : (edge.target as any).id;
      return nodes.some(n => n.id === sourceId) && nodes.some(n => n.id === targetId);
    });

    svg.call(
      d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
    );

    const simulation = d3
      .forceSimulation<Node>(nodes)
      .force(
        "link",
        d3.forceLink<Node, Edge>(validEdges).id((d) => d.id).distance(140)
      )
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = g
      .append("g")
      .attr("stroke", "#334155")
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(validEdges)
      .join("line")
      .attr("stroke-width", 1.5);

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
      .data(nodes)
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
      .attr("r", (d) => (highlightedNodes.includes(d.id) ? 16 : 12))
      .attr("fill", (d) => typeColors[d.type || "default"] || typeColors.default)
      .attr("stroke", (d) => (highlightedNodes.includes(d.id) ? "#fff" : "transparent"))
      .attr("stroke-width", 3)
      .attr("class", (d) => (highlightedNodes.includes(d.id) ? "animate-pulse shadow-2xl" : "shadow-md hover:brightness-110 transition-all"));

    node
      .append("text")
      .text((d) => d.label)
      .attr("x", 18)
      .attr("y", 4)
      .attr("fill", "#f8fafc")
      .attr("font-size", "13px")
      .attr("font-weight", "700")
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
