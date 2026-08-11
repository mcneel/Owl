using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Owl.Gen.Parse;

/// <summary>
/// One documented declaration: the symbol, the doc comment trivia attached to
/// it, and where it was written.
/// </summary>
sealed class DeclaredSymbol
{
  /// <summary>The symbol this declaration introduces.</summary>
  public required ISymbol Symbol { get; init; }

  /// <summary>
  /// Its doc comment, or null when it carries none.
  /// </summary>
  /// <remarks>
  /// Held as a plain <see cref="SyntaxNode"/> because the two languages have
  /// their own <c>DocumentationCommentTriviaSyntax</c> and neither derives from
  /// the other. <see cref="DocCommentParser"/> is what reads one, through the
  /// language's <see cref="IDocXmlReader"/>.
  /// </remarks>
  public SyntaxNode? Doc { get; init; }

  /// <summary>The declaring syntax node, which fixes the source line.</summary>
  public required SyntaxNode Node { get; init; }

  /// <summary>The tree the declaration was written in.</summary>
  public required SyntaxTree Tree { get; init; }

  /// <summary>
  /// The model for <see cref="Tree"/>. Carried along because resolving a cref
  /// needs the model of the tree the doc comment was written in.
  /// </summary>
  public required SemanticModel Model { get; init; }

  /// <summary>Line number of the declaration, 1-based.</summary>
  public int Line => Node.SyntaxTree.GetLineSpan(Node.Span).StartLinePosition.Line + 1;
}

/// <summary>
/// Harvests documentation comments and source locations from one syntax tree,
/// whichever language it is written in.
/// </summary>
static class SourceFileWalker
{
  /// <summary>
  /// Walks one tree and returns every documented declaration found in it.
  /// </summary>
  /// <remarks>
  /// Dispatching on the model's own language rather than on anything owl was told keeps this honest
  /// for a compilation assembled from somewhere other than a capture.
  /// </remarks>
  public static List<DeclaredSymbol> Walk(SemanticModel model)
  {
    return model.Language == LanguageNames.VisualBasic
        ? VisualBasicWalker.Walk(model)
        : CSharpWalker.Walk(model);
  }
}

/// <summary>
/// The C# pass: documentation comments and source locations from one tree.
/// </summary>
/// <remarks>
/// <para>
/// A <see cref="CSharpSyntaxWalker"/> at
/// <see cref="SyntaxWalkerDepth.StructuredTrivia"/>, with one Visit override
/// per declaration kind. It carries a <see cref="SemanticModel"/>, so every
/// declaration resolves to a real <see cref="ISymbol"/> rather than a syntax
/// string.
/// </para>
/// <para>
/// The easily-missed declaration forms are all covered deliberately:
/// file-scoped namespaces, so <c>namespace Foo;</c> files are not invisible;
/// records; conversion operators; destructors; and individual variables inside
/// multi-declarator field and event declarations.
/// </para>
/// <para>
/// The results feed a symbol-driven builder rather than being the model
/// themselves. That split matters for partial types: this walker reports every
/// declaration, and the builder picks the one that actually carries
/// documentation, instead of trusting <c>DeclaringSyntaxReferences[0]</c> to
/// be the documented one.
/// </para>
/// </remarks>
sealed class CSharpWalker : CSharpSyntaxWalker
{
  readonly SemanticModel _model;
  readonly List<DeclaredSymbol> _declarations = [];

  CSharpWalker(SemanticModel model) : base(SyntaxWalkerDepth.StructuredTrivia)
  {
    _model = model;
  }

  /// <summary>
  /// Walks one tree and returns every documented declaration found in it.
  /// </summary>
  public static List<DeclaredSymbol> Walk(SemanticModel model)
  {
    var walker = new CSharpWalker(model);
    walker.Visit(model.SyntaxTree.GetRoot());
    return walker._declarations;
  }

  /// <summary>
  /// Pulls the doc comment attached to a declaration. Probing leading trivia
  /// is why the walker has to run at StructuredTrivia depth.
  /// </summary>
  static DocumentationCommentTriviaSyntax? DocOf(SyntaxNode node)
  {
    return node.GetLeadingTrivia()
        .Select(t => t.GetStructure())
        .OfType<DocumentationCommentTriviaSyntax>()
        .FirstOrDefault();
  }

  void Record(SyntaxNode node, ISymbol? symbol, DocumentationCommentTriviaSyntax? doc)
  {
    if (symbol is null)
    {
      return;
    }

    _declarations.Add(new DeclaredSymbol
    {
      Symbol = symbol,
      Doc = doc,
      Node = node,
      Tree = _model.SyntaxTree,
      Model = _model,
    });
  }

  void RecordDeclaration(SyntaxNode node)
  {
    Record(node, _model.GetDeclaredSymbol(node), DocOf(node));
  }

  // ---- Namespaces ------------------------------------------------------

  /// <inheritdoc/>
  public override void VisitNamespaceDeclaration(NamespaceDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitNamespaceDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitFileScopedNamespaceDeclaration(FileScopedNamespaceDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitFileScopedNamespaceDeclaration(node);
  }

  // ---- Types -----------------------------------------------------------

  /// <inheritdoc/>
  public override void VisitClassDeclaration(ClassDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitClassDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitStructDeclaration(StructDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitStructDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitInterfaceDeclaration(InterfaceDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitInterfaceDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitRecordDeclaration(RecordDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitRecordDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitEnumDeclaration(EnumDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitEnumDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitDelegateDeclaration(DelegateDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitDelegateDeclaration(node);
  }

  // ---- Members ---------------------------------------------------------

  /// <inheritdoc/>
  public override void VisitEnumMemberDeclaration(EnumMemberDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitEnumMemberDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitConstructorDeclaration(ConstructorDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitConstructorDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitDestructorDeclaration(DestructorDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitDestructorDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitMethodDeclaration(MethodDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitMethodDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitPropertyDeclaration(PropertyDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitPropertyDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitIndexerDeclaration(IndexerDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitIndexerDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitEventDeclaration(EventDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitEventDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitOperatorDeclaration(OperatorDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitOperatorDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitConversionOperatorDeclaration(ConversionOperatorDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitConversionOperatorDeclaration(node);
  }

  // Field and event-field declarations hold no symbol of their own: one declaration can
  // introduce several symbols ("public int A, B;"), and GetDeclaredSymbol returns null for
  // the declaration node. The doc comment sits on the declaration and applies to all of them.

  /// <inheritdoc/>
  public override void VisitFieldDeclaration(FieldDeclarationSyntax node)
  {
    RecordVariables(node, node.Declaration);
    base.VisitFieldDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitEventFieldDeclaration(EventFieldDeclarationSyntax node)
  {
    RecordVariables(node, node.Declaration);
    base.VisitEventFieldDeclaration(node);
  }

  void RecordVariables(SyntaxNode declaration, VariableDeclarationSyntax variables)
  {
    DocumentationCommentTriviaSyntax? doc = DocOf(declaration);

    foreach (VariableDeclaratorSyntax variable in variables.Variables)
    {
      Record(variable, _model.GetDeclaredSymbol(variable), doc);
    }
  }
}
