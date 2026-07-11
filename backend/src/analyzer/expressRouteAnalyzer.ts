import * as ts from "typescript";
import {
  DatabaseFilter,
  DatabaseOperation,
  DiscoveredEndpoint,
  EndpointResponse,
  HttpMethod,
  MiddlewareInfo,
  RequestInput,
  RequestInputSource,
  SourceLocation,
} from "../models/Endpoint.js";
import { analyzeExpression } from "./valueAnalyzer.js";

const EXPRESS_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
]);

function normalizeMethod(method: string): HttpMethod {
  const normalized = method.toUpperCase();

  switch (normalized) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "OPTIONS":
    case "HEAD":
    case "ALL":
      return normalized;

    default:
      return "UNKNOWN";
  }
}

function getSourceLocation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  filePath: string,
): SourceLocation {
  const start = node.getStart(sourceFile);
  const location = sourceFile.getLineAndCharacterOfPosition(start);

  return {
    filePath,
    line: location.line + 1,
    column: location.character + 1,
  };
}

function getStringValue(expression: ts.Expression): string | null {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }

  if (ts.isTemplateExpression(expression)) {
    return expression.getText();
  }

  return null;
}

function getRoutePath(expression: ts.Expression): string {
  const literalValue = getStringValue(expression);

  if (literalValue !== null) {
    return literalValue;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => element.getText()).join(", ");
  }

  return expression.getText();
}

function getFunctionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return "anonymous";
  }

  if (ts.isCallExpression(expression)) {
    return expression.expression.getText();
  }

  return expression.getText();
}

function getMiddlewareInfo(
  routeArguments: ts.NodeArray<ts.Expression>,
): MiddlewareInfo[] {
  if (routeArguments.length <= 2) {
    return [];
  }

  const middleArguments = routeArguments.slice(1, -1);

  return middleArguments.map((argument) => ({
    name: getFunctionName(argument),
    expression: argument.getText(),
  }));
}

function getHandlerExpression(
  routeArguments: ts.NodeArray<ts.Expression>,
): ts.Expression | null {
  return routeArguments.at(-1) ?? null;
}

function getHandlerNode(
  sourceFile: ts.SourceFile,
  handlerExpression: ts.Expression,
): ts.FunctionLikeDeclaration | null {
  if (
    ts.isArrowFunction(handlerExpression) ||
    ts.isFunctionExpression(handlerExpression)
  ) {
    return handlerExpression;
  }

  if (!ts.isIdentifier(handlerExpression)) {
    return null;
  }

  // Save the narrowed value before entering the nested function.
  const handlerName = handlerExpression.text;

  let result: ts.FunctionLikeDeclaration | null = null;

  function visit(node: ts.Node): void {
    if (result) {
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name?.text === handlerName) {
      result = node;
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === handlerName &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      result = node.initializer;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return result;
}

function propertyAccessParts(expression: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(expression)) {
    return propertyAccessParts(expression.expression);
  }

  if (ts.isAsExpression(expression)) {
    return propertyAccessParts(expression.expression);
  }

  if (ts.isNonNullExpression(expression)) {
    return propertyAccessParts(expression.expression);
  }

  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return [
      ...propertyAccessParts(expression.expression),
      expression.name.text,
    ];
  }

  if (ts.isElementAccessExpression(expression)) {
    const base = propertyAccessParts(expression.expression);

    const argument = expression.argumentExpression;

    if (!argument) {
      return base;
    }

    const propertyName =
      ts.isStringLiteral(argument) || ts.isNumericLiteral(argument)
        ? argument.text
        : argument.getText();

    return [...base, propertyName];
  }

  return [expression.getText()];
}

