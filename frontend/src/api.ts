import type {
  AnalysisResult,
  DiscoveredEndpoint,
  Endpoint,
  ProjectAnalysisResponse,
} from "./types";

function normalizeEndpoint(
  endpoint: DiscoveredEndpoint,
  index: number,
): Endpoint {
  return {
    id: [
      endpoint.method,
      endpoint.path,
      endpoint.source.filePath,
      endpoint.source.line,
      endpoint.source.column,
      index,
    ].join("-"),

    method: endpoint.method,
    route: endpoint.path,
    filePath: endpoint.source.filePath,
    functionName: endpoint.handlerName,
    line: endpoint.source.line,
    column: endpoint.source.column,
    routerName: endpoint.routerName,
    confidence: endpoint.confidence,
    requestParameters: endpoint.requestInputs,
    responses: endpoint.responses,
    middleware: endpoint.middleware,
    databaseOperations: endpoint.databaseOperations,
  };
}

function getProjectName(projectPath: string): string {
  const normalizedPath = projectPath.replaceAll("\\", "/");

  const sections = normalizedPath
    .split("/")
    .filter(Boolean);

  return sections.at(-1) ?? "Analyzed Project";
}

function normalizeAnalysis(
  analysis: ProjectAnalysisResponse,
): AnalysisResult {
  return {
    projectName: getProjectName(
      analysis.projectPath,
    ),

    projectPath: analysis.projectPath,
    filesScanned: analysis.filesScanned,
    endpointsFound: analysis.endpointsFound,

    endpoints: analysis.endpoints.map(
      normalizeEndpoint,
    ),

    warnings: analysis.warnings,
  };
}

interface ErrorResponse {
  error?: string;
  details?: string;
}

export async function analyzeProject(
  projectPath: string,
): Promise<AnalysisResult> {
  const response = await fetch("/api/analyze", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      projectPath,
    }),
  });

  if (!response.ok) {
    const errorData =
      (await response.json()) as ErrorResponse;

    throw new Error(
      errorData.details ??
        errorData.error ??
        `Analysis failed with status ${response.status}.`,
    );
  }

  const analysis =
    (await response.json()) as ProjectAnalysisResponse;

  return normalizeAnalysis(analysis);
}