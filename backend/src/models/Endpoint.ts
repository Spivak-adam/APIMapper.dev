export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "ALL"
  | "UNKNOWN";

export type RequestInputSource =
  | "path"
  | "query"
  | "body"
  | "header"
  | "cookie"
  | "authenticated-user"
  | "file"
  | "unknown";

export type ConfidenceLevel = "exact" | "high" | "medium" | "low";

export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface MiddlewareInfo {
  name: string;
  expression: string;
}

export interface RequestInput {
  name: string;
  source: RequestInputSource;
  expression: string;
  required: boolean;
  inferredType: string;
  confidence: ConfidenceLevel;
}

export interface ResponseProperty {
  name: string;
  type: string;
  nullable: boolean;
  expression?: string;
  properties?: ResponseProperty[];
  items?: ResponseProperty[];
}

export interface EndpointResponse {
  status: number;
  explicitStatus: boolean;
  method: "json" | "send" | "sendStatus" | "end";
  schema: ResponseProperty | null;
  expression: string | null;
}

export interface DatabaseFilter {
  operation: string;
  column?: string;
  value?: string;
}

export interface DatabaseOperation {
  client: string;
  operation: string;
  table: string | null;
  selectedFields: string[];
  filters: DatabaseFilter[];
  sourceExpression: string;
}

export interface DiscoveredEndpoint {
  kind: "route-definition";
  framework: "express";
  method: HttpMethod;
  path: string;
  routerName: string;
  middleware: MiddlewareInfo[];
  handlerName: string;
  requestInputs: RequestInput[];
  responses: EndpointResponse[];
  databaseOperations: DatabaseOperation[];
  source: SourceLocation;
  confidence: ConfidenceLevel;
}

export interface ProjectAnalysis {
  projectPath: string;
  filesScanned: number;
  endpointsFound: number;
  endpoints: DiscoveredEndpoint[];
  warnings: string[];
}