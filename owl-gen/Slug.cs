using System.Text;

namespace Owl.Gen;

/// <summary>
/// Turns documentation comment ids into URL-safe slugs.
/// <para>
/// Slugs are computed here and written into the output, so the site resolves
/// them by lookup instead of reimplementing this rule. Dots survive because
/// they read well in a URL (<c>mylib.storage.storagesite-1</c>); everything
/// else collapses to a hyphen. Parameter types are kept in member anchors so
/// overloads stay distinct.
/// </para>
/// </summary>
static class Slug
{
  /// <summary>
  /// Strips the leading kind prefix ("T:", "M:", ...) from a doc id.
  /// </summary>
  public static string StripPrefix(string docId)
  {
    if (docId.Length > 1 && docId[1] == ':')
    {
      return docId[2..];
    }

    return docId;
  }

  /// <summary>
  /// Lowercases and collapses everything that is not a letter, digit or dot
  /// into single hyphens. Generic arity markers fall out naturally:
  /// <c>StorageSite`1</c> becomes <c>storagesite-1</c>.
  /// </summary>
  public static string Normalize(string value)
  {
    var sb = new StringBuilder(value.Length);
    bool pendingSeparator = false;

    foreach (char c in value)
    {
      if (char.IsLetterOrDigit(c) || c == '.')
      {
        if (pendingSeparator && sb.Length > 0)
        {
          sb.Append('-');
        }

        pendingSeparator = false;
        sb.Append(char.ToLowerInvariant(c));
      }
      else
      {
        pendingSeparator = true;
      }
    }

    return sb.ToString();
  }

  /// <summary>Page slug for a type doc id.</summary>
  public static string ForType(string typeDocId) => Normalize(StripPrefix(typeDocId));

  /// <summary>
  /// Fragment id for a member, relative to its declaring type so anchors stay
  /// short. Falls back to the whole doc id if the prefix does not line up.
  /// </summary>
  public static string ForMember(string memberDocId, string declaringTypeDocId)
  {
    string member = StripPrefix(memberDocId);
    string declaring = StripPrefix(declaringTypeDocId);

    if (member.StartsWith(declaring + ".", StringComparison.Ordinal))
    {
      member = member[(declaring.Length + 1)..];
    }

    string slug = Normalize(member);
    return slug.Length == 0 ? Normalize(StripPrefix(memberDocId)) : slug;
  }

  /// <summary>Slug for a namespace page.</summary>
  public static string ForNamespace(string ns) => Normalize(ns);

  /// <summary>
  /// Slug for a category page, scoped by assembly since categories repeat
  /// across them.
  /// </summary>
  public static string ForCategory(string assembly, string category)
  {
    return Normalize(assembly) + "/" + Normalize(category);
  }
}
