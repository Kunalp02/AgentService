
﻿//namespace Agent.Infrastructure.Groups;

//public static class JwtGroupClaimParser
//{
//    public static HashSet<Guid> ParseIds(IEnumerable<string>? rawValues)
//    {
//        var ids = new HashSet<Guid>();
//        foreach (var piece in EnumeratePieces(rawValues))
//        {
//            if (TryParseId(piece, out var id))
//                ids.Add(id);
//        }
//        return ids;
//    }

//    private static IEnumerable<string> EnumeratePieces(IEnumerable<string>? rawValues)
//    {
//        if (rawValues is null)
//            yield break;

//        foreach (var raw in rawValues)
//        {
//            if (string.IsNullOrWhiteSpace(raw))
//                continue;
//            var trimmed = raw.Trim();
//            if (trimmed.Contains(','))
//            {
//                foreach (var part in trimmed.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
//                    yield return part;
//            }
//            else
//            {
//                yield return trimmed;
//            }
//        }
//    }

//    private static bool TryParseId(string piece, out Guid id)
//    {
//        id = Guid.Empty;
//        var trimmed = piece.Trim();
//        var colon = trimmed.IndexOf(':');
//        var left = colon > 0 ? trimmed[..colon].Trim() : trimmed;
//        return Guid.TryParse(left, out id) && id != Guid.Empty;
//    }
//}
