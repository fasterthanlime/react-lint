#!/usr/bin/env node

import * as ts from "typescript";
import { relative, dirname } from "path";
import * as meow from "meow";
import * as logSymbols from "log-symbols";

let ReactComponentSymbol: ts.Symbol;
let numReports = 0;

function delint(checker: ts.TypeChecker, sourceFile: ts.SourceFile) {
  delintNode(sourceFile);

  function delintRender(node: ts.Node) {
    if (ts.isJsxOpeningLikeElement(node)) {
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop)) {
          const {initializer} = prop;
          if (initializer) {
            if (ts.isJsxExpression(initializer)) {
              if (ts.isArrowFunction(initializer.expression)) {
                report(initializer, `Anti-pattern <${node.tagName.getText(sourceFile)} ${prop.name.escapedText}={() => {}}/>`)
              }
            }
          }
        }
      }
    }
    node.forEachChild(delintRender);
  }

  function delintNode(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      if (extendsReactComponent(node)) {
        for (const m of node.members) {
          if (ts.isMethodDeclaration(m)) {
            if (ts.isIdentifier(m.name)) {
              if (m.name.escapedText === "render") {
                delintRender(node);
              }
            }
          }
        }
      }
    } else {
      node.forEachChild(delintNode);
    }
  }

  function extendsReactComponent(cd: ts.ClassDeclaration): boolean {
    if (!cd.heritageClauses) {
      return false;
    }

    for (const hc of cd.heritageClauses) {
      if (hc.types)
        for (const hcTyp of hc.types) {
          let typ = checker.getTypeAtLocation(hcTyp.expression);
          let sym = typ.symbol;
          if (typ.symbol === ReactComponentSymbol) {
            return true;
          } else {
            let symDecl = sym.getDeclarations()[0];
            if (ts.isClassDeclaration(symDecl)) {
              if (extendsReactComponent(symDecl)) {
                return true;
              }
            }
          }
        }
    }
    return false;
  }

  function report(node: ts.Node, message: string) {
    numReports++;
    let { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    let fileName = sourceFile.fileName;
    fileName = relative(ts.sys.getCurrentDirectory(), fileName);
    console.log(logSymbols.warning,
      `${fileName} (${line + 1},${character + 1}): ${message}`
    );
  }
}

const host: ts.ParseConfigFileHost = {
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  fileExists: ts.sys.fileExists,
  readDirectory: ts.sys.readDirectory,
  readFile: ts.sys.readFile,
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  onUnRecoverableConfigFileDiagnostic: reportDiagnostic
};

const cli = meow(`
  Usage
    $ react-lint <root-tsx-file>
`)

function main() {
  if (cli.input.length !== 1) {
    cli.showHelp();
    process.exit(1);
  }

  const entryPoint = cli.input[0];

  const configPath = ts.findConfigFile(
    dirname(entryPoint),
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) {
    throw new Error("Could not find a valid 'tsconfig.json'.");
  }
  console.log(logSymbols.info, `Using config file at ${configPath}`);
  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    host
  );
  let options = parsedCommandLine.options;
  console.log(logSymbols.info, `Parsing project...`);

  const program = ts.createProgram([entryPoint], options);
  const checker = program.getTypeChecker();
  const allSourceFiles = program.getSourceFiles();

  let projectSourceFiles: ts.SourceFile[] = [];
  const reactAmbientRegexp = /node_modules[\\/]@types[\\/]react[\\/]index.d.ts$/;

  for (const sf of allSourceFiles) {
    if (sf.isDeclarationFile && reactAmbientRegexp.test(sf.fileName)) {
      let reactModule = checker.getSymbolAtLocation(sf);
      const exportAss = reactModule.exports.get(ts.createIdentifier("export=").escapedText).getDeclarations()[0];
      if (ts.isExportAssignment(exportAss)) {
        const exportExpr = exportAss.expression;
        const exportSym = checker.getSymbolAtLocation(exportExpr);
        let ComponentSym = exportSym.exports.get(ts.createIdentifier("Component").escapedText)
        ReactComponentSymbol = checker.getTypeAtLocation(ComponentSym.valueDeclaration).symbol;
      }
    }

    if (sf.isDeclarationFile) {
      continue;
    }

    if (!/.tsx$/i.test(sf.fileName)) {
      continue;
    }

    projectSourceFiles.push(sf);
  }
  if (!ReactComponentSymbol) {
    throw new Error(`Could not find type of 'React.Component'`);
  }

  console.log(logSymbols.info, `Linting ${projectSourceFiles.length} TSX files...`);

  for (const sf of projectSourceFiles) {
    delint(checker, sf);
  }
  if (numReports > 0) {
    console.log(logSymbols.error, `${numReports} problems reported`);
    process.exit(1);
  } else {
    console.log(logSymbols.success, `All clear!`);
  }
}

function reportDiagnostic(diagnostic: ts.Diagnostic) {
  console.error(
    "Error",
    diagnostic.code,
    ":",
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine)
  );
}

main();
