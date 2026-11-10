"""OSM の日本全国 amenity=parking のうち、name / operator / brand に
「タイムズ」「Times」「パーク24」を含むものを Overpass API で取得して保存する。

    python -I tools/fetch_osm.py data/raw/osm_times_YYYYMMDD.json

取得先は OpenStreetMap（Overpass API）のみ。タイムズ公式サイトへのアクセスは一切しない。
データは © OpenStreetMap contributors（ODbL 1.0）。
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
PAT = "タイムズ|Times|パーク ?(24|２４)"
QUERY = f"""[out:json][timeout:600];
area["ISO3166-1"="JP"][admin_level=2]->.jp;
(
  nwr[amenity=parking][name~"{PAT}",i](area.jp);
  nwr[amenity=parking][operator~"{PAT}",i](area.jp);
  nwr[amenity=parking][brand~"{PAT}",i](area.jp);
);
out center tags meta;"""
USER_AGENT = "TimesParkingMap/1.0 (unofficial personal map; OSM data consumer)"
if os.environ.get("TM_OVERPASS_ENDPOINTS"):
    ENDPOINTS = os.environ["TM_OVERPASS_ENDPOINTS"].split(",")


def fetch():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=body, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=660) as res:
                    data = json.loads(res.read().decode("utf-8"))
                if "elements" in data and data["elements"]:
                    print(f"ok endpoint={ep} elements={len(data['elements'])}")
                    return data
                last = f"empty from {ep}: {data.get('remark')}"
            except Exception as exc:  # noqa: BLE001
                last = f"{ep}: {exc}"
            print("retry:", last)
            time.sleep(5)
    raise SystemExit(f"Overpass 取得失敗: {last}")


def main(out):
    data = fetch()
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"saved {out} bytes={os.path.getsize(out)} osm_base={data.get('osm3s', {}).get('timestamp_osm_base')}")


if __name__ == "__main__":
    main(sys.argv[1])
