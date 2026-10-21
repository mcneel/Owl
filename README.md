# <img src="art/icon.png" alt="" width="40" align="top"> Owl

Turn your .NET library into a documentation website.

Owl reads your C# or Visual Basic project and builds a searchable site with a page for every type.

## Install

You need [.NET SDK 8.0+](https://dotnet.microsoft.com/download) and [Node 18+](https://nodejs.org).

```bash
dotnet tool install --global McNeel.Owl
```

## Preview Documentation

```bash
owl serve MyLib.csproj
```

Open http://localhost:8080. Edit your docs and refresh to see the changes.

## Publish Documentation

```bash
owl build MyLib.csproj --out ./public
```

Upload the `public` folder to any web host.

If the site lives under a path, such as `https://example.com/api/mylib`, say so:

```bash
owl build MyLib.csproj --out ./public --base /api/mylib --site-url https://example.com
```

## Document Several Projects Together

```bash
owl serve MyLib.csproj MyLib.Extras.csproj --name "MyLib"
```

Links between the projects just work.

## Documentation Categories

Group types into categories with a `<category>` tag:

```csharp
/// <summary>Saves files.</summary>
/// <category>Storage</category>
public class FileStore { }
```

Then put Markdown files in a `docs/api` folder next to where you run owl:

```
docs/api/MAIN.md                  home page
docs/api/logo.svg                 header icon
docs/api/MyLib/MAIN.md            MyLib's page
docs/api/MyLib/Storage.md         the Storage category's page
```

The sidebar lists your categories, and owl shows a placeholder for any page you haven't written yet.

Pages somewhere else? Use `--docs path/to/pages`.

Pages can include diagrams. Install [d2](https://d2lang.com) first:

````markdown
```d2
Code -> Compile -> Run
```
````

Pages can also include math:

```markdown
The area of a circle is $\pi r^2$.
```

## Documentation Version

```csharp
/// <summary>Saves files.</summary>
/// <since>2.1</since>
public class FileStore { }
```

```bash
owl build MyLib.csproj --api-versions 3,2,1
```

Readers pick a version from the header and see only what existed in it.

## Link to Your Source Code

```bash
owl build MyLib.csproj --source-refs https://github.com/me/mylib/blob/main
```

Every type and member links to the line it is declared on.

## Link to Another Library's Docs

If your library uses types from another library that is also documented with owl:

```bash
owl build MyPlugin.csproj --link MyLib=/api/mylib
```

Those types now link to the other site. .NET types link to Microsoft Learn automatically.

## Keep Old Links Working

Moving from Sandcastle or docify? Old page addresses can redirect to the new pages:

```bash
owl build MyLib.csproj --sandcastle    # html/T_MyLib_Storage.htm
owl build MyLib.csproj --docify        # mylib.storage/ and mylib.storage/read
```

## Check Documentation in CI

```bash
owl verify MyLib.csproj
```

Lists undocumented API, and fails on broken `<see cref="..."/>` links.

## More Options

| Command | Option | What It Does |
|---|---|---|
| all | `--name <text>` | Site name |
| all | `--tfm <tfm>` | Framework to document, e.g. `net48` |
| all | `-c <name>` | Build configuration, e.g. `Release` |
| serve | `--port <n>` | Port to use (default 8080) |
| build | `--out <dir>` | Where to write the site |
| serve, build | `--docs <dir>` | Folder of your own pages |
| serve, build | `--logo <file>` | Header icon |
| serve, build | `--skip-undocumented` | Hide anything without a summary |

Run `owl --help` to see all options.

## Development

- `owl/` is the command-line tool
- `owl-gen/` reads projects and writes the docs data
- `owl-site/` turns that data into the website

Run it from source:

```bash
dotnet run --project owl -- serve MyLib.csproj
```

Design decisions are explained in [NOTES](NOTES.md).
