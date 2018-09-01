import * as ts from "typescript";

function delint(sourceFile: ts.SourceFile) {
  delintNode(sourceFile);
  function delintNode(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.ClassDeclaration) {
      report(node, `Found class declaration!`);
    }
    node.forEachChild(delintNode);
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
    delint(sf);
  }
}

function reportDiagnostic(diagnostic: ts.Diagnostic) {
  console.error("Error", diagnostic.code, ":", ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine));
}

main();
