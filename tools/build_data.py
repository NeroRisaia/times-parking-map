"""Overpass の生データから、アプリ用の JSON（public/data/times-jp.json）を作る。

    python -I tools/build_data.py data/raw/osm_times_YYYYMMDD.json public/data/times-jp.json

採用条件: amenity=parking で、name / operator / brand のどれかに「タイムズ」「Times」「パーク24」を含むもの。
ただし他社名の部分一致（例: ネクスパーク24・テクノパーク24・くるっとパーク24・TimeSpace）は除外する:
  - 「パーク24」は直前（空白をはさむ場合も）がひらがな・カタカナ・漢字・英字でないときだけ（語の頭）
  - 「Times」は前後が英字でないときだけ（「24hTimes」のように直前が 24h の場合と「Timesclub」は可）
出力は OSM から抽出した派生データベース（© OpenStreetMap contributors, ODbL 1.0）。
"""
import json
import re
import sys
from collections import Counter

KEYS = ("name", "operator", "brand")
RE_TIMES_JA = re.compile(r"タイムズ")
RE_TIMES_EN = re.compile(r"(?:(?<![A-Za-z])|(?<=24[hH]))[Tt][Ii][Mm][Ee][Ss](?![A-Za-z]|(?i:club))|(?<![A-Za-z])times ?club", re.I)
_W = r"぀-ヿ㐀-鿿A-Za-z"  # ひらがな・カタカナ・漢字・英字
RE_PARK24 = re.compile(rf"(?<![{_W}])(?<![{_W}][ 　])パーク ?(24|２４)")


def matches(v):
    return bool(RE_TIMES_JA.search(v) or RE_TIMES_EN.search(v) or RE_PARK24.search(v))


def loose(v):
    return bool(re.search(r"タイムズ|times|パーク ?(24|２４)", v, re.I))


def main(src, out):
    raw = json.load(open(src, encoding="utf-8"))
    base = raw.get("osm3s", {}).get("timestamp_osm_base", "")
    points, excluded = [], Counter()
    seen = set()
    for e in raw["elements"]:
        t = e.get("tags", {})
        if t.get("amenity") != "parking":
            continue
        vals = [t[k] for k in KEYS if t.get(k)]
        if not any(matches(v) for v in vals):
            for v in vals:
                if loose(v):
                    excluded[v] += 1
            continue
        if "lat" in e:
            lat, lon = e["lat"], e["lon"]
        else:
            lat, lon = e["center"]["lat"], e["center"]["lon"]
        key = (e["type"], e["id"])
        if key in seen:
            continue
        seen.add(key)
        name = t.get("name") or t.get("name:ja") or ""
        points.append([round(lat * 1e5), round(lon * 1e5), name, e["type"][0] + str(e["id"])])
    points.sort(key=lambda p: (p[0], p[1]))
    data = {
        "title": "タイムズ駐車場マップ（非公式）",
        "osm_base": base,
        "osm_date": base[:10],
        "built": __import__("datetime").date.today().isoformat(),
        "license": "ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)",
        "attribution": "© OpenStreetMap contributors",
        "source": "OpenStreetMap (Overpass API): amenity=parking with name/operator/brand containing タイムズ / Times / パーク24",
        "fields": ["lat*1e5", "lon*1e5", "name", "osm id (n/w/r + id)"],
        "points": points,
    }
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"raw={len(raw['elements'])} kept={len(points)} excluded={sum(excluded.values())} osm_base={base}")
    for v, n in excluded.most_common():
        print(f"  除外 {n} {v}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
