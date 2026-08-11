using Microsoft.CodeAnalysis;

namespace Owl.Gen.Model;

/// <summary>
/// Safe access to documentation comment ids.
/// </summary>
/// <remarks>
/// <para>
/// Two problems this exists to solve. First,
/// <c>ISymbol.GetDocumentationCommentId()</c> throws a
/// <see cref="NullReferenceException"/> from inside Roslyn's own
/// <c>DocumentationCommentIDVisitor</c> when handed a constructed generic
/// whose type arguments are themselves type parameters, which happens
/// routinely for a cref like <c>IEnumerable{T}</c>. Second, a doc id for a
/// constructed type would be the wrong link target anyway: documentation
/// lives on the open definition.
/// </para>
/// <para>
/// Going through <c>OriginalDefinition</c> fixes both. The try/catch stays as
/// a guard because the failure is inside library code we do not control.
/// </para>
/// </remarks>
static class DocIds
{
  /// <summary>
  /// Doc id of a symbol's original definition, or null if it has none.
  /// </summary>
  public static string? Of(ISymbol? symbol)
  {
    if (symbol is null)
    {
      return null;
    }

    // Type parameters and namespaces have no addressable documentation.
    if (symbol.Kind is SymbolKind.TypeParameter or SymbolKind.Namespace or SymbolKind.Preprocessing)
    {
      return null;
    }

    ISymbol definition = symbol.OriginalDefinition ?? symbol;

    try
    {
      return definition.GetDocumentationCommentId();
    }
    catch (Exception)
    {
      return null;
    }
  }

  /// <summary>
  /// Doc id for a type reference, unwrapping arrays and pointers so
  /// <c>Brep[]</c> still links to <c>Brep</c>.
  /// </summary>
  public static string? OfType(ITypeSymbol? type) => Of(Unwrap(type));

  /// <summary>
  /// What an array or a pointer is ultimately of, and any other type
  /// unchanged.
  /// </summary>
  /// <remarks>
  /// Everything a reference records is a fact about this symbol rather than
  /// about the array around it: neither an array nor a pointer has a
  /// documentation id or a containing assembly of its own, so asking one for
  /// either answers nothing, which is how <c>Brep[]</c> came to be filed as
  /// living outside the documented set.
  /// </remarks>
  public static ITypeSymbol? Unwrap(ITypeSymbol? type)
  {
    while (true)
    {
      switch (type)
      {
        case IArrayTypeSymbol array:
          type = array.ElementType;
          continue;
        case IPointerTypeSymbol pointer:
          type = pointer.PointedAtType;
          continue;
        default:
          return type;
      }
    }
  }

  /// <summary>
  /// The XML string Roslyn has for a symbol, guarded the same way.
  /// </summary>
  public static string? DocumentationXml(ISymbol symbol)
  {
    try
    {
      return symbol.OriginalDefinition.GetDocumentationCommentXml();
    }
    catch (Exception)
    {
      return null;
    }
  }
}
