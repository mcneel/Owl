namespace Owl.Gen.Model;

/// <summary>
/// Findings worth acting on, accumulated across every project in a run.
/// </summary>
/// <remarks>
/// These exist because a normal build does not report them: projects routinely
/// suppress CS1591, and an unresolvable cref is not a diagnostic at all.
/// Nothing here is serialized. It drives <c>--verify</c> and the exit code.
/// </remarks>
sealed class DocFindings
{
  /// <summary>
  /// Doc ids of public API with no summary from any source, including
  /// inheritdoc.
  /// </summary>
  public List<string> Undocumented { get; } = [];

  /// <summary>
  /// Human-readable notes about crefs that could not be resolved to a symbol.
  /// </summary>
  public List<string> UnresolvedCrefs { get; } = [];

  /// <summary>
  /// Compilation errors encountered while analysing, by assembly. A non-empty
  /// list is what makes owl-gen exit non-zero, so owl stops rather than
  /// rendering a model built from missing symbols.
  /// </summary>
  public List<string> CompilationErrors { get; } = [];
}
