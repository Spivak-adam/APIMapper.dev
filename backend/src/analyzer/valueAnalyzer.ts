import * as ts from "typescript";
import { ResponseProperty } from "../models/Endpoint.js";

function cleanPropertyName(name: ts.PropertyName): string {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return name.getText();
}

function inferPrimitiveType(expression: ts.Expression): string {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return "string";
  }

  if (ts.isNumericLiteral(expression)) {
    return "number";
  }

  if (
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return "boolean";
  }

  if (
    expression.kind === ts.SyntaxKind.NullKeyword ||
    expression.kind === ts.SyntaxKind.UndefinedKeyword
  ) {
    return "null";
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return "array";
  }

  if (ts.isObjectLiteralExpression(expression)) {
    return "object";
  }

  if (
    ts.isArrowFunction(expression) ||
    ts.isFunctionExpression(expression)
  ) {
    return "function";
  }

  if (ts.isNewExpression(expression)) {
    return expression.expression.getText();
  }

  return "unknown";
}

function findVariableDeclaration(
  scope: ts.Node,
  variableName: string
): ts.VariableDeclaration | null {
  let result: ts.VariableDeclaration | null = null;

  function visit(node: ts.Node): void {
    if (result) {
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName
    ) {
      result = node;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(scope);

  return result;
}

function analyzeArrayExpression(
  sourceFile: ts.SourceFile,
  expression: ts.ArrayLiteralExpression,
  visitedVariables: Set<string>,
  scope: ts.Node
): ResponseProperty {
  const firstElement = expression.elements[0];

  return {
    name: "response",
    type: "array",
    nullable: false,
    items: firstElement
      ? [
          analyzeExpression(
            sourceFile,
            firstElement,
            "item",
            visitedVariables,
            scope
          )
        ]
      : []
  };
}

function analyzeMapCall(
  sourceFile: ts.SourceFile,
  expression: ts.CallExpression,
  propertyName: string,
  visitedVariables: Set<string>,
  scope: ts.Node
): ResponseProperty | null {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return null;
  }

  if (expression.expression.name.text !== "map") {
    return null;
  }

  const callback = expression.arguments[0];

  if (
    !callback ||
    (!ts.isArrowFunction(callback) &&
      !ts.isFunctionExpression(callback))
  ) {
    return {
      name: propertyName,
      type: "array",
      nullable: false,
      items: []
    };
  }

  let returnedExpression: ts.Expression | null = null;

  if (ts.isBlock(callback.body)) {
    for (const statement of callback.body.statements) {
      if (
        ts.isReturnStatement(statement) &&
        statement.expression
      ) {
        returnedExpression = statement.expression;
        break;
      }
    }
  } else {
    returnedExpression = callback.body;
  }

  if (!returnedExpression) {
    return {
      name: propertyName,
      type: "array",
      nullable: false,
      items: []
    };
  }

  return {
    name: propertyName,
    type: "array",
    nullable: false,
    expression: expression.getText(),
    items: [
      analyzeExpression(
        sourceFile,
        returnedExpression,
        "item",
        visitedVariables,
        scope
      )
    ]
  };
}

function analyzeObjectExpression(
  sourceFile: ts.SourceFile,
  expression: ts.ObjectLiteralExpression,
  propertyName: string,
  visitedVariables: Set<string>,
  scope: ts.Node
): ResponseProperty {
  const properties: ResponseProperty[] = [];

  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property)) {
      const name = cleanPropertyName(property.name);

      properties.push(
        analyzeExpression(
          sourceFile,
          property.initializer,
          name,
          visitedVariables,
          scope
        )
      );

      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      const name = property.name.text;

      properties.push(
        analyzeIdentifier(
          sourceFile,
          property.name,
          name,
          visitedVariables,
          scope
        )
      );

      continue;
    }

    if (ts.isSpreadAssignment(property)) {
      properties.push({
        name: "...spread",
        type: "unknown",
        nullable: false,
        expression: property.expression.getText()
      });
    }
  }

  return {
    name: propertyName,
    type: "object",
    nullable: false,
    expression: expression.getText(),
    properties
  };
}

