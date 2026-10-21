using System.Text.Json;
using Xunit;

namespace Owl.Tests;

/// <summary>What owl-gen records about the sample types and their members.</summary>
[Collection(nameof(SampleModel))]
public sealed class ModelTests(SampleModel model)
{
  [Theory]
  [InlineData("T:Samples.IStore", "interface")]
  [InlineData("T:Samples.MemoryStore", "class")]
  [InlineData("T:Samples.Point", "struct")]
  [InlineData("T:Samples.Mode", "enum")]
  [InlineData("T:Samples.Name", "record")]
  [InlineData("T:Samples.Pair", "record struct")]
  [InlineData("T:Samples.Members.Handler", "delegate")]
  [InlineData("T:Samples.VB.StoreHelpers", "module")]
  [InlineData("T:Samples.VB.VbStore.ChangedEventHandler", "delegate")]
  public void TypeKinds(string docId, string kind)
  {
    Assert.Equal(kind, model.Type(docId).Str("kind"));
  }

  [Theory]
  [InlineData("T:Samples.CachedStore", "isSealed")]
  [InlineData("T:Samples.FinalName", "isSealed")]
  [InlineData("T:Samples.Shapes.Shape", "isAbstract")]
  [InlineData("T:Samples.Shapes.ShapeExtensions", "isStatic")]
  public void TypeModifiers(string docId, string flag)
  {
    Assert.True(model.Type(docId).Bool(flag));
  }

  [Fact]
  public void UnsealedClassIsNotSealed()
  {
    Assert.False(model.Type("T:Samples.MemoryStore").Bool("isSealed"));
  }

  [Fact]
  public void InternalTypesAreLeftOut()
  {
    Assert.False(model.Has("T:Samples.InternalThing"));
  }

  [Theory]
  [InlineData("T:Samples.MemoryStore", "Hidden")]
  [InlineData("T:Samples.Shapes.Shape", "Secret")]
  public void InternalAndPrivateProtectedMembersAreLeftOut(string typeId, string name)
  {
    Assert.DoesNotContain(model.Members(typeId), m => m.Str("name") == name);
  }

  [Theory]
  [InlineData("M:Samples.Shapes.Shape.Touch", "protected")]
  [InlineData("M:Samples.Shapes.Shape.Mark", "protected internal")]
  [InlineData("M:Samples.Shapes.Shape.Describe", "public")]
  public void MemberAccessibility(string memberId, string accessibility)
  {
    Assert.Equal(accessibility, model.Member("T:Samples.Shapes.Shape", memberId).Str("accessibility"));
  }

  [Theory]
  [InlineData("T:Samples.Point")]
  [InlineData("T:Samples.Mode")]
  [InlineData("T:Samples.Pair")]
  [InlineData("T:Samples.MemoryStore")]
  public void NoBaseTypeForStructsEnumsOrObject(string docId)
  {
    Assert.False(model.Type(docId).TryGetProperty("baseType", out _));
  }

  [Theory]
  [InlineData("T:Samples.CachedStore", "T:Samples.MemoryStore")]
  [InlineData("T:Samples.Shapes.Circle", "T:Samples.Shapes.Shape")]
  [InlineData("T:Samples.VB.VbStore", "T:Samples.MemoryStore")]
  public void BaseTypes(string docId, string baseId)
  {
    Assert.Equal(baseId, model.Type(docId).GetProperty("baseType").Str("id"));
  }

  [Theory]
  [InlineData("T:Samples.MemoryStore", new[] { "T:Samples.CachedStore", "T:Samples.VB.VbStore" })]
  [InlineData("T:Samples.Shapes.Shape", new[] { "T:Samples.Shapes.Circle" })]
  [InlineData("T:Samples.IStore", new[] { "T:Samples.MemoryStore" })]
  public void DerivedTypesAcrossProjects(string docId, string[] derived)
  {
    Assert.Equal(derived, model.Type(docId).Strs("derivedTypes").Order());
  }

  [Fact]
  public void InterfacesIncludeInheritedOnes()
  {
    JsonElement vb = model.Type("T:Samples.VB.VbStore");
    Assert.Equal(["T:System.IDisposable"], vb.Arr("interfaces").Select(i => i.Str("id")));
    Assert.Equal(["T:Samples.IStore", "T:System.IDisposable"], vb.Strs("allInterfaces").Order());
  }

  [Fact]
  public void FrameworkTypesAreExternal()
  {
    JsonElement disposable = model.Type("T:Samples.Members.Gadget").Arr("interfaces")
      .Single(i => i.Str("id") == "T:System.IDisposable");
    Assert.True(disposable.Bool("external"));
    Assert.Equal("System.Runtime", disposable.Str("asm"));
  }

  [Fact]
  public void GenericInterfaceKeepsItsArguments()
  {
    JsonElement converter = model.Type("T:Samples.Members.Gadget").Arr("interfaces")
      .Single(i => i.Str("id") == "T:Samples.Members.IConverter`2");
    Assert.Equal("IConverter<string, int>", converter.Str("display"));
  }