function classifyRequestInput(parts: string[]): {
  source: RequestInputSource;
  name: string;
} | null {
  if (parts[0] !== "req") {
    return null;
  }

  const category = parts[1];

  if (!category) {
    return null;
  }

  const propertyPath = parts.slice(2).join(".");
  const name = propertyPath || category;

  switch (category) {
    case "params":
      return {
        source: "path",
        name,
      };

    case "query":
      return {
        source: "query",
        name,
      };

    case "body":
      return {
        source: "body",
        name,
      };

    case "headers":
      return {
        source: "header",
        name,
      };

    case "cookies":
      return {
        source: "cookie",
        name,
      };

    case "user":
      return {
        source: "authenticated-user",
        name,
      };

    case "file":
    case "files":
      return {
        source: "file",
        name,
      };

    default:
      return null;
  }
}

function inferRequestType(node: ts.Node): string {
  const parent = node.parent;

  if (ts.isCallExpression(parent)) {
    const calledExpression = parent.expression.getText();

    if (
      calledExpression === "Number" ||
      calledExpression === "parseInt" ||
      calledExpression === "parseFloat"
    ) {
      return "number";
    }

    if (calledExpression === "String") {
      return "string";
    }

    if (calledExpression === "Boolean") {
      return "boolean";
    }
  }

  return "unknown";
}

function collectRequestInputs(
  handler: ts.FunctionLikeDeclaration,
): RequestInput[] {
  const inputs = new Map<string, RequestInput>();

  function isPartOfLargerRequestExpression(node: ts.Expression): boolean {
    const parent = node.parent;

    if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
      return true;
    }

    if (ts.isElementAccessExpression(parent) && parent.expression === node) {
      return true;
    }

    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer === node &&
      ts.isObjectBindingPattern(parent.name)
    ) {
      return true;
    }

    return false;
  }

  function addRequestInput(node: ts.Expression, expressionText: string): void {
    const parts = propertyAccessParts(node);
    const classified = classifyRequestInput(parts);

    if (!classified) {
      return;
    }

    const key = `${classified.source}:${classified.name}`;

    if (!inputs.has(key)) {
      inputs.set(key, {
        name: classified.name,
        source: classified.source,
        expression: expressionText,
        required: classified.source === "path",
        inferredType: inferRequestType(node),
        confidence: "medium",
      });
    }
  }

  function addDestructuredRequestInputs(node: ts.VariableDeclaration): void {
    if (!ts.isObjectBindingPattern(node.name)) {
      return;
    }

    if (!node.initializer) {
      return;
    }

    const parts = propertyAccessParts(node.initializer);
    const classified = classifyRequestInput(parts);

    if (!classified) {
      return;
    }

    for (const element of node.name.elements) {
      if (ts.isOmittedExpression(element)) {
        continue;
      }

      if (!ts.isIdentifier(element.name)) {
        continue;
      }

      const localName = element.name.text;

      let requestPropertyName = localName;

      if (element.propertyName && ts.isIdentifier(element.propertyName)) {
        requestPropertyName = element.propertyName.text;
      }

      const key = `${classified.source}:${requestPropertyName}`;

      if (!inputs.has(key)) {
        inputs.set(key, {
          name: requestPropertyName,
          source: classified.source,
          expression: `${node.initializer.getText()}.${requestPropertyName}`,
          required: classified.source === "path",
          inferredType: "unknown",
          confidence: "medium",
        });
      }
    }
  }

  function addHeaderInput(node: ts.CallExpression): void {
    if (!ts.isPropertyAccessExpression(node.expression)) {
      return;
    }

    const receiver = node.expression.expression.getText();

    const method = node.expression.name.text;

    if (receiver !== "req" || (method !== "get" && method !== "header")) {
      return;
    }

    const headerArgument = node.arguments[0];

    if (!headerArgument) {
      return;
    }

    const headerName =
      getStringValue(headerArgument) ?? headerArgument.getText();

    const key = `header:${headerName}`;

    if (!inputs.has(key)) {
      inputs.set(key, {
        name: headerName,
        source: "header",
        expression: node.getText(),
        required: false,
        inferredType: "string",
        confidence: "high",
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      addDestructuredRequestInputs(node);
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      !isPartOfLargerRequestExpression(node)
    ) {
      addRequestInput(node, node.getText());
    }

    if (
      ts.isElementAccessExpression(node) &&
      !isPartOfLargerRequestExpression(node)
    ) {
      addRequestInput(node, node.getText());
    }

    if (ts.isCallExpression(node)) {
      addHeaderInput(node);
    }

    ts.forEachChild(node, visit);
  }

  if (handler.body) {
    visit(handler.body);
  }

  return [...inputs.values()];
}

function getResponseStatus(expression: ts.CallExpression): {
  status: number;
  explicit: boolean;
} {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return {
      status: 200,
      explicit: false,
    };
  }

  const receiver = expression.expression.expression;

  if (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === "status"
  ) {
    const statusArgument = receiver.arguments[0];

    if (statusArgument && ts.isNumericLiteral(statusArgument)) {
      return {
        status: Number(statusArgument.text),
        explicit: true,
      };
    }
  }

  return {
    status: 200,
    explicit: false,
  };
}

