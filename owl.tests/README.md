# owl.tests

Tests for owl. They document the projects in [owl.tests.source](../owl.tests.source) and check the
result. You need the .NET SDK 8.0+ and Node 18+.

## Run

```bash
dotnet test owl.tests                       # docs data and the owl command
node --test owl.tests/site/site.test.js     # the website
```

## What's Here

- `ModelTests.cs` – types, members and signatures in the docs data
- `DocCommentTests.cs` – documentation comment tags
- `CommandLineTests.cs` – the `owl` command: `gen`, `build`, `serve`, `verify`
- `site/` – the website, with and without hand-written pages

To test something new, add it to the samples first, then add a test here.
