import { useCallback, useMemo, useState } from "react";

import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
} from "@xyflow/react";

import type {
  Edge,
  Node,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";

import {
  ArrowLeft,
  Database,
  Network,
  Search,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import type {
  AnalysisResult,
  Endpoint,
} from "../types";

import "@xyflow/react/dist/style.css";

type ArchitectureNodeCategory =
  | "component"
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
};

type ArchitectureNode = Node<ArchitectureNodeData>;
type ArchitectureEdge = Edge;

type ArchitectureGraph = {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
};

const STORAGE_KEY = "apiMapperAnalysis";

const sampleNodes: ArchitectureNode[] = [
  {
    id: "component-profile",
    position: { x: 50, y: 180 },
    data: {
      label: "ProfilePage.tsx",
      nodeType: "component",
      filePath: "src/pages/ProfilePage.tsx",
    },
  },
  {
    id: "endpoint-profile",
    position: { x: 350, y: 180 },
    data: {
      label: "GET /api/profile",
      nodeType: "endpoint",
      method: "GET",
      route: "/api/profile",
    },
  },
  {
    id: "middleware-auth",
    position: { x: 650, y: 80 },
    data: {
      label: "authenticateToken",
      nodeType: "middleware",
      filePath: "src/middleware/authenticateToken.ts",
    },
  },
  {
    id: "controller-profile",
    position: { x: 650, y: 280 },
    data: {
      label: "getProfile",
      nodeType: "controller",
      filePath: "src/controllers/profile.controller.ts",
    },
  },
  {
    id: "database-users",
    position: { x: 950, y: 280 },
    data: {
      label: "Users",
      nodeType: "database",
    },
  },
];

const sampleEdges: ArchitectureEdge[] = [
  {
    id: "component-to-endpoint",
    source: "component-profile",
    target: "endpoint-profile",
    label: "calls",
    type: "smoothstep",
  },
  {
    id: "endpoint-to-auth",
    source: "endpoint-profile",
    target: "middleware-auth",
    label: "protected by",
    type: "smoothstep",
  },
  {
    id: "endpoint-to-controller",
    source: "endpoint-profile",
    target: "controller-profile",
    label: "handled by",
    type: "smoothstep",
  },
  {
    id: "controller-to-users",
    source: "controller-profile",
    target: "database-users",
    label: "queries",
    type: "smoothstep",
  },
];

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

function createProjectGraph(endpoints: Endpoint[]): ArchitectureGraph {
  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];

  const endpointsByFile = new Map<string, Endpoint[]>();

  endpoints.forEach((endpoint) => {
    const filePath = endpoint.filePath || "Unknown source file";
    const fileEndpoints = endpointsByFile.get(filePath) ?? [];

    fileEndpoints.push(endpoint);
    endpointsByFile.set(filePath, fileEndpoints);
  });

  Array.from(endpointsByFile.entries()).forEach(
    ([filePath, fileEndpoints], fileIndex) => {
      const fileNodeId = `file-${fileIndex}`;
      const baseY = fileIndex * 220;

      nodes.push({
        id: fileNodeId,
        position: {
          x: 80,
          y: baseY,
        },
        data: {
          label: getFileName(filePath),
          nodeType: "controller",
          filePath,
        },
      });

      fileEndpoints.forEach((endpoint, endpointIndex) => {
        const endpointNodeId = `endpoint-${fileIndex}-${endpointIndex}`;
        const method = endpoint.method.toUpperCase();

        nodes.push({
          id: endpointNodeId,
          position: {
            x: 430,
            y: baseY + endpointIndex * 110,
          },
          data: {
            label: `${method} ${endpoint.route}`,
            nodeType: "endpoint",
            method,
            route: endpoint.route,
            filePath: endpoint.filePath,
          },
        });

        edges.push({
          id: `${fileNodeId}-${endpointNodeId}`,
          source: fileNodeId,
          target: endpointNodeId,
          label: "defines",
          type: "smoothstep",
        });
      });
    },
  );

  return { nodes, edges };
}

