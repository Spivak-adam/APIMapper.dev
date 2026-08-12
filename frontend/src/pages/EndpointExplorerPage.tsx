import { useMemo, useState } from "react";

import { Code2, Map, RefreshCw, FolderSearch, Download } from "lucide-react";

import { useNavigate } from "react-router-dom";

import { analyzeProject } from "../api";

import logo from "../assets/logo.png";

import type { AnalysisResult, Endpoint } from "../types";

import { EndpointDetails } from "../components/EndpointDetails";
import { EndpointTable } from "../components/EndpointTable";
import { FileExplorer } from "../components/FileExplorer";
import { Filters } from "../components/Filters";
import { StatsCards } from "../components/StatsCards";

export default function EndpointExplorerPage() {
  const navigate = useNavigate();

  const [analysis, setAnalysis] = useState<AnalysisResult>(() => {
    const storedAnalysis = sessionStorage.getItem("apiMapperAnalysis");

    if (!storedAnalysis) {
      return {
        endpoints: [],
      };
    }

    try {
      return JSON.parse(storedAnalysis) as AnalysisResult;
    } catch {
      return {
        endpoints: [],
      };
    }
  });

  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>();

  const [search, setSearch] = useState("");

  const [selectedMethod, setSelectedMethod] = useState("ALL");

  const [selectedFile, setSelectedFile] = useState("ALL");

  const [projectPath, setProjectPath] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState<string>();

  async function handleAnalyzeProject() {
    const cleanedProjectPath = projectPath.trim();

    if (!cleanedProjectPath) {
      setError("Enter a project path before starting the analysis.");

      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const result = await analyzeProject(cleanedProjectPath);

      setAnalysis(result);

      sessionStorage.setItem("apiMapperAnalysis", JSON.stringify(result));

      setSelectedEndpoint(result.endpoints[0]);

      setSearch("");
      setSelectedMethod("ALL");
      setSelectedFile("ALL");
    } catch (analysisError) {
      const message =
        analysisError instanceof Error
          ? analysisError.message
          : "Unable to analyze the project.";

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const methods = useMemo(() => {
    const discoveredMethods = analysis.endpoints.map((endpoint) =>
      endpoint.method.toUpperCase(),
    );

    return Array.from(new Set(discoveredMethods)).sort();
  }, [analysis.endpoints]);

  const filteredEndpoints = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return analysis.endpoints.filter((endpoint) => {
      const matchesMethod =
        selectedMethod === "ALL" ||
        endpoint.method.toUpperCase() === selectedMethod;

      const matchesFile =
        selectedFile === "ALL" || endpoint.filePath === selectedFile;

      const searchableText = [
        endpoint.method,
        endpoint.route,
        endpoint.filePath,
        endpoint.functionName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        normalizedSearch.length === 0 ||
        searchableText.includes(normalizedSearch);

      return matchesMethod && matchesFile && matchesSearch;
    });
  }, [analysis.endpoints, search, selectedMethod, selectedFile]);

  function handleExportOpenApi() {
    if (analysis.endpoints.length === 0) {
      setError("Analyze a project before exporting OpenAPI documentation.");
      return;
    }

    const paths: Record<string, Record<string, unknown>> = {};

    const validHttpMethods = new Set([
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
    ]);

    for (const endpoint of analysis.endpoints) {
      const method = endpoint.method.toLowerCase();

      // Do not export things like .all(), .map(), etc.
      if (!validHttpMethods.has(method)) {
        continue;
      }

      // OpenAPI paths must be relative application paths.
      // This also removes outbound calls like Google Maps.
      if (!endpoint.route.startsWith("/")) {
        continue;
      }

      // Do not put absolute external URLs inside OpenAPI paths.
      if (
        endpoint.route.startsWith("http://") ||
        endpoint.route.startsWith("https://")
      ) {
        continue;
      }

      const openApiRoute = endpoint.route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

      if (!paths[openApiRoute]) {
        paths[openApiRoute] = {};
      }

      // Find every Express :parameter in the original route.
      const parameterNames = Array.from(
        endpoint.route.matchAll(/:([A-Za-z0-9_]+)/g),
        (match) => match[1],
      );

      const parameters = parameterNames.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
      }));

      paths[openApiRoute][method] = {
        summary:
          endpoint.functionName && endpoint.functionName !== "anonymous"
            ? endpoint.functionName
            : `${endpoint.method.toUpperCase()} ${openApiRoute}`,

        description: endpoint.filePath
          ? `Discovered by APIMapper.dev from ${endpoint.filePath}`
          : "Discovered automatically by APIMapper.dev.",

        ...(parameters.length > 0 && {
          parameters,
        }),

        responses: {
          "200": {
            description: "Successful response",
          },
        },
      };
    }

    const openApiDocument = {
      openapi: "3.1.0",

      info: {
        title: analysis.projectName
          ? `${analysis.projectName} API`
          : "APIMapper Generated API",

        version: "1.0.0",

        description:
          "OpenAPI specification automatically generated by APIMapper.dev.",
      },

      paths,
    };

    const json = JSON.stringify(openApiDocument, null, 2);

    const blob = new Blob([json], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = `${
      analysis.projectName
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "apimapper"
    }-openapi.json`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  return (
    <div className="app explorer-app">
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="brand-home-button"
            onClick={() => navigate("/")}
            aria-label="Go to APIMapper.dev home"
          >
            <img src={logo} alt="APIMapper.dev" className="brand-image" />
          </button>

          <p>Visual API architecture explorer</p>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="map-button"
            onClick={() => navigate("/map")}
          >
            <Map size={17} />
            Architecture Map
          </button>

          <button
            type="button"
            className="refresh-button"
            onClick={() => void handleAnalyzeProject()}
            disabled={isLoading || projectPath.trim().length === 0}
          >
            <RefreshCw
              size={17}
              className={isLoading ? "spinning-icon" : undefined}
            />

            {isLoading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </header>

      <main className="explorer-main">
        <section className="explorer-header">
          <div className="explorer-title">
            <p className="eyebrow">PROJECT ANALYSIS</p>

            <h2>{analysis.projectName ?? "Endpoint Explorer"}</h2>

            <p>
              Browse discovered API endpoints and inspect their request and
              response structure.
            </p>
          </div>

          <div className="project-path-control">
            <div className="project-path-input">
              <FolderSearch size={17} />

              <input
                id="project-path"
                type="text"
                value={projectPath}
                onChange={(event) => setProjectPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isLoading) {
                    void handleAnalyzeProject();
                  }
                }}
                placeholder={String.raw`C:\Users\Adam\Projects\sample-react-app`}
              />
            </div>

            <div className="project-action-buttons">
              <button
                type="button"
                className="analyze-project-button"
                onClick={() => void handleAnalyzeProject()}
                disabled={isLoading || projectPath.trim().length === 0}
              >
                {isLoading ? "Analyzing..." : "Analyze Project"}
              </button>

              <button
                type="button"
                className="export-openapi-button"
                onClick={handleExportOpenApi}
                disabled={isLoading || analysis.endpoints.length === 0}
                title={
                  analysis.endpoints.length === 0
                    ? "Analyze a project before exporting"
                    : "Export OpenAPI JSON"
                }
              >
                <Download size={17} />
                Export OpenAPI
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="error-message" role="alert">
            <strong>Unable to analyze the project.</strong>

            <span>{error}</span>
          </div>
        )}

        <section className="explorer-toolbar">
          <div className="explorer-filters">
            <Filters
              search={search}
              selectedMethod={selectedMethod}
              methods={methods}
              onSearchChange={setSearch}
              onMethodChange={setSelectedMethod}
            />
          </div>

          <div className="explorer-summary">
            <span>
              <strong>{analysis.endpoints.length}</strong>
              endpoints
            </span>

            <span>
              <strong>{analysis.filesScanned ?? 0}</strong>
              files scanned
            </span>
          </div>
        </section>
        {analysis.endpoints.length > 0 && (
          <section className="secondary-stats">
            <StatsCards
              endpoints={analysis.endpoints}
              filesScanned={analysis.filesScanned}
            />
          </section>
        )}

        <section className="workspace endpoint-workspace">
          <FileExplorer
            endpoints={analysis.endpoints}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />

          <section className="endpoint-panel">
            <div className="endpoint-panel-heading">
              <div>
                <h2>Discovered Endpoints</h2>

                <p>
                  {filteredEndpoints.length}{" "}
                  {filteredEndpoints.length === 1 ? "result" : "results"}
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="loading-state">
                <div className="spinner" aria-hidden="true" />

                <p>Loading endpoint data...</p>
              </div>
            ) : (
              <EndpointTable
                endpoints={filteredEndpoints}
                selectedEndpoint={selectedEndpoint}
                onSelectEndpoint={setSelectedEndpoint}
              />
            )}
          </section>

          <section className="endpoint-details-workspace">
            <EndpointDetails
              endpoint={selectedEndpoint}
              onClose={() => setSelectedEndpoint(undefined)}
            />
          </section>
        </section>
      </main>
    </div>
  );
}
