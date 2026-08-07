using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Owl.Gen.Model;

namespace Owl.Gen.Emit;

/// <summary>
/// Writes the model to the output directory: one file per assembly, plus a
/// shared index.json.
/// </summary>
static class JsonEmitter
{
  static readonly JsonSerializerOptions s_options = new()
  {
    WriteIndented = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,

    // Relaxed escaping keeps '<', '>' and '+' readable in signatures and generic names.
    // The site never interpolates these into HTML unescaped.
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
  };

  /// <summary>
  /// Writes the whole documented set. Derived types are linked across
  /// assemblies first, so this has to be given every assembly at once.
  /// </summary>
  /// <param name="outDir">Created if it does not exist.</param>
  /// <param name="apis">
  /// The documented set, which is linked in place.
  /// </param>
  /// <param name="site">Presentation settings recorded in index.json.</param>
  /// <param name="log">Progress goes here, one line per file.</param>
  public static void Write(string outDir, List<ApiAssembly> apis, ApiIndexSite site, TextWriter log)
  {
    Directory.CreateDirectory(outDir);

    LinkDerivedTypes(apis);

    foreach (ApiAssembly api in apis)
    {
      string path = Path.Combine(outDir, api.Name + ".json");
      WriteFile(path, api);
      int members = api.Types.Sum(t => t.Members.Count);
      log.WriteLine($"  {api.Name,-46} {api.Types.Count,5} types  {members,6} members");
    }

    ApiIndex index = BuildIndex(apis, site);
    WriteFile(Path.Combine(outDir, "index.json"), index);
    log.WriteLine($"  {"index.json",-46} {index.Entries.Count,5} entries");
  }

  static void WriteFile(string path, object value)
  {
    // Written via a temp file so a crashed run never leaves a half-written document that the
    // site would then fail to parse.
    string temp = path + ".tmp";

    using (FileStream stream = File.Create(temp))
    {
      JsonSerializer.Serialize(stream, value, s_options);
    }

    File.Move(temp, path, overwrite: true);
  }

  /// <summary>
  /// Fills in <see cref="ApiType.DerivedTypes"/> across the whole documented set.
  /// </summary>
  /// <remarks>
  /// This has to happen here rather than in the per-project builder: each
  /// assembly is compiled separately, so a builder can only ever see
  /// subclasses declared in its own project. Doing it once at emit time is
  /// what lets a type list the types deriving from it in a sibling project.
  /// </remarks>
  static void LinkDerivedTypes(List<ApiAssembly> apis)
  {
    var byDocId = new Dictionary<string, ApiType>(StringComparer.Ordinal);

    foreach (ApiAssembly assembly in apis)
    {
      foreach (ApiType type in assembly.Types)
      {
        byDocId[type.DocId] = type;
      }
    }

    foreach (ApiAssembly assembly in apis)
    {
      foreach (ApiType type in assembly.Types)
      {
        foreach (TypeRef baseRef in EnumerateBases(type))
        {
          if (baseRef.DocId is null || !byDocId.TryGetValue(baseRef.DocId, out ApiType? baseType))
          {
            continue;
          }

          baseType.DerivedTypes ??= [];
          if (!baseType.DerivedTypes.Contains(type.DocId))
          {
            baseType.DerivedTypes.Add(type.DocId);
          }
        }
      }
    }

    foreach (ApiAssembly assembly in apis)
    {
      foreach (ApiType type in assembly.Types)
      {
        type.DerivedTypes?.Sort(StringComparer.Ordinal);
      }
    }
  }

  static IEnumerable<TypeRef> EnumerateBases(ApiType type)
  {
    if (type.BaseType is not null)
    {
      yield return type.BaseType;
    }

    if (type.Interfaces is null)
    {
      yield break;
    }

    foreach (TypeRef iface in type.Interfaces)
    {
      yield return iface;
    }
  }

  static ApiIndex BuildIndex(List<ApiAssembly> apis, ApiIndexSite site)
  {
    var index = new ApiIndex
    {
      Site = site.Name is null ? null : site,
    };

    foreach (ApiAssembly api in apis)
    {
      var categories = new SortedSet<string>(StringComparer.Ordinal);

      foreach (ApiType type in api.Types)
      {
        index.Entries[type.DocId] = new ApiIndexEntry
        {
          Assembly = api.Name,
          Slug = type.Slug,
          Kind = type.Kind,
          Name = type.Name,
        };

        if (!index.Namespaces.TryGetValue(type.Namespace, out List<string>? nsTypes))
        {
          index.Namespaces[type.Namespace] = nsTypes = [];
        }

        nsTypes.Add(type.DocId);

        if (!string.IsNullOrEmpty(type.Category))
        {
          categories.Add(type.Category);
          string key = api.Name + "/" + type.Category;

          if (!index.Categories.TryGetValue(key, out List<string>? categoryTypes))
          {
            index.Categories[key] = categoryTypes = [];
          }

          categoryTypes.Add(type.DocId);
        }

        foreach (ApiMember member in type.Members)
        {
          index.Entries[member.DocId] = new ApiIndexEntry
          {
            Assembly = api.Name,
            Slug = type.Slug,
            Anchor = member.Anchor,
            Kind = member.Kind,
            Name = member.Name,
          };
        }
      }

      index.Assemblies.Add(new ApiIndexAssembly
      {
        Name = api.Name,
        Version = api.Version,
        TargetFramework = api.TargetFramework,
        TypeCount = api.Types.Count,
        MemberCount = api.Types.Sum(t => t.Members.Count),
        Categories = categories.ToList(),
      });
    }

    return index;
  }
}