  [Fact]
  public void TypeParameterVarianceAndDocs()
  {
    JsonElement[] parameters = model.Type("T:Samples.Members.IConverter`2").Arr("typeParameters");
    Assert.Equal(["in", "out"], parameters.Select(p => p.Str("variance")));
    Assert.Equal("What goes in.", parameters[0].Arr("doc")[0].Str("v"));
  }

  [Fact]
  public void MethodTypeParameterConstraints()
  {
    JsonElement pick = model.Member("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.Pick``1(``0,``0)");
    Assert.Equal(["IComparable<T>"], pick.Arr("typeParameters")[0].Strs("constraints"));
  }

  [Fact]
  public void NestedTypesNameTheirContainer()
  {
    Assert.Equal("T:Samples.Shapes.Circle", model.Type("T:Samples.Shapes.Circle.Spot").Str("containingType"));
  }

  [Fact]
  public void PartialTypesAreOneType()
  {
    Assert.Equal(["First", "Second"], model.Members("T:Samples.Members.Split").Select(m => m.Str("name")).Order());
  }

  [Fact]
  public void ProjectDefinesAreHonoured()
  {
    string[] names = [.. model.Members("T:Samples.Members.Gadget").Select(m => m.Str("name")!)];
    Assert.Contains("WhenDefined", names);
    Assert.DoesNotContain("WhenNotDefined", names);
  }

  [Theory]
  [InlineData("F:Samples.Members.Gadget.MaxSize", "field")]
  [InlineData("F:Samples.Members.Gadget.Id", "field")]
  [InlineData("P:Samples.Members.Gadget.Label", "property")]
  [InlineData("P:Samples.Members.Gadget.Item(System.Int32)", "indexer")]
  [InlineData("E:Samples.Members.Gadget.Happened", "event")]
  [InlineData("M:Samples.Members.Gadget.#ctor(System.Int32)", "constructor")]
  [InlineData("M:Samples.Members.Gadget.Finalize", "destructor")]
  [InlineData("M:Samples.Members.Gadget.Convert(System.String)", "method")]
  [InlineData("M:Samples.Members.Gadget.op_Explicit(System.Int32)~Samples.Members.Gadget", "conversion")]
  public void MemberKinds(string memberId, string kind)
  {
    Assert.Equal(kind, model.Member("T:Samples.Members.Gadget", memberId).Str("kind"));
  }

  [Theory]
  [InlineData("T:Samples.Point", "M:Samples.Point.op_Addition(Samples.Point,Samples.Point)", "operator")]
  [InlineData("T:Samples.Mode", "F:Samples.Mode.Disk", "enumvalue")]
  public void OperatorAndEnumValueKinds(string typeId, string memberId, string kind)
  {
    Assert.Equal(kind, model.Member(typeId, memberId).Str("kind"));
  }

  [Theory]
  [InlineData("T:Samples.Point", "M:Samples.Point.op_Addition(Samples.Point,Samples.Point)", "Point operator +(Point a, Point b)")]
  [InlineData("T:Samples.Mode", "F:Samples.Mode.Disk", "Disk = 1")]
  [InlineData("T:Samples.Members.Gadget", "P:Samples.Members.Gadget.Item(System.Int32)", "int this[int index]")]
  [InlineData("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.Finalize", "~Gadget()")]
  [InlineData("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.op_Implicit(Samples.Members.Gadget)~System.Int32", "implicit operator int(Gadget gadget)")]
  [InlineData("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.Configure(System.Int32@,System.Int32@,System.Int32@,System.Int32,System.String[])", "void Configure(ref int a, out int b, in int c, int d = 5, params string[] rest)")]
  [InlineData("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.Pick``1(``0,``0)", "T Pick<T>(T first, T second)")]
  [InlineData("T:Samples.Shapes.ShapeExtensions", "M:Samples.Shapes.ShapeExtensions.DoubleArea(Samples.Shapes.Shape)", "double DoubleArea(this Shape shape)")]
  [InlineData("T:Samples.VB.StoreHelpers", "M:Samples.VB.StoreHelpers.ReadFrom(Samples.IStore,System.String)", "string ReadFrom(IStore store, string key)")]
  [InlineData("T:Samples.VB.VbStore", "E:Samples.VB.VbStore.Changed", "VbStore.ChangedEventHandler Changed")]
  public void SignaturesAreCSharp(string typeId, string memberId, string signature)
  {
    Assert.Equal(signature, model.Member(typeId, memberId).Str("signature"));
  }

