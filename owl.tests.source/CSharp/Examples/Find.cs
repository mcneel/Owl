// Not compiled: read by the <code source="..."/> in DocTags.cs.
var tagged = new Samples.Docs.Tagged();

#region find
    bool found = tagged.Find<string>("key");
#endregion

System.Console.WriteLine("outside the region");
