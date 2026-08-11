using Microsoft.CodeAnalysis;

// Both language namespaces are imported rather than aliased, because GetSymbolInfo for a cref is an
// extension method in each and an alias would leave neither in scope. Nothing here names a type from
// them directly, so the overlap between the two never comes up.
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.VisualBasic;

// The syntax namespaces, on the other hand, collide on almost every name they hold.
using CSS = Microsoft.CodeAnalysis.CSharp.Syntax;
using VBS = Microsoft.CodeAnalysis.VisualBasic.Syntax;

namespace Owl.Gen.Parse;

/// <summary>
/// What one node of a documentation comment's XML is, as far as
/// <see cref="DocCommentParser"/> cares.
/// </summary>
enum DocXmlKind
{
  /// <summary>Anything the parser has no use for, such as a comment.</summary>
  Other,

  /// <summary>Literal text, including a CDATA section.</summary>
  Text,

  /// <summary>An element with content, <c>&lt;summary&gt;...&lt;/summary&gt;</c>.</summary>
  Element,

  /// <summary>An element without, <c>&lt;see cref="X"/&gt;</c>.</summary>
  EmptyElement,
}

/// <summary>
/// Reads one language's documentation-comment XML.
/// </summary>
/// <remarks>
/// <para>
/// C# and Visual Basic each have their own <c>XmlElementSyntax</c>,
/// <c>XmlTextSyntax</c> and the rest, and neither set derives from the other -
/// they are unrelated types that happen to describe the same XML. This interface
/// is where that difference stops. Everything above it works on
/// <see cref="SyntaxNode"/> and asks questions instead of matching types, so
/// <see cref="DocCommentParser"/> - which is the bulk of the reading, and all of
/// the judgement about what a tag means - exists once rather than twice.
/// </para>
/// <para>
/// Deliberately not an attempt at a general XML abstraction. It answers exactly
/// what the parser asks and nothing more, and the two implementations are meant
/// to be read side by side: where they disagree, one of them is wrong.
/// </para>
/// </remarks>
interface IDocXmlReader
{
  /// <summary>
  /// The children of an element, or of the comment itself. Empty for anything
  /// that cannot have any.
  /// </summary>
  IReadOnlyList<SyntaxNode> Content(SyntaxNode node);

  /// <summary>Which of the four shapes this node is.</summary>
  DocXmlKind KindOf(SyntaxNode node);

  /// <summary>
  /// The tag name as written, or null when the node is not an element.
  /// </summary>
  string? ElementName(SyntaxNode node);

  /// <summary>
  /// The literal text of a text or CDATA node, with the comment's exterior
  /// markers - <c>///</c> or <c>'''</c> - already gone.
  /// </summary>
  string TextOf(SyntaxNode node);

  /// <summary>
  /// The <c>name</c> attribute of a <c>&lt;param&gt;</c> or
  /// <c>&lt;paramref&gt;</c>, which both languages give a syntax node of its
  /// own before falling back to an ordinary attribute.
  /// </summary>
  string? NameAttribute(SyntaxNode node);

  /// <summary>
  /// A plain attribute's value, matched case-insensitively, or null when the
  /// node does not carry one by that name.
  /// </summary>
  string? TextAttribute(SyntaxNode node, string name);

  /// <summary>
  /// The <c>cref</c> attribute's reference, ready to be resolved, or null when
  /// there is none.
  /// </summary>
  SyntaxNode? Cref(SyntaxNode node);

  /// <summary>
  /// Binds a reference from <see cref="Cref"/> against the model of the tree it
  /// was written in.
  /// </summary>
  SymbolInfo Bind(SemanticModel model, SyntaxNode cref);
}

/// <summary>
/// The C# reading of a documentation comment.
/// </summary>
sealed class CSharpDocXmlReader : IDocXmlReader
{
  /// <summary>The one instance; nothing here is stateful.</summary>
  public static readonly IDocXmlReader Instance = new CSharpDocXmlReader();

  CSharpDocXmlReader()
  {
  }

  /// <inheritdoc/>
  public IReadOnlyList<SyntaxNode> Content(SyntaxNode node) => node switch
  {
    CSS.DocumentationCommentTriviaSyntax trivia => trivia.Content,
    CSS.XmlElementSyntax element => element.Content,
    _ => [],
  };

  /// <inheritdoc/>
  public DocXmlKind KindOf(SyntaxNode node) => node switch
  {
    CSS.XmlTextSyntax or CSS.XmlCDataSectionSyntax => DocXmlKind.Text,
    CSS.XmlEmptyElementSyntax => DocXmlKind.EmptyElement,
    CSS.XmlElementSyntax => DocXmlKind.Element,
    _ => DocXmlKind.Other,
  };

  /// <inheritdoc/>
  public string? ElementName(SyntaxNode node) => node switch
  {
    CSS.XmlElementSyntax element => element.StartTag.Name.ToString(),
    CSS.XmlEmptyElementSyntax empty => empty.Name.ToString(),
    _ => null,
  };

  /// <inheritdoc/>
  public string TextOf(SyntaxNode node) => node switch
  {
    // ValueText is what strips the '///' for us.
    CSS.XmlTextSyntax text => string.Concat(text.TextTokens.Select(t => t.ValueText)),
    CSS.XmlCDataSectionSyntax cdata => string.Concat(cdata.TextTokens.Select(t => t.ValueText)),
    _ => "",
  };

