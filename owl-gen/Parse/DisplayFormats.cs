using Microsoft.CodeAnalysis;

namespace Owl.Gen.Parse;

/// <summary>
/// Renders a symbol in C# syntax, whatever language declared it.
/// </summary>
/// <remarks>
/// <para>
/// <c>ISymbol.ToDisplayString</c> renders in the symbol's own language, so a
/// Visual Basic assembly documented through it comes out reading
/// <c>Function Add(x As Integer) As String</c> and <c>List(Of T)</c>. Roslyn
/// also publishes each language's renderer on its own, which is what this
/// reaches for: one syntax across a site whose readers are overwhelmingly
/// writing C# against whatever the assembly happens to be written in.
/// </para>
/// <para>
/// Named and called explicitly rather than hidden behind an extension method,
/// because the whole point is that it is <em>not</em> the symbol's own language
/// - a call that quietly went back to <c>ToDisplayString</c> would keep
/// compiling and start emitting VB.
/// </para>
/// </remarks>
static class CSharpDisplay
{
  /// <summary>
  /// One symbol as C# would spell it.
  /// </summary>
  /// <param name="symbol">The symbol to render.</param>
  /// <param name="format">
  /// How much of it to include. Null gives Roslyn's error-message format, which
  /// is the fully-qualified reading used for identity rather than for display.
  /// </param>
  public static string Of(ISymbol symbol, SymbolDisplayFormat? format = null)
  {
    // A P/Invoke written the Visual Basic way - "Declare Function" rather than an attributed empty
    // method - is a MethodKind C# has no name for, and the C# renderer throws rather than guessing.
    // It is an ordinary static method in every way that matters here, so it is spelled out from its
    // parts: each parameter renders on its own without trouble.
    if (symbol is IMethodSymbol { MethodKind: MethodKind.DeclareMethod } declare)
    {
      string parameters = string.Join(", ", declare.Parameters.Select(p => Of(p, format)));
      return $"{declare.Name}({parameters})";
    }

    try
    {
      return Microsoft.CodeAnalysis.CSharp.SymbolDisplay.ToDisplayString(symbol, format);
    }
    catch (InvalidOperationException)
    {
      // Any other construct one language has and the other does not. Falling back to the symbol's
      // own language gives a signature that reads oddly beside its neighbours, which is a far better
      // outcome than losing the whole run to a member nobody could have predicted.
      return symbol.ToDisplayString(format);
    }
  }
}

/// <summary>
/// Symbol display formats used across the emitter.
/// </summary>
/// <remarks>
/// Letting Roslyn render names is why this tool compiles rather than doing
/// string surgery on the compiler's doc XML, which mangles generics to
/// <c>`1</c>, constructors to <c>#ctor</c>, by-ref parameters to <c>@</c> and
/// explicit implementations to <c>#</c>-separated names. Undoing all of that
/// takes real effort; none of it is needed when the symbol is in hand.
/// </remarks>
static class DisplayFormats
{
  /// <summary>
  /// Namespace-qualified type name with type parameters, e.g.
  /// Ns.Outer.Inner&lt;T&gt;.
  /// </summary>
  public static readonly SymbolDisplayFormat TypeFullName = new(
      globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
      typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypesAndNamespaces,
      genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
      miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes);

  /// <summary>
  /// Type name with containing types but no namespace, e.g.
  /// Outer.Inner&lt;T&gt;.
  /// </summary>
  public static readonly SymbolDisplayFormat TypeShortName = new(
      typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypes,
      genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
      miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes);

  /// <summary>
  /// How a type is rendered when referenced from a signature or a cref.
  /// </summary>
  public static readonly SymbolDisplayFormat TypeReference = new(
      typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypes,
      genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
      miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes
                          | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);

  /// <summary>
  /// Member name with its parameter list and any explicit interface
  /// qualifier, but without the containing type or return type. Signatures are
  /// composed from this plus the return type so the ordering is ours rather
  /// than Roslyn's.
  /// </summary>
  public static readonly SymbolDisplayFormat MemberNameAndParameters = new(
      memberOptions: SymbolDisplayMemberOptions.IncludeParameters
                   | SymbolDisplayMemberOptions.IncludeExplicitInterface,
      parameterOptions: SymbolDisplayParameterOptions.IncludeType
                      | SymbolDisplayParameterOptions.IncludeName
                      | SymbolDisplayParameterOptions.IncludeParamsRefOut
                      | SymbolDisplayParameterOptions.IncludeDefaultValue
                      | SymbolDisplayParameterOptions.IncludeExtensionThis,
      genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
      miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes
                          | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);
}