function analyzeIdentifier(
  sourceFile: ts.SourceFile,
  expression: ts.Identifier,
  propertyName: string,
  visitedVariables: Set<string>,
  scope: ts.Node
): ResponseProperty {
  const variableName = expression.text;

  if (visitedVariables.has(variableName)) {
    return {
      name: propertyName,
      type: "unknown",
      nullable: false,
      expression: variableName
    };
  }

  const declaration = findVariableDeclaration(
    scope,
    variableName
  );

  if (!declaration?.initializer) {
    return {
      name: propertyName,
      type: "unknown",
      nullable: false,
      expression: variableName
    };
  }

  const nextVisitedVariables = new Set(
    visitedVariables
  );

  nextVisitedVariables.add(variableName);

  return analyzeExpression(
    sourceFile,
    declaration.initializer,
    propertyName,
    nextVisitedVariables,
    scope
  );
}

function analyzeBinaryExpression(
  sourceFile: ts.SourceFile,
  expression: ts.BinaryExpression,
  propertyName: string,
  visitedVariables: Set<string>,
  scope: ts.Node
): ResponseProperty {
  const operator = expression.operatorToken.kind;

  const booleanOperators = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.InKeyword,
    ts.SyntaxKind.InstanceOfKeyword
  ]);

  if (booleanOperators.has(operator)) {
    return {
      name: propertyName,
      type: "boolean",
      nullable: false,
      expression: expression.getText()
    };
  }

  const isNullableFallback =
    operator === ts.SyntaxKind.BarBarToken ||
    operator === ts.SyntaxKind.QuestionQuestionToken;

  if (isNullableFallback) {
    const rightIsNull =
      expression.right.kind ===
        ts.SyntaxKind.NullKeyword ||
      expression.right.kind ===
        ts.SyntaxKind.UndefinedKeyword;

    const analyzedLeft = analyzeExpression(
      sourceFile,
      expression.left,
      propertyName,
      visitedVariables,
      scope
    );

    return {
      ...analyzedLeft,
      nullable:
        analyzedLeft.nullable || rightIsNull,
      expression: expression.getText()
    };
  }

  return {
    name: propertyName,
    type: "unknown",
    nullable: false,
    expression: expression.getText()
  };
}

export function analyzeExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  propertyName = "response",
  visitedVariables = new Set<string>(),
  scope: ts.Node = sourceFile
): ResponseProperty {
  if (ts.isParenthesizedExpression(expression)) {
    return analyzeExpression(
      sourceFile,
      expression.expression,
      propertyName,
      visitedVariables,
      scope
    );
  }

  if (ts.isAsExpression(expression)) {
    return analyzeExpression(
      sourceFile,
      expression.expression,
      propertyName,
      visitedVariables,
      scope
    );
  }

  if (ts.isTypeAssertionExpression(expression)) {
    return analyzeExpression(
      sourceFile,
      expression.expression,
      propertyName,
      visitedVariables,
      scope
    );
  }

  if (ts.isNonNullExpression(expression)) {
    return analyzeExpression(
      sourceFile,
      expression.expression,
      propertyName,
      visitedVariables,
      scope
    );
  }

  if (ts.isObjectLiteralExpression(expression)) {
    return analyzeObjectExpression(
      sourceFile,
      expression,
      propertyName,
      visitedVariables,
      scope
    );
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const result = analyzeArrayExpression(
      sourceFile,
      expression,
      visitedVariables,
      scope
    );

    return {
      ...result,
      name: propertyName
    };
  }

  if (ts.isIdentifier(expression)) {
    return analyzeIdentifier(
      sourceFile,
      expression,
      propertyName,
      visitedVariables,
      scope
    );
  }

  if (ts.isCallExpression(expression)) {
    const mapResult = analyzeMapCall(
      sourceFile,
      expression,
      propertyName,
      visitedVariables,
      scope
    );

    if (mapResult) {
      return mapResult;
    }
  }

  if (ts.isBinaryExpression(expression)) {
    return analyzeBinaryExpression(
      sourceFile,
      expression,
      propertyName,
      visitedVariables,
      scope
    );
  }

  if (ts.isConditionalExpression(expression)) {
    const whenTrue = analyzeExpression(
      sourceFile,
      expression.whenTrue,
      propertyName,
      visitedVariables,
      scope
    );

    const whenFalse = analyzeExpression(
      sourceFile,
      expression.whenFalse,
      propertyName,
      visitedVariables,
      scope
    );

    return {
      ...whenTrue,
      nullable:
        whenTrue.nullable ||
        whenFalse.nullable ||
        expression.whenFalse.kind ===
          ts.SyntaxKind.NullKeyword,
      expression: expression.getText()
    };
  }

  return {
    name: propertyName,
    type: inferPrimitiveType(expression),
    nullable:
      expression.kind === ts.SyntaxKind.NullKeyword ||
      expression.kind ===
        ts.SyntaxKind.UndefinedKeyword,
    expression: expression.getText()
  };
}