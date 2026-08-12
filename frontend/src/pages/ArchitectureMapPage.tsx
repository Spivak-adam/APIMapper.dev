import { useCallback, useMemo, useState } from "react";

import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
} from "@xyflow/react";

import type { Edge, Node, OnEdgesChange, OnNodesChange } from "@xyflow/react";

import { ArrowLeft, FileCode2, Network, Search, X } from "lucide-react";

import { useNavigate } from "react-router-dom";

import type { AnalysisResult, Endpoint } from "../types";

import logo from "../assets/logo.png";

import "@xyflow/react/dist/style.css";

type ArchitectureNodeCategory =
  | "file"
  | "endpoint"
  | "middleware"
  | "controller"
  | "database";

type ArchitectureNodeData = {
  label: string;
  nodeType: ArchitectureNodeCategory;

  filePath?: string;

  method?: string;
  route?: string;

  connectionCount?: number;
};

type ArchitectureNode = Node<ArchitectureNodeData>;

type ArchitectureEdge = Edge;

type ArchitectureGraph = {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
};

const STORAGE_KEY = "apiMapperAnalysis";

function loadStoredAnalysis(): AnalysisResult | null {
  try {
    const storedAnalysis = sessionStorage.getItem(STORAGE_KEY);

    if (!storedAnalysis) {
      return null;
    }

    const parsedAnalysis = JSON.parse(storedAnalysis) as AnalysisResult;

    if (!Array.isArray(parsedAnalysis.endpoints)) {
      return null;
    }

    return parsedAnalysis;
  } catch {
    return null;
  }
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Returns a stable identity for an
 * endpoint.
 *
 * If GET /api/users appears multiple
 * times, it becomes ONE node.
 */
function getEndpointKey(endpoint: Endpoint): string {
  return [endpoint.method.toUpperCase(), endpoint.route]
    .join(":")
    .toLowerCase();
}

/**
 * Build positions in concentric rings.
 *
 * This gives us an Obsidian-like graph
 * instead of a left-to-right flowchart.
 *
 * Each ring has enough space between
 * nodes to prevent them from touching.
 */
function getWebPosition(
  index: number,
  total: number,
): {
  x: number;
  y: number;
} {
  if (total <= 1) {
    return {
      x: 0,
      y: 0,
    };
  }

  const nodesPerRing = 14;

  const ring = Math.floor(index / nodesPerRing) + 1;

  const indexInRing = index % nodesPerRing;

  const itemsInThisRing = Math.min(
    nodesPerRing,
    total - (ring - 1) * nodesPerRing,
  );

  const angle = (Math.PI * 2 * indexInRing) / itemsInThisRing + ring * 0.32;

  /*
   * Large radius = collision
   * prevention.
   */
  const radius = 310 + ring * 260;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function createProjectGraph(endpoints: Endpoint[]): ArchitectureGraph {
  const nodes: ArchitectureNode[] = [];

  const edges: ArchitectureEdge[] = [];

  /*
   * These maps are what prevent
   * duplicate nodes.
   */
  const fileNodes = new Map<string, ArchitectureNode>();

  const endpointNodes = new Map<string, ArchitectureNode>();

  /*
   * Prevent duplicate connections,
   * too.
   */
  const edgeKeys = new Set<string>();

  /*
   * -------------------------
   * Create unique file nodes
   * -------------------------
   */
  endpoints.forEach((endpoint) => {
    const filePath = endpoint.filePath || "Unknown source file";

    const fileKey = normalizePath(filePath);

    if (!fileNodes.has(fileKey)) {
      const fileNode: ArchitectureNode = {
        id: `file-${sanitizeId(fileKey)}`,

        position: {
          x: 0,
          y: 0,
        },

        className: "architecture-node architecture-node-file",

        data: {
          label: getFileName(filePath),

          nodeType: "file",

          filePath,
          connectionCount: 0,
        },
      };

      fileNodes.set(fileKey, fileNode);
    }
  });

  /*
   * -------------------------
   * Create unique endpoints
   * -------------------------
   */
  endpoints.forEach((endpoint) => {
    const endpointKey = getEndpointKey(endpoint);

    if (!endpointNodes.has(endpointKey)) {
      const method = endpoint.method.toUpperCase();

      const endpointNode: ArchitectureNode = {
        id: `endpoint-${sanitizeId(endpointKey)}`,

        position: {
          x: 0,
          y: 0,
        },

        className: `architecture-node architecture-node-endpoint method-node-${method.toLowerCase()}`,

        data: {
          label: endpoint.route,

          nodeType: "endpoint",

          method,
          route: endpoint.route,

          filePath: endpoint.filePath,

          connectionCount: 0,
        },
      };

      endpointNodes.set(endpointKey, endpointNode);
    }
  });

  /*
   * -------------------------
   * Create connections
   * -------------------------
   *
   * Notice we retrieve an existing
   * node here rather than creating
   * another.
   */
  endpoints.forEach((endpoint) => {
    const filePath = endpoint.filePath || "Unknown source file";

    const fileKey = normalizePath(filePath);

    const endpointKey = getEndpointKey(endpoint);

    const fileNode = fileNodes.get(fileKey);

    const endpointNode = endpointNodes.get(endpointKey);

    if (!fileNode || !endpointNode) {
      return;
    }

    const connectionKey = `${fileNode.id}->${endpointNode.id}`;

    if (edgeKeys.has(connectionKey)) {
      return;
    }

    edgeKeys.add(connectionKey);

    edges.push({
      id: `edge-${sanitizeId(connectionKey)}`,

      source: fileNode.id,

      target: endpointNode.id,

      /*
       * Straight lines look much
       * more like Obsidian.
       */
      type: "straight",

      className: "architecture-edge",
    });

    fileNode.data.connectionCount = (fileNode.data.connectionCount ?? 0) + 1;

    endpointNode.data.connectionCount =
      (endpointNode.data.connectionCount ?? 0) + 1;
  });

  /*
   * -------------------------
   * Position everything
   * -------------------------
   */

  const allFileNodes = Array.from(fileNodes.values());

  const allEndpointNodes = Array.from(endpointNodes.values());

  /*
   * Put file nodes closer to
   * the center.
   */
  allFileNodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(allFileNodes.length, 1);

    const radius = Math.max(240, allFileNodes.length * 18);

    node.position = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  /*
   * Put endpoint nodes on
   * wider outer rings.
   */
  allEndpointNodes.forEach((node, index) => {
    node.position = getWebPosition(index, allEndpointNodes.length);
  });

  nodes.push(...allFileNodes, ...allEndpointNodes);

  return {
    nodes,
    edges,
  };
}

export default function ArchitectureMapPage() {
  const navigate = useNavigate();

  const [storedAnalysis] = useState<AnalysisResult | null>(loadStoredAnalysis);

  const [initialGraph] = useState<ArchitectureGraph>(() => {
    if (storedAnalysis && storedAnalysis.endpoints.length > 0) {
      return createProjectGraph(storedAnalysis.endpoints);
    }

    return {
      nodes: [],
      edges: [],
    };
  });

  const [nodes, setNodes] = useState<ArchitectureNode[]>(initialGraph.nodes);

  const [edges, setEdges] = useState<ArchitectureEdge[]>(initialGraph.edges);

  const [selectedNode, setSelectedNode] = useState<ArchitectureNode | null>(
    null,
  );

  const [search, setSearch] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);

  const onNodesChange: OnNodesChange<ArchitectureNode> = useCallback(
    (changes) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
    },
    [],
  );

  const onEdgesChange: OnEdgesChange<ArchitectureEdge> = useCallback(
    (changes) => {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
    },
    [],
  );

  const normalizedSearch = search.trim().toLowerCase();

  const visibleNodes = useMemo(() => {
    return nodes.map((node) => {
      const searchableText = [
        node.data.label,
        node.data.nodeType,
        node.data.filePath,
        node.data.method,
        node.data.route,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matches =
        normalizedSearch.length === 0 ||
        searchableText.includes(normalizedSearch);

      return {
        ...node,

        hidden: !matches,

        className: [
          node.className,

          matches && normalizedSearch.length > 0 ? "search-match" : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    });
  }, [nodes, normalizedSearch]);

  const visibleNodeIds = useMemo(
    () =>
      new Set(
        visibleNodes.filter((node) => !node.hidden).map((node) => node.id),
      ),

    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,

        hidden:
          !visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target),
      })),

    [edges, visibleNodeIds],
  );

  const hasStoredProject = (storedAnalysis?.endpoints.length ?? 0) > 0;

  return (
    <div className="architecture-page architecture-page-full">
      <header className="map-topbar map-topbar-overlay">
        <button
          type="button"
          className="map-brand-button"
          onClick={() => navigate("/")}
        >
          <Network size={19} />

          <img src={logo} alt="APIMapper.dev" className="brand-image" />
        </button>

        <div className="map-topbar-actions">
          <button
            type="button"
            className="map-icon-button"
            onClick={() => setSearchOpen((current) => !current)}
            aria-label="Search nodes"
          >
            <Search size={17} />
          </button>

          <button
            type="button"
            className="back-button"
            onClick={() => navigate("/")}
          >
            <ArrowLeft size={17} />
            Endpoint Explorer
          </button>
        </div>
      </header>

      <main className="architecture-canvas-full">
        {!hasStoredProject && (
          <div className="map-empty-overlay">
            <Network size={36} />

            <h2>No project map</h2>

            <p>Analyze a project before opening the architecture map.</p>

            <button type="button" onClick={() => navigate("/")}>
              Analyze Project
            </button>
          </div>
        )}

        {searchOpen && (
          <div className="map-floating-search">
            <Search size={16} />

            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search routes or files..."
            />

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchOpen(false);
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {hasStoredProject && (
          <ReactFlow<ArchitectureNode, ArchitectureEdge>
            nodes={visibleNodes}
            edges={visibleEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_event, node) => {
              setSelectedNode(node);
            }}
            onPaneClick={() => {
              setSelectedNode(null);
            }}
            fitView
            fitViewOptions={{
              padding: 0.22,
              minZoom: 0.18,
              maxZoom: 1,
            }}
            minZoom={0.08}
            maxZoom={2}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            defaultEdgeOptions={{
              type: "straight",
            }}
            proOptions={{
              hideAttribution: true,
            }}
          >
            <Background gap={24} size={1} />

            <Controls position="bottom-left" />
          </ReactFlow>
        )}

        {hasStoredProject && (
          <div className="map-floating-stats">
            <span>
              <strong>
                {visibleNodes.filter((node) => !node.hidden).length}
              </strong>
              nodes
            </span>

            <span>
              <strong>
                {visibleEdges.filter((edge) => !edge.hidden).length}
              </strong>
              connections
            </span>
          </div>
        )}

        {selectedNode && (
          <aside className="floating-node-details">
            <button
              type="button"
              className="floating-details-close"
              onClick={() => setSelectedNode(null)}
            >
              <X size={16} />
            </button>

            <span className="floating-node-type">
              {selectedNode.data.nodeType}
            </span>

            <h2>{selectedNode.data.label}</h2>

            {selectedNode.data.method && (
              <div className="node-detail-row">
                <span>Method</span>

                <strong>{selectedNode.data.method}</strong>
              </div>
            )}

            {selectedNode.data.route && (
              <div className="node-detail-row">
                <span>Route</span>

                <code>{selectedNode.data.route}</code>
              </div>
            )}

            {selectedNode.data.filePath && (
              <div className="node-detail-row">
                <span>Source</span>

                <code>{selectedNode.data.filePath}</code>
              </div>
            )}

            <div className="node-detail-row">
              <span>Connections</span>

              <strong>{selectedNode.data.connectionCount ?? 0}</strong>
            </div>

            {selectedNode.data.nodeType === "file" && (
              <div className="node-resource-note">
                <FileCode2 size={16} />
                Source file
              </div>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
