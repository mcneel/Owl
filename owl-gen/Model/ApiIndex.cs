using System.Text.Json.Serialization;

namespace Owl.Gen.Model;

/// <summary>
/// Cross-assembly lookup table, serialized to index.json.
/// <para>
/// Every doc id in the documented set maps to a url and anchor here, so the
/// site resolves links (including crefs that cross assembly boundaries) by
/// pure lookup and never has to reimplement owl's slug rule.
/// </para>
/// </summary>
sealed class ApiIndex
{
  /// <summary>
  /// Output schema version. Bump when the shape changes incompatibly.
  /// Version 2 dropped the report block; per-assembly counts carry the totals.
  /// </summary>
  public int Schema { get; set; } = 2;

  /// <summary>
  /// Set after the run completes, so workflows stay deterministic.
  /// </summary>
  public string? Generated { get; set; }

  /// <summary>
  /// Presentation settings that belong to the documented set rather than to
  /// one rendering of it, so they are named once at generation time instead of
  /// on every serve and export.
  /// </summary>
  public ApiIndexSite? Site { get; set; }

  /// <summary>
  /// One entry per documented assembly, with its headline counts.
  /// </summary>
  public List<ApiIndexAssembly> Assemblies { get; set; } = [];

  /// <summary>Namespace name to the doc ids of the types it contains.</summary>
  public Dictionary<string, List<string>> Namespaces { get; set; } = [];

  /// <summary>
  /// "&lt;assembly&gt;/&lt;category&gt;" to the doc ids of the types in it.
  /// Categories are only unique within an assembly, hence the composite key.
  /// </summary>
  public Dictionary<string, List<string>> Categories { get; set; } = [];

  /// <summary>
  /// Doc id to its location. The map the renderer actually resolves links
  /// against.
  /// </summary>
  public Dictionary<string, ApiIndexEntry> Entries { get; set; } = [];

}

/// <summary>How the site presents this documented set.</summary>
sealed class ApiIndexSite
{
  /// <summary>Site name, shown in the header and every page title.</summary>
  public string? Name { get; set; }
}

/// <summary>One documented assembly, as summarized in index.json.</summary>
sealed class ApiIndexAssembly
{
  /// <summary>Assembly name, which is also its json file name.</summary>
  public string Name { get; set; } = "";

  /// <summary>Assembly version, when the project declared one.</summary>
  public string? Version { get; set; }

  /// <summary>Framework the assembly was documented for.</summary>
  public string? TargetFramework { get; set; }

  /// <summary>Public types in this assembly.</summary>
  public int TypeCount { get; set; }

  /// <summary>Public members across those types.</summary>
  public int MemberCount { get; set; }

  /// <summary>Category names found in this assembly, sorted.</summary>
  public List<string> Categories { get; set; } = [];
}

/// <summary>
/// Where one doc id lives, as a page slug plus optional anchor.
/// </summary>
sealed class ApiIndexEntry
{
  /// <summary>Assembly the symbol was declared in.</summary>
  public string Assembly { get; set; } = "";

  /// <summary>
  /// Slug of the page this doc id lives on, i.e. the owning type's slug.
  /// </summary>
  public string Slug { get; set; } = "";

  /// <summary>Fragment within the page, null for types.</summary>
  public string? Anchor { get; set; }

  /// <summary>Symbol kind, used to pick an icon and to group results.</summary>
  public string Kind { get; set; } = "";

  /// <summary>
  /// Short display name, which is what search matches against.
  /// </summary>
  public string Name { get; set; } = "";
}