export default function ArchitectureMapPage() {
  const navigate = useNavigate();

  const [storedAnalysis] = useState<AnalysisResult | null>(loadStoredAnalysis);

  const [initialGraph] = useState<ArchitectureGraph>(() => {
    if (
      storedAnalysis &&
      storedAnalysis.endpoints.length > 0
    ) {
      return createProjectGraph(storedAnalysis.endpoints);
    }

    return {
      nodes: sampleNodes,
      edges: sampleEdges,
    };
  });

  const [nodes, setNodes] =
    useState<ArchitectureNode[]>(initialGraph.nodes);

  const [edges, setEdges] =
    useState<ArchitectureEdge[]>(initialGraph.edges);

  const [selectedNode, setSelectedNode] =
    useState<ArchitectureNode | null>(null);

  const [search, setSearch] = useState("");

  const onNodesChange: OnNodesChange<ArchitectureNode> = useCallback(
    (changes) => {
      setNodes((currentNodes) =>
        applyNodeChanges(changes, currentNodes),
      );
    },
    [],
  );

  const onEdgesChange: OnEdgesChange<ArchitectureEdge> = useCallback(
    (changes) => {
      setEdges((currentEdges) =>
        applyEdgeChanges(changes, currentEdges),
      );
    },
    [],
  );

  const normalizedSearch = search.trim().toLowerCase();

  const visibleNodes = useMemo(
    () =>
      nodes.map((node) => {
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

        const matchesSearch =
          normalizedSearch.length === 0 ||
          searchableText.includes(normalizedSearch);

        return {
          ...node,
          hidden: !matchesSearch,
        };
      }),
    [nodes, normalizedSearch],
  );

  const visibleNodeIds = useMemo(
    () =>
      new Set(
        visibleNodes
          .filter((node) => !node.hidden)
          .map((node) => node.id),
      ),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        hidden:
          !visibleNodeIds.has(edge.source) ||
          !visibleNodeIds.has(edge.target),
      })),
    [edges, visibleNodeIds],
  );

  const hasStoredProject =
    (storedAnalysis?.endpoints.length ?? 0) > 0;

  return (
    <div className="architecture-page">
      <header className="map-topbar">
        <div className="map-title">
          <div className="brand-logo">
            <Network size={22} />
          </div>

          <div>
            <h1>APIMapper.dev</h1>
            <p>
              {storedAnalysis?.projectName ??
                "Visual architecture map"}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="back-button"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={17} />
          Endpoint Explorer
        </button>
      </header>

      <main className="architecture-workspace">
        <aside className="architecture-sidebar">
          <div className="sidebar-heading">
            <h2>Architecture Map</h2>
            <p>
              Explore relationships between project resources.
            </p>
          </div>

          {!hasStoredProject && (
            <div className="map-empty-warning">
              <p>
                No analyzed project was found. Showing sample architecture.
              </p>

              <button
                type="button"
                onClick={() => navigate("/")}
              >
                Analyze a project
              </button>
            </div>
          )}

          <div className="map-search">
            <label
              className="search-label"
              htmlFor="node-search"
            >
              Search nodes
            </label>

            <div className="search-input-wrapper">
              <Search size={16} />

              <input
                id="node-search"
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search files or routes"
              />
            </div>
          </div>

          <section className="map-summary">
            <h3>Map summary</h3>

            <div>
              <span>Nodes</span>
              <strong>
                {
                  visibleNodes.filter(
                    (node) => !node.hidden,
                  ).length
                }
              </strong>
            </div>

            <div>
              <span>Connections</span>
              <strong>
                {
                  visibleEdges.filter(
                    (edge) => !edge.hidden,
                  ).length
                }
              </strong>
            </div>
          </section>
        </aside>

        <section className="architecture-canvas">
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
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </section>

        <aside className="node-details">
          <div className="details-heading">
            <h2>Node details</h2>
            <p>Select a resource on the map.</p>
          </div>

          {!selectedNode && (
            <div className="empty-node-details">
              <Network size={34} />
              <p>
                Select a node to inspect its information and relationships.
              </p>
            </div>
          )}

          {selectedNode && (
            <div className="selected-node-details">
              <div className="node-type-label">
                {selectedNode.data.nodeType}
              </div>

              <h3>{selectedNode.data.label}</h3>

              <dl>
                <dt>Type</dt>
                <dd>{selectedNode.data.nodeType}</dd>

                {selectedNode.data.method && (
                  <>
                    <dt>Method</dt>
                    <dd>{selectedNode.data.method}</dd>
                  </>
                )}

                {selectedNode.data.route && (
                  <>
                    <dt>Route</dt>
                    <dd>{selectedNode.data.route}</dd>
                  </>
                )}

                {selectedNode.data.filePath && (
                  <>
                    <dt>Source file</dt>
                    <dd>{selectedNode.data.filePath}</dd>
                  </>
                )}
              </dl>

              {selectedNode.data.nodeType === "database" && (
                <div className="database-node-note">
                  <Database size={18} />
                  Database resource
                </div>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}