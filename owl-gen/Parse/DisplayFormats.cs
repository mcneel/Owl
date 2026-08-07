using Microsoft.CodeAnalysis;

namespace Owl.Gen.Parse;

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