  /// <inheritdoc/>
  public string? NameAttribute(SyntaxNode node)
  {
    foreach (CSS.XmlAttributeSyntax attribute in Attributes(node))
    {
      if (attribute is CSS.XmlNameAttributeSyntax named)
      {
        return named.Identifier.Identifier.ValueText;
      }
    }

    return TextAttribute(node, "name");
  }

  /// <inheritdoc/>
  public string? TextAttribute(SyntaxNode node, string name)
  {
    foreach (CSS.XmlAttributeSyntax attribute in Attributes(node))
    {
      if (attribute is CSS.XmlTextAttributeSyntax text &&
          text.Name.ToString().Equals(name, StringComparison.OrdinalIgnoreCase))
      {
        return string.Concat(text.TextTokens.Select(t => t.ValueText)).Trim();
      }
    }

    return null;
  }

  /// <inheritdoc/>
  public SyntaxNode? Cref(SyntaxNode node)
  {
    return Attributes(node).OfType<CSS.XmlCrefAttributeSyntax>().FirstOrDefault()?.Cref;
  }

  /// <inheritdoc/>
  public SymbolInfo Bind(SemanticModel model, SyntaxNode cref)
  {
    return cref is CSS.CrefSyntax syntax ? model.GetSymbolInfo(syntax) : default;
  }

  static SyntaxList<CSS.XmlAttributeSyntax> Attributes(SyntaxNode node) => node switch
  {
    CSS.XmlElementSyntax element => element.StartTag.Attributes,
    CSS.XmlEmptyElementSyntax empty => empty.Attributes,
    _ => default,
  };
}

/// <summary>
/// The Visual Basic reading of a documentation comment.
/// </summary>
/// <remarks>
/// Shaped differently from the C# one in two places. An attribute here is an
/// <c>XmlNodeSyntax</c> rather than a member of an attribute-only hierarchy, so
/// the list has to be filtered rather than typed; and an ordinary attribute
/// keeps its value in a nested <c>XmlStringSyntax</c> instead of on the
/// attribute itself.
/// </remarks>
sealed class VisualBasicDocXmlReader : IDocXmlReader
{
  /// <summary>The one instance; nothing here is stateful.</summary>
  public static readonly IDocXmlReader Instance = new VisualBasicDocXmlReader();

  VisualBasicDocXmlReader()
  {
  }

  /// <inheritdoc/>
  public IReadOnlyList<SyntaxNode> Content(SyntaxNode node) => node switch
  {
    VBS.DocumentationCommentTriviaSyntax trivia => trivia.Content,
    VBS.XmlElementSyntax element => element.Content,
    _ => [],
  };

  /// <inheritdoc/>
  public DocXmlKind KindOf(SyntaxNode node) => node switch
  {
    VBS.XmlTextSyntax or VBS.XmlCDataSectionSyntax => DocXmlKind.Text,
    VBS.XmlEmptyElementSyntax => DocXmlKind.EmptyElement,
    VBS.XmlElementSyntax => DocXmlKind.Element,
    _ => DocXmlKind.Other,
  };

  /// <inheritdoc/>
  public string? ElementName(SyntaxNode node) => node switch
  {
    VBS.XmlElementSyntax element => element.StartTag.Name.ToString(),
    VBS.XmlEmptyElementSyntax empty => empty.Name.ToString(),
    _ => null,
  };

  /// <inheritdoc/>
  public string TextOf(SyntaxNode node) => node switch
  {
    // ValueText is what strips the ''' for us.
    VBS.XmlTextSyntax text => string.Concat(text.TextTokens.Select(t => t.ValueText)),
    VBS.XmlCDataSectionSyntax cdata => string.Concat(cdata.TextTokens.Select(t => t.ValueText)),
    _ => "",
  };

  /// <inheritdoc/>
  public string? NameAttribute(SyntaxNode node)
  {
    foreach (SyntaxNode attribute in Attributes(node))
    {
      if (attribute is VBS.XmlNameAttributeSyntax named)
      {
        return named.Reference.Identifier.ValueText;
      }
    }

    return TextAttribute(node, "name");
  }

  /// <inheritdoc/>
  public string? TextAttribute(SyntaxNode node, string name)
  {
    foreach (SyntaxNode attribute in Attributes(node))
    {
      if (attribute is VBS.XmlAttributeSyntax plain &&
          plain.Name.ToString().Equals(name, StringComparison.OrdinalIgnoreCase))
      {
        return plain.Value is VBS.XmlStringSyntax value
            ? string.Concat(value.TextTokens.Select(t => t.ValueText)).Trim()
            : plain.Value.ToString().Trim();
      }
    }

    return null;
  }

  /// <inheritdoc/>
  public SyntaxNode? Cref(SyntaxNode node)
  {
    return Attributes(node).OfType<VBS.XmlCrefAttributeSyntax>().FirstOrDefault()?.Reference;
  }

  /// <inheritdoc/>
  public SymbolInfo Bind(SemanticModel model, SyntaxNode cref)
  {
    return cref is VBS.CrefReferenceSyntax syntax ? model.GetSymbolInfo(syntax) : default;
  }

  static SyntaxList<VBS.XmlNodeSyntax> Attributes(SyntaxNode node) => node switch
  {
    VBS.XmlElementSyntax element => element.StartTag.Attributes,
    VBS.XmlEmptyElementSyntax empty => empty.Attributes,
    _ => default,
  };
}
