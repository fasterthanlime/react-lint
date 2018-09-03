#!/usr/bin/env node

import * as ts from "typescript";
import * as meow from "meow";
import * as logSymbols from "log-symbols";
import { dirname, relative } from "path";
import { makeLinter } from "./lib";

function reportDiagnostic(diagnostic: ts.Diagnostic) {
  console.error(
    "Error",
    diagnostic.code,
    ":",
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine)
  );
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
`);

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
  for (const sf of allSourceFiles) {
    if (!sf.isDeclarationFile && /.tsx$/i.test(sf.fileName)) {
      projectSourceFiles.push(sf);
    }
  }

  console.log(
    logSymbols.info,
    `Linting ${projectSourceFiles.length} TSX files...`
  );

  let numReports = 0;
  function reportDiagnostic(diag: ts.Diagnostic) {
    numReports++;
    let { line, character } = diag.file.getLineAndCharacterOfPosition(
      diag.start
    );
    let fileName = diag.file.fileName;
    fileName = relative(ts.sys.getCurrentDirectory(), fileName);
    console.log(
      logSymbols.warning,
      `${fileName} (${line + 1},${character + 1}): ${diag.messageText}`
    );
  }
  const lint = makeLinter(program, reportDiagnostic);

  for (const sourceFile of projectSourceFiles) {
    lint(sourceFile);
  }
  if (numReports > 0) {
    console.log(logSymbols.error, `${numReports} problems reported`);
    process.exit(1);
  } else {
    console.log(logSymbols.success, `All clear!`);
  }
}

main();