function isResponseCall(node: ts.CallExpression): {
  method: EndpointResponse["method"];
  bodyExpression: ts.Expression | null;
} | null {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }

  const method = node.expression.name.text;

  if (
    method !== "json" &&
    method !== "send" &&
    method !== "sendStatus" &&
    method !== "end"
  ) {
    return null;
  }

  const receiverText = node.expression.expression.getText();

  const isResponseReceiver =
    receiverText === "res" || receiverText.startsWith("res.status(");

  if (!isResponseReceiver) {
    return null;
  }

  if (method === "sendStatus") {
    return {
      method: "sendStatus",
      bodyExpression: null,
    };
  }

  return {
    method,
    bodyExpression: node.arguments[0] ?? null,
  };
}

function collectResponses(
  sourceFile: ts.SourceFile,
  handler: ts.FunctionLikeDeclaration,
): EndpointResponse[] {
  const responses: EndpointResponse[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const responseCall = isResponseCall(node);

      if (responseCall) {
        let statusInfo = getResponseStatus(node);

        if (
          responseCall.method === "sendStatus" &&
          node.arguments[0] &&
          ts.isNumericLiteral(node.arguments[0])
        ) {
          statusInfo = {
            status: Number(node.arguments[0].text),
            explicit: true,
          };
        }

        responses.push({
          status: statusInfo.status,
          explicitStatus: statusInfo.explicit,
          method: responseCall.method,
          schema: responseCall.bodyExpression
            ? analyzeExpression(
                sourceFile,
                responseCall.bodyExpression,
                "response",
                new Set<string>(),
                handler,
              )
            : null,
          expression: responseCall.bodyExpression?.getText() ?? null,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  if (handler.body) {
    visit(handler.body);
  }

  return responses;
}

function getCallChain(node: ts.CallExpression): ts.CallExpression[] {
  const chain: ts.CallExpression[] = [];
  let current: ts.Expression = node;

  while (ts.isCallExpression(current)) {
    chain.unshift(current);

    if (ts.isPropertyAccessExpression(current.expression)) {
      current = current.expression.expression;
    } else {
      break;
    }
  }

  return chain;
}

function getCallMethod(call: ts.CallExpression): string | null {
  if (ts.isPropertyAccessExpression(call.expression)) {
    return call.expression.name.text;
  }

  return null;
}

function extractSelectFields(selectValue: string): string[] {
  return selectValue
    .split(/[\n,]/)
    .map((field) => field.trim())
    .filter(Boolean)
    .filter((field) => field !== "(" && field !== ")")
    .map((field) => field.replace(/[()]/g, "").replace(/\s+/g, " ").trim());
}

function parseSupabaseOperation(
  node: ts.CallExpression,
): DatabaseOperation | null {
  const expressionText = node.getText();

  if (
    !expressionText.includes("supabase") ||
    !expressionText.includes(".from(")
  ) {
    return null;
  }

  const chain = getCallChain(node);

  let table: string | null = null;
  let operation = "UNKNOWN";
  const selectedFields: string[] = [];
  const filters: DatabaseFilter[] = [];

  for (const call of chain) {
    const method = getCallMethod(call);

    if (!method) {
      continue;
    }

    if (method === "from") {
      const tableArgument = call.arguments[0];

      if (tableArgument) {
        table = getStringValue(tableArgument) ?? tableArgument.getText();
      }
    }

    if (method === "select") {
      operation = "SELECT";

      const selectArgument = call.arguments[0];

      if (selectArgument) {
        const selectedValue =
          getStringValue(selectArgument) ?? selectArgument.getText();

        selectedFields.push(...extractSelectFields(selectedValue));
      }
    }

    if (
      method === "insert" ||
      method === "update" ||
      method === "delete" ||
      method === "upsert"
    ) {
      operation = method.toUpperCase();
    }

    if (
      method === "eq" ||
      method === "neq" ||
      method === "gt" ||
      method === "gte" ||
      method === "lt" ||
      method === "lte" ||
      method === "in" ||
      method === "like" ||
      method === "ilike" ||
      method === "contains"
    ) {
      const columnArgument = call.arguments[0];
      const valueArgument = call.arguments[1];

      filters.push({
        operation: method,
        column: columnArgument
          ? (getStringValue(columnArgument) ?? columnArgument.getText())
          : undefined,
        value: valueArgument?.getText(),
      });
    }

    if (method === "single" || method === "maybeSingle") {
      filters.push({
        operation: method,
      });
    }
  }

  if (!table) {
    return null;
  }

  return {
    client: "supabase",
    operation,
    table,
    selectedFields,
    filters,
    sourceExpression: expressionText,
  };
}

function isNestedInsideCallChain(node: ts.CallExpression): boolean {
  const parent = node.parent;

  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    ts.isCallExpression(parent.parent)
  );
}

function collectDatabaseOperations(
  handler: ts.FunctionLikeDeclaration,
): DatabaseOperation[] {
  const operations: DatabaseOperation[] = [];
  const seen = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && !isNestedInsideCallChain(node)) {
      const operation = parseSupabaseOperation(node);

      if (operation) {
        const key = [
          operation.client,
          operation.operation,
          operation.table,
          operation.sourceExpression,
        ].join(":");

        if (!seen.has(key)) {
          seen.add(key);
          operations.push(operation);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  if (handler.body) {
    visit(handler.body);
  }

  return operations;
}

function parseExpressRoute(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  filePath: string,
): DiscoveredEndpoint | null {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }

  const methodName = node.expression.name.text.toLowerCase();

  if (!EXPRESS_METHODS.has(methodName)) {
    return null;
  }

  const routerExpression = node.expression.expression;

  if (
    !ts.isIdentifier(routerExpression) &&
    !ts.isPropertyAccessExpression(routerExpression)
  ) {
    return null;
  }

  const routePathArgument = node.arguments[0];

  if (!routePathArgument) {
    return null;
  }

  const handlerExpression = getHandlerExpression(node.arguments);

  if (!handlerExpression) {
    return null;
  }

  const handler = getHandlerNode(sourceFile, handlerExpression);

  const middleware = getMiddlewareInfo(node.arguments);

  return {
    kind: "route-definition",
    framework: "express",
    method: normalizeMethod(methodName),
    path: getRoutePath(routePathArgument),
    routerName: routerExpression.getText(),
    middleware,
    handlerName: getFunctionName(handlerExpression),
    requestInputs: handler ? collectRequestInputs(handler) : [],
    responses: handler ? collectResponses(sourceFile, handler) : [],
    databaseOperations: handler ? collectDatabaseOperations(handler) : [],
    source: getSourceLocation(sourceFile, node, filePath),
    confidence: handler ? "high" : "medium",
  };
}

export function analyzeExpressRoutes(
  sourceCode: string,
  filePath: string,
): DiscoveredEndpoint[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const endpoints: DiscoveredEndpoint[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const endpoint = parseExpressRoute(sourceFile, node, filePath);

      if (endpoint) {
        endpoints.push(endpoint);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return endpoints;
}
