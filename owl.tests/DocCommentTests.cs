using System.Text.Json;
using Xunit;

namespace Owl.Tests;

/// <summary>How owl-gen reads documentation comments, kept as structured nodes.</summary>
[Collection(nameof(SampleModel))]
public sealed class DocCommentTests(SampleModel model)
{
  JsonElement Tagged => model.Type("T:Samples.Docs.Tagged").Docs();

  JsonElement Find => model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.Find``1(System.String)").Docs();

  static JsonElement Node(JsonElement nodes, string kind) => nodes.EnumerateArray().First(n => n.Str("t") == kind);

  [Fact]
  public void InlineTags()
  {
    JsonElement summary = Tagged.GetProperty("summary");
    Assert.Equal("inline code", Node(summary, "c").Str("v"));
    Assert.Equal("null", Node(summary, "langword").Str("v"));
    Assert.Equal("https://example.com", Node(summary, "link").Str("href"));
    Assert.Equal("a web link", Node(summary, "link").Str("v"));
  }

  [Fact]
  public void CrefResolvesToADocId()
  {
    JsonElement cref = Node(Tagged.GetProperty("summary"), "cref");
    Assert.Equal("T:Samples.IStore", cref.Str("id"));
    Assert.Equal("IStore", cref.Str("label"));
  }

