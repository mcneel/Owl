# <img src="https://media.githubusercontent.com/media/mcneel/Owl/main/art/icon.png" alt="" width="40" align="top"> Owl

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
docs/api/MyLib/SORT.txt           category order, optional
```

The sidebar lists your categories, and owl shows a placeholder for any page you haven't written yet.

Categories are listed alphabetically. To choose the order, list them one per line in `SORT.txt`:

```
Storage
Shapes
```

Categories you leave out follow, alphabetically.

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

Pages can link to your API. Write the name the way you would in `<see cref="..."/>`:

```markdown
[FileStore](xref:FileStore) saves files. Call [](xref:FileStore.Read(string)) to read one back.
```

Leave the text empty and owl fills in the name. Qualify a name that matches more than one thing, as in
`xref:MyLib.Storage.FileStore`, or give its doc id, as in `xref:M:MyLib.FileStore.Read(System.String)`.

## Documentation Version

```csharp
/// <summary>Saves files.</summary>
/// <since>2.1</since>
public class FileStore { }
```

```bash
owl build MyLib.csproj --api-versions 3,2,1
```

Readers pick a version from the header and see what existed up to the next version listed: picking 2 shows
what 2.1 added, but not what 3 added. Picking an older version adds it to the address, as `?version=2`, so a
link to the page opens on that version; without it, a page opens on the newest.

The header's What's New link lists what the picked version added and made obsolete, up to the next version
listed. To compare any two versions, open `whatsnew/8.4...8.12/`: it lists what came after 8.4, up to and including 8.12. That works on a plain file host only for
the listed versions; build with `--server` (below) for any pair.

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

Each old address gets a page that forwards the reader. If your host can send redirects itself, answer from
`redirects.json` in the output instead. It maps each old address, lower case and without a trailing slash, to its
new one. Add the request's query to the new address's own.

## Member Link Previews

A member's address reads `type/mylib.storage/?member=read#read`, so a pasted link can preview as that member
rather than its type. A plain file host previews it as the type. To preview the member, build with `--server`:

```bash
owl build MyLib.csproj --base /api/mylib --server -o app
```

The site goes in `app/site`, with a node server beside it. Push `app` to any node host, Heroku included, and it
starts with `npm start` on the port the host gives it. It also redirects the old addresses of `--sandcastle` and
`--docify`.

## Check Documentation in CI

```bash
owl verify MyLib.csproj
```

Lists undocumented API, and fails on broken `<see cref="..."/>` links and broken `xref:` links in your pages.

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
| serve, build | `--favicon <file>` | Browser tab icon |
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

Design decisions are explained in [NOTES](https://github.com/mcneel/Owl/blob/main/NOTES.md).