  [Fact]
  public void ParameterDetails()
  {
    JsonElement[] p = model.Member(
      "T:Samples.Members.Gadget",
      "M:Samples.Members.Gadget.Configure(System.Int32@,System.Int32@,System.Int32@,System.Int32,System.String[])")
      .Arr("parameters");

    Assert.Equal(["ref", "out", "in", null, null], p.Select(x => x.Str("refKind")));
    Assert.True(p[3].Bool("isOptional"));
    Assert.Equal("5", p[3].Str("defaultValue"));
    Assert.True(p[4].Bool("isParams"));
  }

  [Fact]
  public void ConstantsAndReadOnlyFields()
  {
    JsonElement max = model.Member("T:Samples.Members.Gadget", "F:Samples.Members.Gadget.MaxSize");
    Assert.True(max.Bool("isConst"));
    Assert.Equal("10", max.Str("constantValue"));
    Assert.True(model.Member("T:Samples.Members.Gadget", "F:Samples.Members.Gadget.Id").Bool("isReadOnly"));
  }

  [Fact]
  public void PrivateSettersAreHidden()
  {
    JsonElement accessors = model.Member("T:Samples.Members.Gadget", "P:Samples.Members.Gadget.Label").GetProperty("accessors");
    Assert.Equal("public", accessors.Str("get"));
    Assert.Null(accessors.Str("set"));
  }

  [Fact]
  public void InitOnlySetters()
  {
    JsonElement accessors = model.Member("T:Samples.Shapes.Circle", "P:Samples.Shapes.Circle.Radius").GetProperty("accessors");
    Assert.True(accessors.Bool("initOnly"));
  }

  [Fact]
  public void ExtensionMethods()
  {
    Assert.True(model.Member(
      "T:Samples.Shapes.ShapeExtensions",
      "M:Samples.Shapes.ShapeExtensions.DoubleArea(Samples.Shapes.Shape)").Bool("isExtensionMethod"));
  }

  [Fact]
  public void VirtualAbstractAndOverride()
  {
    Assert.True(model.Member("T:Samples.Shapes.Shape", "M:Samples.Shapes.Shape.Describe").Bool("isVirtual"));
    Assert.True(model.Member("T:Samples.Shapes.Shape", "P:Samples.Shapes.Shape.Area").Bool("isAbstract"));

    JsonElement area = model.Member("T:Samples.Shapes.Circle", "P:Samples.Shapes.Circle.Area");
    Assert.True(area.Bool("isOverride"));
    Assert.Equal("P:Samples.Shapes.Shape.Area", area.Str("overrides"));
  }

  [Theory]
  [InlineData("T:Samples.MemoryStore", "M:Samples.MemoryStore.Read(System.String)", "M:Samples.IStore.Read(System.String)")]
  [InlineData("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.Convert(System.String)", "M:Samples.Members.IConverter`2.Convert(`0)")]
  [InlineData("T:Samples.VB.VbStore", "M:Samples.VB.VbStore.Dispose", "M:System.IDisposable.Dispose")]
  public void ImplicitInterfaceImplementations(string typeId, string memberId, string implemented)
  {
    Assert.Contains(implemented, model.Member(typeId, memberId).Strs("implements"));
  }

  [Fact]
  public void ExplicitInterfaceImplementationsAreShown()
  {
    JsonElement dispose = model.Member("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.System#IDisposable#Dispose");
    Assert.Equal("T:System.IDisposable", dispose.GetProperty("explicitInterface").Str("id"));
    Assert.Equal("void IDisposable.Dispose()", dispose.Str("signature"));
  }

  [Fact]
  public void Obsolete()
  {
    JsonElement warning = model.Member("T:Samples.Owned`1", "M:Samples.Owned`1.Clear").GetProperty("obsolete");
    Assert.Equal("Use Reset instead", warning.Str("message"));
    Assert.False(warning.Bool("isError"));

    JsonElement error = model.Member("T:Samples.Members.Gadget", "M:Samples.Members.Gadget.Old").GetProperty("obsolete");
    Assert.True(error.Bool("isError"));
  }

  [Fact]
  public void SourceIsRecordedRelativeToTheRepo()
  {
    JsonElement source = model.Type("T:Samples.CachedStore").GetProperty("source");
    Assert.Equal("owl.tests.source/CSharp/Types.cs", source.Str("file"));
    Assert.True(source.GetProperty("line").GetInt32() > 0);
  }

  [Fact]
  public void IndexListsAssembliesWithTheirCategories()
  {
    JsonElement[] assemblies = model.Index.Arr("assemblies");
    Assert.Equal(["Samples.CSharp", "Samples.VisualBasic"], assemblies.Select(a => a.Str("name")));
    Assert.Equal(["Shapes", "Storage"], assemblies[0].Strs("categories"));
    Assert.Equal(["Helpers", "Storage"], assemblies[1].Strs("categories"));
  }

  [Fact]
  public void NameIsRecorded()
  {
    using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(model.Directory, "Samples.CSharp.json")));
    Assert.Equal("Samples.CSharp", doc.RootElement.Str("name"));
    Assert.Equal("net8.0", doc.RootElement.Str("targetFramework"));
  }
}
