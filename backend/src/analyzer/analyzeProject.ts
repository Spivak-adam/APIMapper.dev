import path from "node:path";
import {
  DiscoveredEndpoint,
  ProjectAnalysis
} from "../models/Endpoint.js";
import { analyzeExpressRoutes } from "./expressRouteAnalyzer.js";
import { scanProject } from "./projectScanner.js";

function removeDuplicateEndpoints(
  endpoints: DiscoveredEndpoint[]
): DiscoveredEndpoint[] {
  const seen = new Set<string>();

  return endpoints.filter((endpoint) => {
    const key = [
      endpoint.method,
      endpoint.path,
      endpoint.source.filePath,
      endpoint.source.line,
      endpoint.source.column
    ].join(":");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function analyzeProject(
  projectPath: string
): Promise<ProjectAnalysis> {
  const resolvedProjectPath = path.resolve(projectPath);
  const sourceFiles = await scanProject(resolvedProjectPath);

  const discoveredEndpoints = sourceFiles.flatMap(
    (sourceFile) =>
      analyzeExpressRoutes(
        sourceFile.content,
        sourceFile.relativePath
      )
  );

  const endpoints = removeDuplicateEndpoints(
    discoveredEndpoints
  );

  const warnings: string[] = [];

  if (sourceFiles.length === 0) {
    warnings.push(
      "No TypeScript or TSX files were found."
    );
  }

  if (endpoints.length === 0) {
    warnings.push(
      "No supported Express route definitions were found."
    );
  }

  return {
    projectPath: resolvedProjectPath,
    filesScanned: sourceFiles.length,
    endpointsFound: endpoints.length,
    endpoints,
    warnings
  };
}