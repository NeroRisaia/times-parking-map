'use strict';

// タイムズ駐車場マップ（非公式）
// 喫煙所マップと同じ方式: OpenStreetMap から抽出した全国データを JSON で同梱し、
// Service Worker で端末に保持、端末内で近い順に探して Leaflet に表示する。通信は地図タイルだけ。
// タイムズ公式サイトへのアクセスは一切しない（空き状況・料金は扱わない）。

const JAPAN_CENTER = [35.68, 139.76];
const START_ZOOM = 11;
const LOCATED_ZOOM = 15;
const LIST_MAX = 30;
const LOCAL_SEARCH_DEG = 0.45; // 一覧・最寄りの探索範囲（約50km）
const PIN_MAX = 800;
const NO_NAME = 'タイムズ駐車場（名称の登録なし）';

const el = {
  status: document.getElementById('status'),
  dataInfo: document.getElementById('dataInfo'),
  aboutData: document.getElementById('aboutData'),
  geoStatus: document.getElementById('geoStatus'),
  nearest: document.getElementById('nearest'),
  locate: document.getElementById('locate'),
  empty: document.getElementById('empty'),
  listTitle: document.getElementById('listTitle'),
  items: document.getElementById('items'),
};

const state = {
  data: null,
  pos: null,
  selected: null,
  heading: null,
};

const map = L.map('map', { zoomControl: true }).setView(JAPAN_CENTER, START_ZOOM);
// 「© OpenStreetMap contributors」を地図上に常時表示（Leaflet 標準のクレジット欄）
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
}).addTo(map);

const markers = new Map();
const pIcon = L.divIcon({ className: 'p-pin', html: 'P', iconSize: [28, 28], popupAnchor: [0, -14] });
let userMarker = null;

// ---------- データ ----------
const dataReady = fetch('./data/times-jp.json', { signal: AbortSignal.timeout(8000) })
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (!data || !Array.isArray(data.points)) throw new Error('bad data');
    state.data = data;
    const [y, m, d] = data.osm_date.split('-');
    const when = `${Number(y)}年${Number(m)}月${Number(d)}日`;
    el.dataInfo.textContent = `データ取得時点: OpenStreetMap ${when}時点（${Number(y)}年${Number(m)}月取得）`;
    el.aboutData.textContent = `データ取得時点: ${when}（OpenStreetMap のデータベース時刻 ${data.osm_base}）。全国 ${data.points.length.toLocaleString('ja-JP')}件。`;
    render();
    return data;
  })
  .catch(() => {
    setStatus('データを読み込めませんでした。通信できる場所で一度開き直してください。');
    return null;
  });

function pointAt(i) {
  const p = state.data.points[i];
  return { id: i, lat: p[0] / 1e5, lon: p[1] / 1e5, name: p[2] || NO_NAME, osm: p[3] };
}

// ---------- 描画 ----------
// 経路案内（移動手段は車）。座標は地点データそのもの
function mapsUrl(item) {
  return (
    'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
    encodeURIComponent(`${item.lat},${item.lon}`)
  );
}

function osmUrl(item) {
  const type = { n: 'node', w: 'way', r: 'relation' }[item.osm[0]];
  return `https://www.openstreetmap.org/${type}/${item.osm.slice(1)}`;
}

function popupNode(item) {
  const wrap = document.createElement('div');
  wrap.className = 'popup';
  const t = document.createElement('p');
  t.className = 'name';
  const strong = document.createElement('strong');
  strong.textContent = item.name;
  t.appendChild(strong);
  wrap.appendChild(t);
  const dist = document.createElement('p');
  dist.className = 'pop-dist';
  dist.textContent = state.pos
    ? `現在地から 約${formatDistance(haversine(state.pos, item))}（直線距離）`
    : '現在地からの距離: 現在地が取得できていません';
  wrap.appendChild(dist);
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = '空き状況・料金は表示していません。現地・公式でご確認ください。';
  wrap.appendChild(note);
  const go = document.createElement('a');
  go.className = 'popup-go';
  go.href = mapsUrl(item);
  go.target = '_blank';
  go.rel = 'noopener';
  go.textContent = 'ここへ行く（Googleマップで車の経路案内）';
  wrap.appendChild(go);
  const edit = document.createElement('a');
  edit.className = 'osm-edit';
  edit.href = osmUrl(item);
  edit.target = '_blank';
  edit.rel = 'noopener';
  edit.textContent = 'OpenStreetMap でこの地点を見る・修正する';
  wrap.appendChild(edit);
  return wrap;
}

