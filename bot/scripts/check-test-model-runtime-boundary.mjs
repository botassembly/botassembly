#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const HELPER = "tests/support/native-model-runtime.ts";
const PACKAGE = "@earendil-works/pi-coding-agent";
const TEST_SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"]);

function scriptKind(path) {
  const extension = extname(path);
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function packageCall(node, kind) {
  return ts.isCallExpression(node) && node.expression.kind === kind && node.arguments.length === 1
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === PACKAGE;
}

function lineViolation(sourceFile, path, node) {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  return `${path}:${line}: import only the ModelRuntime type; use nativeModelRuntime for native construction`;
}

export function directNativeRuntimeCreations(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const violations = [];
  const record = (node) => { violations.push(lineViolation(sourceFile, path, node)); };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (node.moduleSpecifier.text === PACKAGE && bindings !== undefined && ts.isNamespaceImport(bindings)) record(node);
      if (bindings !== undefined && ts.isNamedImports(bindings) && clause?.isTypeOnly !== true) {
        for (const element of bindings.elements) {
          if (element.isTypeOnly !== true && (element.propertyName?.text ?? element.name.text) === "ModelRuntime") record(element);
        }
      }
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression !== undefined && ts.isStringLiteral(node.moduleReference.expression)
      && node.moduleReference.expression.text === PACKAGE) record(node);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === PACKAGE && node.isTypeOnly !== true) {
      if (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause)) record(node);
      else if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          if (element.isTypeOnly !== true && (element.propertyName?.text ?? element.name.text) === "ModelRuntime") record(element);
        }
      }
    }
    if (packageCall(node, ts.SyntaxKind.ImportKeyword) || packageCall(node, ts.SyntaxKind.Identifier)
      && ts.isIdentifier(node.expression) && node.expression.text === "require") record(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...new Set(violations)];
}

export function testSourceModelRuntimeViolations(path, source) {
  return path === HELPER ? [] : directNativeRuntimeCreations(path, source);
}

function testSources(root) {
  const tests = join(root, "tests"), files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && TEST_SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
    }
  };
  walk(tests);
  return files;
}

export function checkTestModelRuntimeBoundary(root) {
  const absolute = resolve(root), violations = [];
  for (const path of testSources(absolute)) {
    const named = relative(absolute, path);
    violations.push(...testSourceModelRuntimeViolations(named, readFileSync(path, "utf8")));
  }
  return violations;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = checkTestModelRuntimeBoundary(new URL("..", import.meta.url).pathname);
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
  }
}
