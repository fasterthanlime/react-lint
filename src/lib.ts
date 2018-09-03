import * as ts from "typescript";

type ReportDiagnostic = (diag: ts.Diagnostic) => void;

const REACT_LINT_ERROR_CODE = 420000;

const reactAmbientRegexp = /node_modules[\\/]@types[\\/]react[\\/]index.d.ts$/;

function getReactComponentSymbol(program: ts.Program): ts.Symbol {
  const checker = program.getTypeChecker();
  const allSourceFiles = program.getSourceFiles();
  for (const sf of allSourceFiles) {
    if (sf.isDeclarationFile && reactAmbientRegexp.test(sf.fileName)) {
      let reactModule = checker.getSymbolAtLocation(sf);
      const exportAss = reactModule.exports
        .get(ts.createIdentifier("export=").escapedText)
        .getDeclarations()[0];
      if (ts.isExportAssignment(exportAss)) {
        const exportExpr = exportAss.expression;
        const exportSym = checker.getSymbolAtLocation(exportExpr);
        let ComponentSym = exportSym.exports.get(
          ts.createIdentifier("Component").escapedText
        );
        return checker.getTypeAtLocation(ComponentSym.valueDeclaration).symbol;
      }
    }
  }

  throw new Error(`Could not find type of 'React.Component'`);
}

export function makeLinter(
  program: ts.Program,
  reportDiagnostic: ReportDiagnostic
) {
  const checker = program.getTypeChecker();
  const ReactComponentSymbol = getReactComponentSymbol(program);

  return function lint(sourceFile: ts.SourceFile) {
    lintNode(sourceFile);

    function lintProp(el: ts.JsxOpeningLikeElement, prop: ts.Node) {
      if (!ts.isJsxAttribute(prop)) {
        return;
      }

      const { initializer } = prop;
      if (!initializer) {
        return;
      }

      if (!ts.isJsxExpression(initializer)) {
        return;
      }

      if (ts.isArrowFunction(initializer.expression)) {
        const tagName = el.tagName.getText(sourceFile);
        const propName = prop.name.escapedText;
        report(
          initializer,
          `Anti-pattern <${tagName} ${propName}={() => {}}/>`
        );
      }
    }

    function lintRender(node: ts.Node) {
      if (ts.isJsxOpeningLikeElement(node)) {
        for (const prop of node.attributes.properties) {
          lintProp(node, prop);
        }
      }
      node.forEachChild(lintRender);
    }

    function lintNode(node: ts.Node) {
      if (ts.isClassDeclaration(node)) {
        if (extendsReactComponent(node)) {
          for (const m of node.members) {
            if (ts.isMethodDeclaration(m)) {
              if (ts.isIdentifier(m.name)) {
                if (m.name.escapedText === "render") {
                  lintRender(node);
                }
              }
            }
          }
        }
      } else {
        node.forEachChild(lintNode);
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
      let start = node.getStart(sourceFile);
      let end = node.getEnd();

      let diag: ts.Diagnostic = {
        file: sourceFile,
        start: start,
        length: end - start,
        messageText: message,
        category: ts.DiagnosticCategory.Warning,
        source: "react-lint",
        code: REACT_LINT_ERROR_CODE
      };
      reportDiagnostic(diag);
    }
  };
}
