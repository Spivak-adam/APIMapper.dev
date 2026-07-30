import { useMemo, useState } from "react";

import { Code2, Map, RefreshCw } from "lucide-react";

import { useNavigate } from "react-router-dom";

import { analyzeProject } from "../api";

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">
            <Code2 size={22} />
          </div>

          <div>
            <h1>APIMapper.dev</h1>

            <p>Visual API architecture explorer</p>
          </div>
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

      <main>
        <section className="page-heading">
          <p className="eyebrow">PROJECT ANALYSIS</p>

          <h2>{analysis.projectName ?? "Endpoint Explorer"}</h2>

          <p>Explore the endpoints discovered by the TypeScript AST parser.</p>
        </section>

        <section className="project-input-section">
          <label htmlFor="project-path">Project path</label>

          <div className="project-input-row">
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

            <button
              type="button"
              onClick={() => void handleAnalyzeProject()}
              disabled={isLoading || projectPath.trim().length === 0}
            >
              {isLoading ? "Analyzing..." : "Analyze Project"}
            </button>
          </div>
        </section>

        {error && (
          <div className="error-message" role="alert">
            <strong>Unable to analyze the project.</strong>

            <span>{error}</span>
          </div>
        )}

        <StatsCards
          endpoints={analysis.endpoints}
          filesScanned={analysis.filesScanned}
        />

        <Filters
          search={search}
          selectedMethod={selectedMethod}
          methods={methods}
          onSearchChange={setSearch}
          onMethodChange={setSelectedMethod}
        />

        <section className="workspace">
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

          <EndpointDetails
            endpoint={selectedEndpoint}
            onClose={() => setSelectedEndpoint(undefined)}
          />
        </section>
      </main>
    </div>
  );
}
