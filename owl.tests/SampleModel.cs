using System.Text.Json;
using Owl.Gen;
using Xunit;

namespace Owl.Tests;

/// <summary>The model owl-gen writes for owl.tests.source, generated once and shared by every test.</summary>
public sealed class SampleModel
{
  public static string Repo { get; } = FindRepo();

  public static string Source { get; } = Path.Combine(Repo, "owl.tests.source");

  public static string[] Projects { get; } =
  [
    Path.Combine(Source, "CSharp", "Samples.CSharp.csproj"),
    Path.Combine(Source, "VisualBasic", "Samples.VisualBasic.vbproj"),
  ];

  public string Directory { get; }

  public JsonElement Index { get; }

  readonly Dictionary<string, JsonElement> types = new(StringComparer.Ordinal);

  public SampleModel()
  {
    Directory = Path.Combine(Path.GetTempPath(), "owl-tests-" + Guid.NewGuid().ToString("N"));

    int code = OwlGen.Run([.. Projects, "--out", Directory, "--name", "Samples"]);
    Assert.Equal(0, code);

    Index = Load(Path.Combine(Directory, "index.json"));
    foreach (string file in System.IO.Directory.GetFiles(Directory, "Samples.*.json"))
    {
      foreach (JsonElement type in Load(file).GetProperty("types").EnumerateArray())
      {
        types[type.GetProperty("docId").GetString()!] = type;
      }
    }
  }

  public bool Has(string docId) => types.ContainsKey(docId);

  /// <summary>One type by doc id, failing the test when the model has no such type.</summary>
  public JsonElement Type(string docId)
  {
    Assert.True(types.TryGetValue(docId, out JsonElement type), $"{docId} is not in the model");
    return type;
  }

  /// <summary>One member of a type by doc id.</summary>
  public JsonElement Member(string typeId, string memberId)
  {
    JsonElement member = Members(typeId).FirstOrDefault(m => m.GetProperty("docId").GetString() == memberId);
    Assert.True(member.ValueKind == JsonValueKind.Object, $"{memberId} is not on {typeId}");
    return member;
  }

  public IEnumerable<JsonElement> Members(string typeId) => Type(typeId).GetProperty("members").EnumerateArray();

  static JsonElement Load(string file)
  {
    using var doc = JsonDocument.Parse(File.ReadAllText(file));
    return doc.RootElement.Clone();
  }

  // Walks up from the test binary, so the tests run the same from an IDE, the CLI or CI.
  static string FindRepo()
  {
    for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
    {
      if (System.IO.Directory.Exists(Path.Combine(dir.FullName, "owl.tests.source")))
      {
        return dir.FullName;
      }
    }

    throw new InvalidOperationException("Could not find owl.tests.source above " + AppContext.BaseDirectory);
  }
}

[CollectionDefinition(nameof(SampleModel))]
public sealed class SampleModelCollection : ICollectionFixture<SampleModel> { }

/// <summary>Small readers for the model's JSON, so assertions stay one line.</summary>
static class Json
{
  public static string? Str(this JsonElement e, string name) =>
    e.TryGetProperty(name, out JsonElement v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

  public static bool Bool(this JsonElement e, string name) =>
    e.TryGetProperty(name, out JsonElement v) && v.ValueKind == JsonValueKind.True;

  public static string[] Strs(this JsonElement e, string name) =>
    e.TryGetProperty(name, out JsonElement v) ? [.. v.EnumerateArray().Select(x => x.GetString()!)] : [];

  public static JsonElement[] Arr(this JsonElement e, string name) =>
    e.TryGetProperty(name, out JsonElement v) ? [.. v.EnumerateArray()] : [];

  public static JsonElement Docs(this JsonElement e) => e.GetProperty("docs");
}
