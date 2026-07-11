import cors from "cors";
import express from "express";
import { analysisRouter } from "./routes/analysisRoutes.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    application: "APIMapper.dev",
    version: "0.1.0"
  });
});

app.use("/api", analysisRouter);

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown server error.";

    response.status(500).json({
      error: "Internal server error.",
      details: message
    });
  }
);

app.listen(port, () => {
  console.log(
    `APIMapper.dev backend running at http://localhost:${port}`
  );
});