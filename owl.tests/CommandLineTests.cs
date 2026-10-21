using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using Xunit;

namespace Owl.Tests;

/// <summary>The owl command as a user runs it: arguments, exit codes, and the files it writes.</summary>
[Collection(nameof(SampleModel))]
public sealed class CommandLineTests(SampleModel model)
{
  static readonly string Docs = Path.Combine(SampleModel.Source, "docs", "api");

  static string TempDir() => Path.Combine(Path.GetTempPath(), "owl-cli-" + Guid.NewGuid().ToString("N"));

  static Process Start(params string[] args)
  {
    var info = new ProcessStartInfo("dotnet")
    {
      RedirectStandardOutput = true,
      RedirectStandardError = true,
      WorkingDirectory = SampleModel.Repo,
    };
    info.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "owl.dll"));
    foreach (string arg in args)
    {
      info.ArgumentList.Add(arg);
    }

    return Process.Start(info)!;
  }

  static (int Code, string Output) Run(params string[] args)
  {
    using Process process = Start(args);
    Task<string> stdout = process.StandardOutput.ReadToEndAsync();
    Task<string> stderr = process.StandardError.ReadToEndAsync();
    process.WaitForExit();
    return (process.ExitCode, stdout.Result + stderr.Result);
  }

  [Theory]
  [InlineData]
  [InlineData("--help")]
  [InlineData("gen", "-h")]
  public void HelpListsTheCommands(params string[] args)
  {
    var (code, output) = Run(args);
    Assert.Equal(0, code);
    Assert.Contains("owl serve", output);
    Assert.Contains("owl verify", output);
  }

  [Fact]
  public void Version()
  {
    var (code, output) = Run("--version");
    Assert.Equal(0, code);
    Assert.Matches(@"^\d+\.\d+\.\d+", output.Trim());
  }

  [Fact]
  public void UnknownCommand()
  {
    var (code, output) = Run("explode");
    Assert.Equal(2, code);
    Assert.Contains("unknown command 'explode'", output);
  }

  [Theory]
  [InlineData("gen")]
  [InlineData("build")]
  [InlineData("verify")]
  public void ProjectsAreRequired(string command)
  {
    var (code, output) = Run(command);
    Assert.Equal(2, code);
    Assert.Contains(".csproj", output);
  }

  [Fact]
  public void MissingModel()
  {
    var (code, output) = Run("build", "--json", TempDir());
    Assert.Equal(2, code);
    Assert.Contains("No model", output);
  }

  [Fact]
  public void VerifyFailsAndReportsProblems()
  {
    var (code, output) = Run(["verify", .. SampleModel.Projects, "--out", TempDir()]);
    Assert.Equal(1, code);
    Assert.Contains("unresolved cref 'Missing'", output);
    Assert.Contains("Examples/Nowhere.cs", output);
    Assert.Contains("M:Samples.Docs.Tagged.Undocumented", output);
  }

  [Fact]
  public void GenWritesTheModel()
  {
    string dir = TempDir();
    var (code, output) = Run(["gen", .. SampleModel.Projects, "--out", dir]);
    Assert.True(code == 0, output);
    Assert.True(File.Exists(Path.Combine(dir, "index.json")));
    Assert.True(File.Exists(Path.Combine(dir, "Samples.CSharp.json")));
    Assert.True(File.Exists(Path.Combine(dir, "Samples.VisualBasic.json")));
  }

  [Fact]
  public void BuildExportsAStaticSite()
  {
    string dir = TempDir();
    var (code, output) = Run(
      "build", "--json", model.Directory, "--docs", Docs, "--out", dir, "--quiet",
      "--base", "/api/samples", "--site-url", "https://example.com", "--sandcastle");
    Assert.True(code == 0, output);

    foreach (string file in new[]
    {
      "index.html", "sitemap.xml", "robots.txt", "assets/app.css", "assets/app.js", "assets/search.json",
      "type/samples.memorystore/index.html",
      "category/samples.csharp/storage/index.html",
      "assembly/samples.csharp/index.html",
      "namespace/samples.shapes/index.html",
      "example/samples.docs.tagged/find-1-system.string/index.html",
    })
    {
      Assert.True(File.Exists(Path.Combine(dir, file)), $"{file} was not written");
    }

    // Every link is under the base path, and the sitemap uses the site's address.
    string home = File.ReadAllText(Path.Combine(dir, "index.html"));
    Assert.Contains("href=\"/api/samples/assets/app.css\"", home);
    Assert.Contains("https://example.com/api/samples/", File.ReadAllText(Path.Combine(dir, "sitemap.xml")));
    Assert.Contains("Sitemap: https://example.com/api/samples/sitemap.xml", File.ReadAllText(Path.Combine(dir, "robots.txt")));
  }

  [Theory]
  [InlineData("T_Samples_MemoryStore", "/api/samples/type/samples.memorystore/")]
  [InlineData("N_Samples_Shapes", "/api/samples/namespace/samples.shapes/")]
  [InlineData("M_Samples_Members_Gadget__ctor", "/api/samples/type/samples.members.gadget/")]
  [InlineData("Overload_Samples_Members_Gadget__ctor", "/api/samples/type/samples.members.gadget/")]
  [InlineData("AllMembers_T_Samples_MemoryStore", "/api/samples/type/samples.memorystore/")]
  public void BuildWritesSandcastleRedirects(string topic, string target)
  {
    string dir = TempDir();
    var (code, output) = Run("build", "--json", model.Directory, "--out", dir, "--quiet", "--base", "/api/samples", "--sandcastle");
    Assert.True(code == 0, output);

    string stub = Path.Combine(dir, "html", topic + ".htm");
    Assert.True(File.Exists(stub), $"{topic}.htm was not written");
    Assert.Contains($"url={target}", File.ReadAllText(stub));
  }

  [Fact]
  public void BuildWritesRedirectsForEveryOverload()
  {
    string dir = TempDir();
    var (code, output) = Run("build", "--json", model.Directory, "--out", dir, "--quiet", "--sandcastle");
    Assert.True(code == 0, output);

    string stub = Path.Combine(dir, "html", "M_Samples_Members_Gadget__ctor_1.htm");
    Assert.True(File.Exists(stub), "the second constructor has no redirect");
    Assert.Contains("url=/type/samples.members.gadget/", File.ReadAllText(stub));

    // Gadget has two constructors, so there is no third name to answer.
    Assert.False(File.Exists(Path.Combine(dir, "html", "M_Samples_Members_Gadget__ctor_2.htm")));
  }

  [Theory]
  [InlineData("samples.memorystore", "/api/samples/type/samples.memorystore/")]
  [InlineData("samples.memorystore/read", "/api/samples/type/samples.memorystore/#read-system.string")]
  [InlineData("samples.members.gadget/gadget", "/api/samples/type/samples.members.gadget/#ctor")]
  public void BuildWritesDocifyRedirects(string path, string target)
  {
    string dir = TempDir();
    var (code, output) = Run("build", "--json", model.Directory, "--out", dir, "--quiet", "--base", "/api/samples", "--docify");
    Assert.True(code == 0, output);

    string stub = Path.Combine(dir, path, "index.html");
    Assert.True(File.Exists(stub), $"{path}/ was not written");
    Assert.Contains(target, File.ReadAllText(stub));
  }

  [Fact]
  public void BuildWithoutDocifyWritesNoDocifyRedirects()
  {
    string dir = TempDir();
    var (code, output) = Run("build", "--json", model.Directory, "--out", dir, "--quiet");
    Assert.True(code == 0, output);
    Assert.False(Directory.Exists(Path.Combine(dir, "samples.memorystore")));
  }

  [Fact]
  public async Task ServeAnswersDocifyUrlsWithTheQuery()
  {
    int port = FreePort();
    using Process process = Start("serve", "--json", model.Directory, "--port", port.ToString(), "--docify");
    try
    {
      using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
      HttpResponseMessage? response = null;
      for (int attempt = 0; attempt < 60 && response is null; attempt++)
      {
        try
        {
          response = await http.GetAsync($"http://localhost:{port}/samples.memorystore/read?plain=true&dark=true");
        }
        catch (HttpRequestException)
        {
          await Task.Delay(500);
        }
      }

      Assert.NotNull(response);
      Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
      Assert.Equal("/type/samples.memorystore/?plain=true&dark=true#read-system.string", response.Headers.Location?.OriginalString);
    }
    finally
    {
      process.Kill(entireProcessTree: true);
    }
  }

  [Fact]
  public void HelpListsDocify()
  {
    Assert.Contains("--docify", Run("--help").Output);
  }

  [Fact]
  public void BuildWithoutSandcastleWritesNoRedirects()
  {
    string dir = TempDir();
    var (code, output) = Run("build", "--json", model.Directory, "--out", dir, "--quiet");
    Assert.True(code == 0, output);
    Assert.False(Directory.Exists(Path.Combine(dir, "html")));
  }

  [Fact]
  public void ExportedSitePassesTheSiteCheck()
  {
    string dir = TempDir();
    var (code, output) = Run("build", "--json", model.Directory, "--docs", Docs, "--out", dir, "--quiet");
    Assert.True(code == 0, output);

    var check = new ProcessStartInfo("node") { RedirectStandardOutput = true, RedirectStandardError = true };
    check.ArgumentList.Add(Path.Combine(SampleModel.Repo, "owl-site", "check.js"));
    check.ArgumentList.Add("--dist");
    check.ArgumentList.Add(dir);
    using Process process = Process.Start(check)!;
    string result = process.StandardOutput.ReadToEnd() + process.StandardError.ReadToEnd();
    process.WaitForExit();
    Assert.True(process.ExitCode == 0, result);
  }

  [Fact]
  public async Task ServeAnswersRequests()
  {
    int port = FreePort();
    using Process process = Start("serve", "--json", model.Directory, "--docs", Docs, "--port", port.ToString());
    try
    {
      using var http = new HttpClient();
      string? home = null;
      for (int attempt = 0; attempt < 60 && home is null; attempt++)
      {
        try
        {
          home = await http.GetStringAsync($"http://localhost:{port}/");
        }
        catch (HttpRequestException)
        {
          await Task.Delay(500);
        }
      }

      Assert.NotNull(home);
      Assert.Contains("The home page of the sample site.", home);

      HttpResponseMessage type = await http.GetAsync($"http://localhost:{port}/type/samples.memorystore/");
      Assert.Equal(HttpStatusCode.OK, type.StatusCode);

      HttpResponseMessage missing = await http.GetAsync($"http://localhost:{port}/type/samples.internalthing/");
      Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }
    finally
    {
      process.Kill(entireProcessTree: true);
    }
  }

  static int FreePort()
  {
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    int port = ((IPEndPoint)listener.LocalEndpoint).Port;
    listener.Stop();
    return port;
  }
}