function referencePoint() {
  if (state.pos && map.getBounds().contains([state.pos.lat, state.pos.lon])) return state.pos;
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng };
}

function render() {
  if (!state.data) return;
  const pts = state.data.points;
  const b = map.getBounds().pad(0.1);
  const s = b.getSouth() * 1e5, n = b.getNorth() * 1e5, w = b.getWest() * 1e5, e = b.getEast() * 1e5;
  const c = map.getCenter();
  const inView = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p[0] < s || p[0] > n || p[1] < w || p[1] > e) continue;
    inView.push(i);
  }
  if (inView.length > PIN_MAX) {
    const d = (i) => (pts[i][0] / 1e5 - c.lat) ** 2 + (pts[i][1] / 1e5 - c.lng) ** 2;
    inView.sort((a, b2) => d(a) - d(b2));
    inView.length = PIN_MAX;
  }
  renderMarkers(inView);
  const strict = map.getBounds();
  const visible = inView.filter((i) => strict.contains([pts[i][0] / 1e5, pts[i][1] / 1e5])).length;
  el.empty.hidden = visible > 0;
  renderList();
  updateStatus(visible);
  updateNearestButton();
}

function renderMarkers(ids) {
  const want = new Set(ids);
  for (const [id, marker] of markers) {
    if (want.has(id)) continue;
    marker.remove();
    markers.delete(id);
  }
  for (const id of ids) {
    if (markers.has(id)) continue;
    const item = pointAt(id);
    const marker = L.marker([item.lat, item.lon], { icon: pIcon, keyboard: true, title: item.name });
    marker.bindPopup(() => popupNode(pointAt(id)), { maxWidth: 280 });
    marker.on('click', () => { state.selected = id; });
    marker.addTo(map);
    markers.set(id, marker);
  }
}

function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

// ±0.45度の矩形で絞り、近い順に30件
function nearest(pos) {
  const cosLat = Math.cos((pos.lat * Math.PI) / 180);
  const near = [];
  const pts = state.data.points;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const dLat = p[0] / 1e5 - pos.lat;
    if (dLat > LOCAL_SEARCH_DEG || dLat < -LOCAL_SEARCH_DEG) continue;
    const dLon = (p[1] / 1e5 - pos.lon) * cosLat;
    if (dLon > LOCAL_SEARCH_DEG || dLon < -LOCAL_SEARCH_DEG) continue;
    near.push({ score: dLat * dLat + dLon * dLon, i });
  }
  near.sort((a, b) => a.score - b.score);
  return near.slice(0, LIST_MAX).map(({ i }) => i);
}

function renderList() {
  const ref = referencePoint();
  const isUser = ref === state.pos;
  el.listTitle.textContent = isUser ? '現在地から近い駐車場' : '地図の中心から近い駐車場';
  const ids = nearest(ref);
  const rows = document.createDocumentFragment();
  if (!ids.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'この付近に登録地点がありません（OpenStreetMap に未登録の駐車場は表示されません）';
    rows.appendChild(li);
  }
  for (const id of ids) {
    const item = pointAt(id);
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const title = document.createElement('span');
    title.textContent = item.name;
    const dist = document.createElement('span');
    dist.className = 'dist';
    dist.textContent = ` (${formatDistance(haversine(ref, item))})`;
    button.append(title, dist);
    button.addEventListener('click', () => select(id));
    li.appendChild(button);
    rows.appendChild(li);
  }
  el.items.replaceChildren(rows);
}

