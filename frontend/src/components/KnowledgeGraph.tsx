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
  Project: "#3b82f6", // Blue
  Tech: "#22c55e",    // Green
  Person: "#a855f7",  // Purple
  Concept: "#f97316", // Orange
  default: "#64748b", // Slate
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

    svg.call(
      d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
    );

    const simulation = d3
      .forceSimulation<Node>(nodes)
      .force(
        "link",
        d3.forceLink<Node, Edge>(edges).id((d) => d.id).distance(120)
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = g
      .append("g")
      .attr("stroke", "#334155")
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke-width", 1.5);

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
      .attr("r", (d) => (highlightedNodes.includes(d.id) ? 14 : 10))
      .attr("fill", (d) => typeColors[d.type || "default"] || typeColors.default)
      .attr("stroke", (d) => (highlightedNodes.includes(d.id) ? "#fff" : "transparent"))
      .attr("stroke-width", 2)
      .attr("class", (d) => (highlightedNodes.includes(d.id) ? "animate-pulse shadow-xl" : "shadow-md"));

    node
      .append("text")
      .text((d) => d.label)
      .attr("x", 16)
      .attr("y", 4)
      .attr("fill", "#e2e8f0")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .style("pointer-events", "none")
      .style("text-shadow", "0 0 10px rgba(0,0,0,0.8)");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as Node).x!)
        .attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!)
        .attr("y2", (d) => (d.target as Node).y!);

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
    <div className="w-full h-full bg-slate-950 overflow-hidden relative border border-slate-800 rounded-[2.5rem] shadow-2xl">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

export default KnowledgeGraph;
