import * as ts from "typescript";
import {isEmpty} from "underscore";

function delint(checker: ts.TypeChecker, sourceFile: ts.SourceFile) {
  delintNode(sourceFile);
  function delintNode(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.ClassDeclaration) {
      let cd = node as ts.ClassDeclaration;
      if (extendsReactComponent(cd)) {
        report(node, `Found react component!`);
      }
      debugger;
    } else {
      node.forEachChild(delintNode);
    }
  }

  function extendsReactComponent(cd: ts.ClassDeclaration): boolean {
      if (isEmpty(cd.heritageClauses)) {
        return false;
      }

      const hc = cd.heritageClauses[0];
      if (isEmpty(hc.types)) {
        return false;
      }

      const extendsType = hc.types[0].expression;
      // we assume the component does `class Foo extends React.PureComponent`
      // this won't work with `class Foo extends PureComponent`, etc. we don't
      // resolve anything.
      if (extendsType.kind !== ts.SyntaxKind.PropertyAccessExpression) {
        return false;
      }

      let pa = extendsType as ts.PropertyAccessExpression;
      const lhsExpr = pa.expression;
      if (lhsExpr.kind !== ts.SyntaxKind.Identifier) {
        return false;
      }
      const lhs = (lhsExpr as ts.Identifier).escapedText;
      if (lhs !== "React") {
        return false;
      }
      const rhs = pa.name.escapedText;
      if (rhs === "PureComponent" || rhs === "Component") {
        return true;
      }
      return false;
  }

  function report(node: ts.Node, message: string) {
    let { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    console.log(
      `${sourceFile.fileName} (${line + 1},${character + 1}): ${message}`
    );
  }
}

const host: ts.ParseConfigFileHost = {
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  fileExists: ts.sys.fileExists,
  readDirectory: ts.sys.readDirectory,
  readFile: ts.sys.readFile,
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  onUnRecoverableConfigFileDiagnostic: reportDiagnostic,
}

function main() {
  const entryPoint = process.argv[2];
  console.log(`Lint root is ${entryPoint}`);

  const configPath = ts.findConfigFile(
    /* searchPath */ "./",
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) {
    throw new Error("Could not find a valid 'tsconfig.json'.")
  }
  console.log(`Using config file at ${configPath}`);
  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(configPath, {}, host);
  let options = {...parsedCommandLine.options};
  options.skipLibCheck = true;
  options.skipDefaultLibCheck = true;
  const program = ts.createProgram([entryPoint], options)
  const checker = program.getTypeChecker();
  const allSourceFiles = program.getSourceFiles();

  let projectSourceFiles: ts.SourceFile[] = [];

  for (const sf of allSourceFiles) {
    if (sf.isDeclarationFile) {
      continue
    }

    if (!/.tsx$/i.test(sf.fileName)) {
      continue
    }

    projectSourceFiles.push(sf);
  }
  console.log(`Found ${projectSourceFiles.length} TSX files`);

  for (const sf of projectSourceFiles) {
    delint(checker, sf);
  }
}

function reportDiagnostic(diagnostic: ts.Diagnostic) {
  console.error("Error", diagnostic.code, ":", ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine));
}

main();
