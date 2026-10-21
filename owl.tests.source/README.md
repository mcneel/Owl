# owl.tests.source

Sample projects that [owl.tests](../owl.tests) documents. They are never run, only read by owl.

- `CSharp/` – a C# library using most C# features and documentation tags
- `VisualBasic/` – a Visual Basic library that builds on the C# one
- `docs/api/` – hand-written pages for the sample site

Some problems are there on purpose, such as a broken `<see cref>`, a missing example file and an
undocumented member, so `owl verify` has something to find.

To see the sample site:

```bash
dotnet run --project owl -- serve owl.tests.source/CSharp/Samples.CSharp.csproj owl.tests.source/VisualBasic/Samples.VisualBasic.vbproj --docs owl.tests.source/docs/api
```
