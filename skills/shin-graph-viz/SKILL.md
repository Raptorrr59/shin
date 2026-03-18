---
name: shin-graph-viz
description: Knowledge Graph Navigator frontend logic using D3.js and React Flow. Use when building interactive graph components, handling physics-based layouts, or implementing visual state synchronization.
---

# Shin Graph Visualization

This skill focuses on the interactive "living map" of the user's data.

## 1. Graph Layout (D3.js)

- **Layout Strategy**: Force-Directed (repelling nodes, attractive edges).
- **Optimization**: For large graphs (500+ nodes), use `d3-force` with `alpha` cooling and manual collision detection to prevent node overlap.

### Node Physics:
- **ManyBody**: Repulsive force to keep nodes apart.
- **Link**: Spring-like force between connected nodes.
- **Center**: Pull nodes towards the center of the viewport.

## 2. Interaction Patterns (React Flow)

### Bi-directional Sync
- **Graph -> UI**: Clicking a node selects it and opens a detail panel (NodeCard).
- **UI -> Graph**: Highlighting a term in the AI chat should highlight the corresponding node and its outgoing edges.

### Visual States:
- **Active**: Primary color (Indigo), glow effect.
- **Neighbor**: Highlighted color (Emerald), reduced opacity for other nodes.
- **Inactive**: Dimmed (Slate-700/800).

## 3. Performance & Rendering

- **Incremental Updates**: When new documents are uploaded, use `requestAnimationFrame` to animate new nodes spawning from their source entity rather than a full graph re-render.
- **Canvas vs SVG**: 
  - Use **SVG** for the main interactive graph (easier event handling, better styling).
  - Use **Canvas** only if node count exceeds 1,000 for specific high-density views.
- **State Management**: Sync graph state (zoom, focus, selection) via **Zustand** to ensure the SidePanel and MainCanvas are always aligned.
