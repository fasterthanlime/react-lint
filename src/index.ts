import * as ts from "typescript";

const reactAmbientRegexp = /node_modules[\\/]@types[\\/]react[\\/]index.d.ts$/;
let ReactComponentSymbol: ts.Symbol;

function delint(checker: ts.TypeChecker, sourceFile: ts.SourceFile) {
  console.log(`======================================`);
  console.log(`Linting ${sourceFile.fileName}`);
  console.log(`======================================`);
  delintNode(sourceFile);

  function delintRender(node: ts.Node) {
    if (ts.isJsxExpression(node)) {
      report(node, `Found JSX expression!`);
      let sym = checker.getSymbolAtLocation(node);
      if (sym) {
        report(node, `Symbol name: ${sym.getName()}`);
      }
    }
    node.forEachChild(delintRender);
  }

  function delintNode(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      let cd = node as ts.ClassDeclaration;
      if (extendsReactComponent(cd)) {
        report(node, `Found react component!`);
        for (const m of cd.members) {
          if (ts.isMethodDeclaration(m)) {
            let id = m.name as ts.Identifier;
            if (id.escapedText === "render") {
              report(id, "Got a render method over here")
              delintRender(node);
            }
          }
        }
      }
    } else {
      node.forEachChild(delintNode);
    }
  }

  function extendsReactComponent(cd: ts.ClassDeclaration): boolean {
    console.log(`Visiting class ${cd.name ? cd.name.escapedText : "(anonymous)"}`);
    if (!cd.heritageClauses) {
      return false;
    }

    for (const hc of cd.heritageClauses) {
      if (hc.types)
        for (const hcTyp of hc.types) {
          let typ = checker.getTypeAtLocation(hcTyp.expression);
          let sym = typ.symbol;
          // console.log(`Symbol's name is ${sym.escapedName} (id = ${(sym as any).id})`);
          if (typ.symbol === ReactComponentSymbol) {
            console.log(`Hey that's React.Component!`);
            return true;
          } else {
            console.log(`Trying to find decl, has ${sym.getDeclarations().length}`);
            let symDecl = sym.getDeclarations()[0];
            if (ts.isClassDeclaration(symDecl)) {
              let pcd = symDecl as ts.ClassDeclaration;
              if (extendsReactComponent(pcd)) {
                return true;
              }
            }
          }
        }
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
  onUnRecoverableConfigFileDiagnostic: reportDiagnostic
};

function main() {
  const entryPoint = process.argv[2];
  console.log(`Lint root is ${entryPoint}`);

  const configPath = ts.findConfigFile(
    /* searchPath */ "./",
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) {
    throw new Error("Could not find a valid 'tsconfig.json'.");
  }
  console.log(`Using config file at ${configPath}`);
  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    host
  );
  let options = parsedCommandLine.options;
  const program = ts.createProgram([entryPoint], options);
  const checker = program.getTypeChecker();
  const allSourceFiles = program.getSourceFiles();

  let projectSourceFiles: ts.SourceFile[] = [];

  for (const sf of allSourceFiles) {
    if (sf.isDeclarationFile && reactAmbientRegexp.test(sf.fileName)) {
      let reactModule = checker.getSymbolAtLocation(sf);
      const exportAss = reactModule.exports.get(ts.createIdentifier("export=").escapedText).getDeclarations()[0] as ts.ExportAssignment;
      const exportExpr = exportAss.expression;
      const exportSym = checker.getSymbolAtLocation(exportExpr);
      let ComponentSym = exportSym.exports.get(ts.createIdentifier("Component").escapedText)
      ReactComponentSymbol = checker.getTypeAtLocation(ComponentSym.valueDeclaration).symbol;
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
  console.log(`React.Component's id is ${(ReactComponentSymbol as any).id}`);

  console.log(`Found ${projectSourceFiles.length} TSX files`);

  for (const sf of projectSourceFiles) {
    delint(checker, sf);
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