// 地点へ移動してポップアップを開く
function select(id) {
  state.selected = id;
  const item = pointAt(id);
  // アニメーションなしで移動してから開く（近距離のパン中に開くと、ポップアップの自動スクロールがパンを打ち消すため）
  map.closePopup();
  map.setView([item.lat, item.lon], Math.max(map.getZoom(), 17), { animate: false });
  const marker = markers.get(id);
  if (marker) marker.openPopup();
}

function updateStatus(count) {
  const total = state.data.points.length.toLocaleString('ja-JP');
  const where = state.pos ? '' : '（現在地なし：地図を動かして探せます）';
  setStatus(`表示中 ${count.toLocaleString('ja-JP')}件／全国 ${total}件${where}`);
}

function setStatus(text) {
  el.status.textContent = text;
}

map.on('moveend', render);

// ---------- 現在地 ----------
// 読み込み直後に開始 → 概略位置（getCurrentPosition）→ GPS（watchPosition）。
// 位置が届くたびに現在地へ寄せる（追従モード）。「最寄り」直後の10秒間だけ追従を止める。
const geoLog = [];

function logGeo(event, detail = {}) {
  const entry = { t: new Date().toISOString(), event, secure: window.isSecureContext, ...detail };
  geoLog.push(entry);
  console.info('[タイムズ駐車場マップ] 位置情報', entry);
}

function setGeoStatus(text) {
  el.geoStatus.hidden = !text;
  el.geoStatus.textContent = text;
}

// 取れなかった理由を、落ち着いた言葉で伝える
function geoFailureText(error) {
  if (!window.isSecureContext) {
    return 'このアドレスでは、ブラウザの安全上の制限により位置情報が使えないため、現在地は表示していません（アプリの不具合ではありません。https の公開版ではそのまま使えます）。地図を動かして探せます。';
  }
  if (error && error.code === 1) return '位置情報の利用が許可されていないため、現在地は表示していません。ブラウザや端末の設定で許可すると使えます。それまでは、地図を動かして探せます。';
  if (error && error.code === 3) return '現在地の測位に時間がかかっています。少し待ってから、もう一度「現在地」を押してください。';
  return '今は現在地を測位できませんでした。電波の届く場所で、もう一度「現在地」を押してください。';
}

const NEAREST_FOLLOW_PAUSE_MS = 10000;
let followPausedUntil = 0;
function followPaused() {
  return Date.now() < followPausedUntil;
}

function centerOn(pos) {
  map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), LOCATED_ZOOM));
}

function onPosition(position, source) {
  const pos = { lat: position.coords.latitude, lon: position.coords.longitude };
  const first = state.pos == null;
  const { heading, speed } = position.coords;
  state.heading = speed >= AHEAD_SPEED_MS && Number.isFinite(heading) ? heading : null;
  state.pos = pos;
  if (first) logGeo('ok', { source, accuracy: Math.round(position.coords.accuracy) });
  if (!userMarker) userMarker = L.marker([pos.lat, pos.lon], { title: '現在地' }).addTo(map);
  else userMarker.setLatLng([pos.lat, pos.lon]);
  if (!followPaused()) centerOn(pos); // 追従（「最寄り」直後の一時停止中は除く）
  if (first) setGeoStatus('');
  render();
}

function onGeoError(error, source) {
  logGeo('error', { source, code: error && error.code, message: error && error.message });
  if (state.pos) return;
  setGeoStatus(geoFailureText(error));
}

let watching = false;
function startGeolocation() {
  if (!('geolocation' in navigator)) {
    logGeo('unsupported');
    setGeoStatus('この端末・ブラウザは位置情報に対応していないため、現在地は表示していません。地図を動かして探せます。');
    return;
  }
  if (watching) return;
  watching = true;
  logGeo('start');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (state.pos == null) onPosition(position, 'coarse');
    },
    (error) => logGeo('coarse-error', { code: error.code, message: error.message }),
    { enableHighAccuracy: false, maximumAge: 600000, timeout: 5000 },
  );
  navigator.geolocation.watchPosition(
    (position) => onPosition(position, 'gps'),
    (error) => {
      watching = false;
      onGeoError(error, 'gps');
    },
    { enableHighAccuracy: true, maximumAge: 10000 },
  );
}