  [Fact]
  public void UnresolvedCrefKeepsItsLabel()
  {
    JsonElement cref = Node(model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.Broken").Docs().GetProperty("summary"), "cref");
    Assert.Null(cref.Str("id"));
    Assert.Equal("Missing", cref.Str("label"));
  }

  [Fact]
  public void ParagraphsBreaksListsAndNotes()
  {
    JsonElement remarks = Tagged.GetProperty("remarks");
    JsonElement[] nodes = [.. remarks.EnumerateArray().Where(n => n.Str("t") != "text")];

    Assert.Equal(["para", "para", "list", "list", "note"], nodes.Select(n => n.Str("t")));
    Assert.Contains(nodes[1].Arr("children"), n => n.Str("t") == "br");
    Assert.Equal("bullet", nodes[2].Str("style"));
    Assert.Equal(2, nodes[2].Arr("items").Length);
    Assert.Equal("table", nodes[3].Str("style"));
    Assert.Equal("warning", nodes[4].Str("kind"));
  }

  [Fact]
  public void MarkdownListsBecomeLists()
  {
    JsonElement docs = model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.Listed(System.Int32)").Docs();
    JsonElement[] summary = [.. docs.GetProperty("summary").EnumerateArray()];

    Assert.Equal(["text", "list", "text"], summary.Select(n => n.Str("t")));
    Assert.Equal("Reads from", summary[0].Str("v"));
    Assert.Equal("Then stops.", summary[2].Str("v"));

    JsonElement[] items = summary[1].Arr("items");
    Assert.Equal("bullet", summary[1].Str("style"));
    Assert.Equal(2, items.Length);
    Assert.Equal("T:Samples.IStore", Node(items[0].GetProperty("description"), "cref").Str("id"));
    Assert.Equal("the cache, when warm.", items[1].GetProperty("description")[0].Str("v"));

    JsonElement steps = Node(docs.GetProperty("params").GetProperty("order"), "list");
    Assert.Equal("number", steps.Str("style"));
    Assert.Equal(2, steps.Arr("items").Length);
  }

  [Fact]
  public void NumberedListStartsAtOne()
  {
    JsonElement docs = model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.Listed(System.Int32)").Docs();
    Assert.Equal("First shipped in 2010. Still here.", Assert.Single(docs.GetProperty("remarks").EnumerateArray()).Str("v"));
  }

  [Fact]
  public void DeeperMarkersNest()
  {
    JsonElement summary = model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.Nested").Docs().GetProperty("summary");
    JsonElement[] items = Node(summary, "list").Arr("items");

    Assert.Equal(2, items.Length);
    Assert.Equal("Fast", items[0].GetProperty("description")[0].Str("v"));
    Assert.Equal(2, Node(items[0].GetProperty("description"), "list").Arr("items").Length);
    Assert.Equal("Safe", items[1].GetProperty("description")[0].Str("v"));
  }

  [Fact]
  public void BackticksBecomeInlineCode()
  {
    JsonElement summary = model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.Ticked").Docs().GetProperty("summary");
    Assert.Equal(["text", "c", "text"], summary.EnumerateArray().Select(n => n.Str("t")));
    Assert.Equal("Find(\"a\")", Node(summary, "c").Str("v"));
    Assert.Equal(" first, but a lone ` stays.", summary[2].Str("v"));
  }

  [Fact]
  public void SeeAlso()
  {
    Assert.Equal("T:Samples.MemoryStore", Tagged.Arr("seeAlso")[0].Str("id"));
  }

  [Fact]
  public void DeprecatedIsAVersion()
  {
    Assert.Equal("2.0", Tagged.Str("since"));
    Assert.Equal("3.0", Tagged.Str("deprecated"));
  }

  [Fact]
  public void ParamAndTypeParamRefs()
  {
    JsonElement summary = Find.GetProperty("summary");
    Assert.Equal("key", Node(summary, "paramref").Str("name"));
    Assert.Equal("T", Node(summary, "typeparamref").Str("name"));
  }

  [Fact]
  public void ParamsTypeParamsReturnsAndValue()
  {
    Assert.Equal("What to find.", Find.GetProperty("params").GetProperty("key")[0].Str("v"));
    Assert.Equal("The container.", Find.GetProperty("typeParams").GetProperty("T")[0].Str("v"));
    Assert.Equal("True when found.", Find.GetProperty("returns")[0].Str("v"));

    JsonElement count = model.Member("T:Samples.Docs.Tagged", "P:Samples.Docs.Tagged.Count").Docs();
    Assert.Equal("Never negative.", count.GetProperty("value")[0].Str("v"));
  }

  [Fact]
  public void Exceptions()
  {
    JsonElement exception = Find.Arr("exceptions")[0];
    Assert.Equal("T:System.ArgumentNullException", exception.Str("id"));
    Assert.Equal("key", exception.Arr("doc")[0].Str("name"));
  }

  [Fact]
  public void InlineCodeExampleIsUnescaped()
  {
    JsonElement code = Find.Arr("example")[0];
    Assert.Equal("csharp", code.Str("lang"));
    Assert.Equal("var found = tagged.Find<List<int>>(\"a\");", code.Str("v"));
  }

  [Fact]
  public void ExampleFromSourceFileRegion()
  {
    JsonElement code = Find.Arr("example").Last(n => n.Str("t") == "code");
    Assert.Equal("Examples/Find.cs", code.Str("src"));
    Assert.Equal("bool found = tagged.Find<string>(\"key\");", code.Str("v"));
  }

  [Fact]
  public void MissingExampleFileKeepsItsPath()
  {
    JsonElement code = model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.NoExample").Docs().Arr("example")[0];
    Assert.Equal("Examples/Nowhere.cs", code.Str("src"));
    Assert.Null(code.Str("v"));
  }

  [Fact]
  public void UndocumentedIsFlagged()
  {
    Assert.True(model.Member("T:Samples.Docs.Tagged", "M:Samples.Docs.Tagged.Undocumented").Docs().Bool("undocumented"));
    Assert.False(Find.Bool("undocumented"));
  }

  [Fact]
  public void InheritdocFromBaseClass()
  {
    JsonElement docs = model.Member("T:Samples.CachedStore", "M:Samples.CachedStore.Read(System.String)").Docs();
    Assert.Equal("M:Samples.MemoryStore.Read(System.String)", docs.Str("inheritedFrom"));
    Assert.Equal("Name of the value.", docs.GetProperty("params").GetProperty("key")[0].Str("v"));
    Assert.True(docs.TryGetProperty("returns", out _));
  }

  [Fact]
  public void InheritdocFromInterface()
  {
    JsonElement docs = model.Member("T:Samples.MemoryStore", "M:Samples.MemoryStore.Read(System.String)").Docs();
    Assert.Equal("M:Samples.IStore.Read(System.String)", docs.Str("inheritedFrom"));
  }

  [Fact]
  public void InheritdocFromAbstractMember()
  {
    JsonElement docs = model.Member("T:Samples.Shapes.Circle", "P:Samples.Shapes.Circle.Area").Docs();
    Assert.Equal("The shape's area.", docs.GetProperty("summary")[0].Str("v"));
  }

  [Fact]
  public void CategoryAndSince()
  {
    JsonElement type = model.Type("T:Samples.CachedStore");
    Assert.Equal("Storage", type.Str("category"));
    Assert.Equal("2.1", type.Docs().Str("since"));
    Assert.Equal("Helpers", model.Type("T:Samples.VB.StoreHelpers").Str("category"));
  }

  [Fact]
  public void VisualBasicCrefIntoCSharp()
  {
    JsonElement summary = model.Member(
      "T:Samples.VB.StoreHelpers",
      "M:Samples.VB.StoreHelpers.ReadFrom(Samples.IStore,System.String)").Docs().GetProperty("summary");
    Assert.Equal("T:Samples.IStore", Node(summary, "cref").Str("id"));
  }

  [Fact]
  public void VisualBasicProjectImportsAreHonoured()
  {
    JsonElement join = model.Member("T:Samples.VB.StoreHelpers", "M:Samples.VB.StoreHelpers.Join(System.String[])");
    Assert.Equal("T:System.Text.StringBuilder", join.GetProperty("returnType").Str("id"));
  }
}
