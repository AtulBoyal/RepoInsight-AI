import path from "node:path";
import ts from "typescript";

import type { RepositoryFile } from "../../types/repository.js";

/**
 * Facts extracted from JavaScript/TypeScript files with the
 * TypeScript compiler's parser (syntax only, no type checking).
 * Static analysis counts and evidence locations are both derived
 * from these facts, so they always agree.
 */

export interface FunctionFact {
  file: string;
  line: number;
  name: string;
  length: number;
}

export type TypeScriptIssueType =
  | "any"
  | "type-assertion"
  | "ts-ignore"
  | "eslint-disable";

export type LoggingType =
  | "console.log"
  | "console.error"
  | "console.warn"
  | "debugger"
  | "process.exit";

export interface LocatedFact<Type extends string> {
  file: string;
  line: number;
  type: Type;
}

export interface SourceFacts {
  /** Files that were parsed (JS/TS family). */
  parsedFiles: number;
  functions: FunctionFact[];
  typescript: LocatedFact<TypeScriptIssueType>[];
  logging: LocatedFact<LoggingType>[];
}

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};

const CONSOLE_METHODS: Record<string, LoggingType> = {
  log: "console.log",
  info: "console.log",
  debug: "console.log",
  error: "console.error",
  warn: "console.warn",
};

const SUPPRESSION_COMMENT =
  /(\/\/|\/\*|^\s*\*).*?(@ts-ignore|@ts-nocheck|eslint-disable)/;

function functionName(node: ts.FunctionLikeDeclaration): string {
  if (node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  if (node.name && ts.isPropertyName(node.name)) {
    return node.name.getText();
  }

  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }

  const parent = node.parent;

  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent)) &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }

  if (ts.isExportAssignment(parent)) {
    return "default";
  }

  return "anonymous";
}

function isFunctionWithBlockBody(
  node: ts.Node,
): node is ts.FunctionLikeDeclaration {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.body !== undefined &&
    ts.isBlock(node.body)
  );
}

/**
 * `x as const` narrows a literal; it is not an unsafe cast.
 */
function isAsConst(node: ts.AsExpression): boolean {
  return (
    ts.isTypeReferenceNode(node.type) &&
    ts.isIdentifier(node.type.typeName) &&
    node.type.typeName.text === "const"
  );
}

function analyzeFile(file: RepositoryFile, facts: SourceFacts): void {
  const extension = path.extname(file.name).toLowerCase();
  const scriptKind = SCRIPT_KINDS[extension];

  if (scriptKind === undefined) {
    return;
  }

  facts.parsedFiles++;

  const source = ts.createSourceFile(
    file.relativePath,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const lineOf = (position: number) =>
    source.getLineAndCharacterOfPosition(position).line + 1;

  const visit = (node: ts.Node): void => {
    if (isFunctionWithBlockBody(node)) {
      const start = lineOf(node.getStart(source));
      const end = lineOf(node.getEnd());

      facts.functions.push({
        file: file.relativePath,
        line: start,
        name: functionName(node),
        length: end - start + 1,
      });
    }

    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      facts.typescript.push({
        file: file.relativePath,
        line: lineOf(node.getStart(source)),
        type: "any",
      });
    }

    if (
      (ts.isAsExpression(node) && !isAsConst(node)) ||
      ts.isTypeAssertionExpression(node)
    ) {
      facts.typescript.push({
        file: file.relativePath,
        line: lineOf(node.getStart(source)),
        type: "type-assertion",
      });
    }

    if (ts.isDebuggerStatement(node)) {
      facts.logging.push({
        file: file.relativePath,
        line: lineOf(node.getStart(source)),
        type: "debugger",
      });
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const object = node.expression.expression.text;
      const method = node.expression.name.text;

      const type =
        object === "console"
          ? CONSOLE_METHODS[method]
          : object === "process" && method === "exit"
            ? "process.exit"
            : undefined;

      if (type) {
        facts.logging.push({
          file: file.relativePath,
          line: lineOf(node.getStart(source)),
          type,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  // Suppression comments are not part of the syntax tree.
  file.content.split(/\r?\n/).forEach((text, index) => {
    const match = text.match(SUPPRESSION_COMMENT);

    if (match) {
      facts.typescript.push({
        file: file.relativePath,
        line: index + 1,
        type: match[2] === "eslint-disable" ? "eslint-disable" : "ts-ignore",
      });
    }
  });
}

export function extractSourceFacts(files: RepositoryFile[]): SourceFacts {
  const facts: SourceFacts = {
    parsedFiles: 0,
    functions: [],
    typescript: [],
    logging: [],
  };

  for (const file of files) {
    analyzeFile(file, facts);
  }

  return facts;
}
