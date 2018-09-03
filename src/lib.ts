import * as ts_module from "typescript/lib/tsserverlibrary";

export function initReactLint(modules: { typescript: typeof ts_module }) {
  const ts = modules.typescript;

  type ReportDiagnostic = (diag: ts.Diagnostic) => void;

  const REACT_LINT_ERROR_CODE = 420000;

  type Log = (message: string) => void;

  function makeLinter(
    program: ts.Program,
    reportDiagnostic: ReportDiagnostic,
    log: Log
  ) {
    const checker = program.getTypeChecker();

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
          report(
            prop.name,
            `Avoid using an arrow function as a prop. This will re-render needlessly.`
          );
        } else if (ts.isArrayLiteralExpression(initializer.expression)) {
          report(
            prop.name,
            `Avoid using an array literal as a prop. This will re-render needlessly.`
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
        if (ts.isClassLike(node)) {
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

      function extendsReactComponent(
        typeDecl: ts.ClassLikeDeclarationBase | ts.InterfaceDeclaration
      ): boolean {
        if (typeDecl.name && typeDecl.name.escapedText === "Component") {
          return true;
        }

        if (!typeDecl.heritageClauses) {
          return false;
        }

        for (const hc of typeDecl.heritageClauses) {
          if (hc.types)
            for (const hcTyp of hc.types) {
              let typ = checker.getTypeAtLocation(hcTyp.expression);
              let sym = typ.symbol;
              let symDecl = sym.getDeclarations()[0];
              if (
                ts.isClassLike(symDecl) ||
                ts.isInterfaceDeclaration(symDecl)
              ) {
                if (extendsReactComponent(symDecl)) {
                  return true;
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
  return { makeLinter };
}
