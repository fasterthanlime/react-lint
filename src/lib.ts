import * as ts from "typescript";

type ReportDiagnostic = (diag: ts.Diagnostic) => void;

const REACT_LINT_ERROR_CODE = 420000;

type Log = (message: string) => void;

export function makeLinter(
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
      log(`Traversing node ${ts.SyntaxKind[node.kind]}`);

      if (ts.isClassDeclaration(node)) {
        log(`Found class`);
        if (extendsReactComponent(node)) {
          log(`It does extend React.Component`);
          for (const m of node.members) {
            if (ts.isMethodDeclaration(m)) {
              if (ts.isIdentifier(m.name)) {
                if (m.name.escapedText === "render") {
                  log(`Found render method`);
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
      typeDecl: ts.ClassDeclaration | ts.InterfaceDeclaration
    ): boolean {
      if (typeDecl.name.escapedText === "Component") {
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
              ts.isClassDeclaration(symDecl) ||
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
