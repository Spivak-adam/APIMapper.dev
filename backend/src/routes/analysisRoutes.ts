import { Router } from "express";
import path from "node:path";
import { analyzeProject } from "../analyzer/analyzeProject.js";

interface AnalyzeRequestBody {
  projectPath?: unknown;
}

export const analysisRouter = Router();

analysisRouter.post("/analyze", async (request, response) => {
  try {
    const body = request.body as AnalyzeRequestBody;

    if (
      typeof body.projectPath !== "string" ||
      body.projectPath.trim().length === 0
    ) {
      response.status(400).json({
        error: "A non-empty projectPath is required."
      });

      return;
    }

    const resolvedProjectPath = path.resolve(
      body.projectPath
    );

    const analysis = await analyzeProject(
      resolvedProjectPath
    );

    response.json(analysis);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown project analysis error.";

    response.status(500).json({
      error: "Unable to analyze the project.",
      details: message
    });
  }
});