// 「現在地」ボタン: 一時停止中でもすぐ追従に戻して現在地へ寄せる
el.locate.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    startGeolocation();
    return;
  }
  followPausedUntil = 0;
  logGeo('follow-resumed', { by: 'locate-button' });
  if (state.pos) centerOn(state.pos);
  setGeoStatus('現在地を取得しています…');
  logGeo('button');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      onPosition(position, 'button');
      centerOn(state.pos);
      setGeoStatus('');
    },
    (error) => {
      logGeo('button-error', { code: error.code, message: error.message });
      setGeoStatus(state.pos ? '' : geoFailureText(error));
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
  );
  startGeolocation();
});

// ---------- 「最寄り」ボタン ----------
// 現在地から近い順の先頭。走行中（秒速3m以上で進行方向あり）は 5km 以内・左右75度以内の「前方」を優先。
// 押すと地図をその地点へ動かしてポップアップを開き、10秒間だけ追従を止める（10秒後の次の測位から再開）。
const AHEAD_SPEED_MS = 3;
const AHEAD_ANGLE_DEG = 75;
const AHEAD_MAX_M = 5000;

function bearing(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function nearestSpot(pos) {
  if (!state.data || !pos) return null;
  const items = nearest(pos).map((id) => ({ ...pointAt(id), distance: haversine(pos, pointAt(id)) }));
  if (!items.length) return null;
  items.sort((a, b) => a.distance - b.distance);
  if (state.heading != null) {
    const ahead = items.find((item) => {
      if (item.distance > AHEAD_MAX_M) return false;
      const diff = Math.abs(bearing(pos, item) - state.heading) % 360;
      return Math.min(diff, 360 - diff) <= AHEAD_ANGLE_DEG;
    });
    if (ahead) return { item: ahead, ahead: true };
  }
  return { item: items[0], ahead: false };
}

function updateNearestButton() {
  const target = state.pos ? nearestSpot(state.pos) : null;
  el.nearest.textContent = target
    ? `最寄り（${target.ahead ? '前方 ' : ''}${formatDistance(target.item.distance)}）`
    : '最寄り';
}

function goNearest(pos, note) {
  const target = nearestSpot(pos);
  if (!target) {
    logGeo('nearest-none');
    setGeoStatus('現在地から約50km以内に、登録地点がありません（OpenStreetMap に未登録の駐車場は表示されません）。');
    return;
  }
  setGeoStatus(note || '');
  followPausedUntil = Date.now() + NEAREST_FOLLOW_PAUSE_MS; // この間は測位が届いても現在地へ戻さない
  logGeo('nearest-ok', { id: target.item.id, name: target.item.name, distance: Math.round(target.item.distance), ahead: target.ahead });
  logGeo('follow-paused', { ms: NEAREST_FOLLOW_PAUSE_MS });
  select(target.item.id);
}

el.nearest.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    logGeo('unsupported');
    setGeoStatus('この端末・ブラウザは位置情報に対応していないため、現在地は表示していません。地図を動かして探せます。');
    return;
  }
  setGeoStatus('現在地を取得して、最寄りの駐車場を探しています…');
  logGeo('nearest');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      followPausedUntil = Date.now() + NEAREST_FOLLOW_PAUSE_MS; // 測位で現在地へ戻らないよう先に止める
      onPosition(position, 'nearest');
      goNearest(state.pos);
    },
    (error) => {
      logGeo('nearest-error', { code: error.code, message: error.message });
      if (state.pos) {
        goNearest(state.pos, `${geoFailureText(error)} 前回の現在地から探しました。`);
        return;
      }
      setGeoStatus(geoFailureText(error));
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
  );
  startGeolocation();
});

startGeolocation();

// ---------- オフライン用 ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.__tm = { dataReady, state, map, geoLog, startGeolocation, followPaused, mapsUrl, markers }; // 動作確認用
