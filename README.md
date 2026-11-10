# タイムズ駐車場マップ（非公式）

> 本アプリは個人が作成した非公式のもので、パーク24株式会社・タイムズとは一切関係ありません。「タイムズ」「パーク24」はパーク24株式会社の登録商標であり、本アプリでは駐車場の場所を指し示すためにのみ名称を使用しています（ロゴは使用していません）。データは OpenStreetMap（© OpenStreetMap contributors、ODbL）の有志による編集に基づきます。正確性・最新性は保証しません（閉鎖・移転・名称変更が反映されていない場合があります）。空き状況・料金は表示していません。ご利用前に公式サイトまたは現地で必ずご確認ください。正確な情報・満空情報は公式アプリ「タイムズの駐車場検索」をご利用ください。誤りに気づいた場合は OpenStreetMap 本体へ修正いただけると助かります。

公開URL: https://nerorisaia.github.io/times-parking-map/

## データのライセンス

本リポジトリの地点データは OpenStreetMap から抽出した派生データベースであり、Open Database License (ODbL) 1.0 で提供されます（https://opendatacommons.org/licenses/odbl/1-0/）。データ取得時点：2026年11月（OpenStreetMap のデータベース時刻 2026-11-10T20:19:45Z）

- 対象ファイル: [`data/times-jp.json`](data/times-jp.json)
- 出典: © OpenStreetMap contributors（https://www.openstreetmap.org/copyright）
- 抽出条件: `amenity=parking` のうち、`name`／`operator`／`brand` に「タイムズ」「Times」「パーク24」を含むもの。他社名の部分一致（例: ネクスパーク24、テクノパーク24、くるっとパーク24、TimeSpace）は除外しています。抽出・変換の手順は `tools/fetch_osm.py` と `tools/build_data.py` にあります。
- 収録項目: 緯度・経度（×10^5 の整数）、名称、OpenStreetMap の要素ID（n/w/r＋番号）
- データの誤りは、このリポジトリではなく OpenStreetMap 本体で修正してください。

## コードのライセンス

上記のデータとは別に、本リポジトリのコード部分（`index.html`、`app.js`、`styles.css`、`sw.js`、`manifest.webmanifest`、`tools/` 内のスクリプト、`icons/` のアイコン画像）は MIT License です。全文は [`LICENSE-CODE.txt`](LICENSE-CODE.txt) をご覧ください。MIT License はデータ（`data/`）と同梱ライブラリには適用されません。

同梱ライブラリ: `vendor/leaflet/` の Leaflet 1.9.4 は BSD-2-Clause License（© 2010-2023 Vladimir Agafonkin, © 2010-2011 CloudMade）です。

## 機能

- 全国のタイムズ駐車場（OpenStreetMap に登録されたもの）を「P」マークで表示します。データはアプリに内蔵しており、通信は地図タイル（OpenStreetMap）だけです。
- 「現在地」で現在地へ移動し、そのまま追従します。
- 「最寄り」で最も近い地点（直線距離）へ移動してポップアップを開きます。ポップアップを押せるよう10秒間だけ追従を止め、その後は追従に戻ります（途中で「現在地」を押すとすぐ戻ります）。
- ポップアップに名称・現在地からの距離と、「Googleマップで案内（車）」「Yahoo!カーナビで案内」ボタンを表示します。
  - Yahoo!カーナビは、公式に公開されている URL スキーム `yjcarnavi://navi/select?lat=…&lon=…&name=…` で目的地を渡します（出典: [Yahoo!マップ公式ブログ](https://map.yahoo.co.jp/blog/archives/20150202_carnavischeme.html)、[Yahoo!カーナビ公式 note](https://note.com/yahoo_carnavi/n/n1d6b819a816c)）。アプリが入ったスマホでのみ開き、ルート選択画面が表示されます。
- 空き状況・料金は扱いません。広告・課金はありません。

## データの更新手順

```
python -I tools/fetch_osm.py data/raw/osm_times_YYYYMMDD.json
python -X utf8 -I tools/build_data.py data/raw/osm_times_YYYYMMDD.json data/times-jp.json
```

更新したら `sw.js` の `CACHE` の番号を上げてください。
