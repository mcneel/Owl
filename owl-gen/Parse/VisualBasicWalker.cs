using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.VisualBasic;
using Microsoft.CodeAnalysis.VisualBasic.Syntax;

namespace Owl.Gen.Parse;

/// <summary>
/// The Visual Basic pass: documentation comments and source locations from one
/// tree.
/// </summary>
/// <remarks>
/// <para>
/// The counterpart to <see cref="CSharpWalker"/>, reporting the same
/// <see cref="DeclaredSymbol"/> list under the same contract: every declaration
/// is recorded, and the builder decides which one carries the documentation.
/// </para>
/// <para>
/// Every override is on a <em>statement</em> rather than the block around it,
/// and that is the whole trick to reading VB. A <c>Function</c> with a body is a
/// MethodBlock wrapping a MethodStatement, while the same function on an
/// interface is a MethodStatement alone - recording the statement covers both,
/// where recording blocks would miss half of them and recording both would
/// report every implemented member twice.
/// </para>
/// <para>
/// One overload of TypeStatementSyntax serves Class, Module, Structure and
/// Interface, which is how VB models them; Module has no C# equivalent and
/// reaches the model as its own kind.
/// </para>
/// </remarks>
sealed class VisualBasicWalker : VisualBasicSyntaxWalker
{
  readonly SemanticModel _model;
  readonly List<DeclaredSymbol> _declarations = [];

  VisualBasicWalker(SemanticModel model) : base(SyntaxWalkerDepth.StructuredTrivia)
  {
    _model = model;
  }

  /// <summary>
  /// Walks one tree and returns every documented declaration found in it.
  /// </summary>
  public static List<DeclaredSymbol> Walk(SemanticModel model)
  {
    var walker = new VisualBasicWalker(model);
    walker.Visit(model.SyntaxTree.GetRoot());
    return walker._declarations;
  }

  /// <summary>
  /// Pulls the doc comment attached to a declaration.
  /// </summary>
  /// <remarks>
  /// VB writes these as <c>'''</c> lines, which land in the same structured
  /// trivia C# puts <c>///</c> in, so this is the C# probe with one type
  /// changed.
  /// </remarks>
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
  public override void VisitNamespaceStatement(NamespaceStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitNamespaceStatement(node);
  }

  // ---- Types -----------------------------------------------------------

  /// <inheritdoc/>
  public override void VisitClassStatement(ClassStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitClassStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitModuleStatement(ModuleStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitModuleStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitStructureStatement(StructureStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitStructureStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitInterfaceStatement(InterfaceStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitInterfaceStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitEnumStatement(EnumStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitEnumStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitDelegateStatement(DelegateStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitDelegateStatement(node);
  }

  // ---- Members ---------------------------------------------------------

  /// <inheritdoc/>
  public override void VisitEnumMemberDeclaration(EnumMemberDeclarationSyntax node)
  {
    RecordDeclaration(node);
    base.VisitEnumMemberDeclaration(node);
  }

  /// <inheritdoc/>
  public override void VisitSubNewStatement(SubNewStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitSubNewStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitMethodStatement(MethodStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitMethodStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitOperatorStatement(OperatorStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitOperatorStatement(node);
  }

  // A P/Invoke. VB declares these inline rather than as an attributed empty method, so without this
  // a project that talks to native code would be missing part of its surface.

  /// <inheritdoc/>
  public override void VisitDeclareStatement(DeclareStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitDeclareStatement(node);
  }

  // Covers the Default properties that reach the model as indexers, there being no separate syntax
  // for one in VB.

  /// <inheritdoc/>
  public override void VisitPropertyStatement(PropertyStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitPropertyStatement(node);
  }

  /// <inheritdoc/>
  public override void VisitEventStatement(EventStatementSyntax node)
  {
    RecordDeclaration(node);
    base.VisitEventStatement(node);
  }

  // A field declaration holds no symbol of its own: "Public A, B As Integer" is one declaration, two
  // declarators and two names, and the doc comment on the front of it applies to all of them. The
  // name - a ModifiedIdentifier, which is where an array's "()" hangs - is what carries the symbol.

  /// <inheritdoc/>
  public override void VisitFieldDeclaration(FieldDeclarationSyntax node)
  {
    DocumentationCommentTriviaSyntax? doc = DocOf(node);

    foreach (VariableDeclaratorSyntax declarator in node.Declarators)
    {
      foreach (ModifiedIdentifierSyntax name in declarator.Names)
      {
        Record(name, _model.GetDeclaredSymbol(name), doc);
      }
    }

    base.VisitFieldDeclaration(node);
  }
}
