const calendarUrl = './data/2026/first/bus_calendar.json';
const timetableUrl = './data/2026/first/bus_timetable.json';
const timeLayout = '15:04';
const stopLabels = {
  minamiosawa_east: '南大沢キャンパス東',
  minamiosawa_west: '南大沢キャンパス西',
  hino: '日野キャンパス',
};

const elements = {
  routeLabel: document.getElementById('route-label'),
  currentTime: document.getElementById('current-time'),
  serviceType: document.getElementById('service-type'),
  routeName: document.getElementById('route-name'),
  selectedStopLabel: document.getElementById('selected-stop-label'),
  stop: document.getElementById('stop'),
  date: document.getElementById('date'),
  time: document.getElementById('time'),
  searchBtn: document.getElementById('search-btn'),
  nowBtn: document.getElementById('now-btn'),
  resultMessage: document.getElementById('result-message'),
  resultDetail: document.getElementById('result-detail'),
  upcomingList: document.getElementById('upcoming-list'),
  scheduleList: document.getElementById('schedule-list'),
  note: document.getElementById('note'),
};

let timetable = null;
let calendar = null;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatTokyoNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
    display: `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`,
  };
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function addMinutes(value, minutes) {
  const total = toMinutes(value) + minutes;
  const hours = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mins = ((total % 1440) + 1440) % 1440 % 60;
  return `${pad2(hours)}:${pad2(mins)}`;
}

function serviceTypeForDate(dateStr) {
  if (calendar.two_bus_dates.includes(dateStr)) {
    return 'two_bus';
  }
  if (calendar.one_bus_dates.includes(dateStr)) {
    return 'one_bus';
  }
  return 'no_service';
}

function serviceTypeLabel(serviceType) {
  switch (serviceType) {
    case 'two_bus':
      return '2台運行';
    case 'one_bus':
      return '1台運行';
    default:
      return '運休';
  }
}

function departuresForDate(dateStr, stopKey) {
  const serviceType = serviceTypeForDate(dateStr);
  if (serviceType === 'no_service') {
    return [];
  }
  return [...timetable.timetables[serviceType][stopKey]];
}

function buildUpcoming(dateStr, departures, timeStr) {
  const rideMin = timetable.meta.travel_time_minutes.min;
  const rideMax = timetable.meta.travel_time_minutes.max;
  const currentMinutes = toMinutes(timeStr);
  const upcoming = [];

  for (const departure of departures) {
    if (toMinutes(departure) < currentMinutes) {
      continue;
    }

    upcoming.push({
      departure,
      arrivalMin: addMinutes(departure, rideMin),
      arrivalMax: addMinutes(departure, rideMax),
      minutesToRide: rideMin,
      minutesToExit: 0,
      minutesToFinish: rideMax,
    });

    if (upcoming.length === 3) {
      break;
    }
  }

  return upcoming;
}

function buildResult(dateStr, timeStr, stopKey) {
  const stopLabel = stopLabels[stopKey];
  const serviceType = serviceTypeForDate(dateStr);
  const departures = departuresForDate(dateStr, stopKey);
  const upcoming = buildUpcoming(dateStr, departures, timeStr);

  const result = {
    stopKey,
    stopLabel,
    date: dateStr,
    time: timeStr,
    serviceType: serviceTypeLabel(serviceType),
    message: '',
    nextDeparture: '',
    arrivalMin: '',
    arrivalMax: '',
    upcoming,
  };

  if (serviceType === 'no_service') {
    result.message = 'この日は運休です。';
    return result;
  }

  if (upcoming.length === 0) {
    result.message = '本日のバスは終了しました';
    return result;
  }

  result.nextDeparture = upcoming[0].departure;
  result.arrivalMin = upcoming[0].arrivalMin;
  result.arrivalMax = upcoming[0].arrivalMax;
  result.message = `次のバスは ${result.nextDeparture} 発です`;
  return result;
}

function setBusy(flag) {
  elements.searchBtn.disabled = flag;
  elements.nowBtn.disabled = flag;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderUpcoming(items) {
  if (!items.length) {
    elements.upcomingList.innerHTML = `
      <article class="trip-card">
        <header>
          <strong>結果なし</strong>
          <small>本日のバスは終了しました</small>
        </header>
        <p class="note">本日のバスは終了しました</p>
      </article>
    `;
    return;
  }

  elements.upcomingList.innerHTML = items.map((item) => `
    <article class="trip-card">
      <header>
        <strong>${escapeHtml(item.departure)} 発</strong>
        <small>約 ${escapeHtml(item.minutesToRide)} - ${escapeHtml(item.minutesToFinish)} 分</small>
      </header>
      <div class="trip-grid">
        <div class="mini"><span>到着目安 早い方</span><strong>${escapeHtml(item.arrivalMin)}</strong></div>
        <div class="mini"><span>到着目安 遅い方</span><strong>${escapeHtml(item.arrivalMax)}</strong></div>
        <div class="mini"><span>時刻</span><strong>${escapeHtml(item.departure)}</strong></div>
      </div>
    </article>
  `).join('');
}

function renderSchedule(dateStr, stopLabel, serviceType, items) {
  const header = `
    <div class="schedule-item">
      <div class="left">
        <div class="depart">${escapeHtml(dateStr)}</div>
        <div class="arrive">${escapeHtml(stopLabel)} で検索中</div>
      </div>
      <div>${escapeHtml(serviceType)}</div>
    </div>
  `;

  const body = items.length
    ? items.map((item) => `
      <div class="schedule-item">
        <div class="left">
          <div class="depart">${escapeHtml(item.departure)} 発</div>
          <div class="arrive">到着 ${escapeHtml(item.arrivalMin)} - ${escapeHtml(item.arrivalMax)}</div>
        </div>
        <div>次便候補</div>
      </div>
    `).join('')
    : `
      <div class="schedule-item">
        <div class="left">
          <div class="depart">本日のバスは終了しました</div>
          <div class="arrive">${escapeHtml(stopLabel)}</div>
        </div>
        <div>${escapeHtml(serviceType)}</div>
      </div>
    `;

  elements.scheduleList.innerHTML = header + body;
}

function applyResult(result) {
  elements.currentTime.textContent = `${result.date} ${result.time}`;
  elements.serviceType.textContent = result.serviceType;
  elements.selectedStopLabel.textContent = result.stopLabel;
  elements.resultMessage.textContent = result.message || '検索完了';
  elements.resultDetail.textContent = result.nextDeparture
    ? `次の便: ${result.nextDeparture} / 到着目安: ${result.arrivalMin} - ${result.arrivalMax}`
    : result.message;
  renderUpcoming(result.upcoming);
  renderSchedule(result.date, result.stopLabel, result.serviceType, result.upcoming);
}

function syncRouteInfo() {
  elements.routeLabel.textContent = `${timetable.meta.route} · ${timetable.meta.year}年${timetable.meta.term} · GitHub Pages版`;
  elements.routeName.textContent = timetable.meta.route;
  elements.note.textContent = `旅程時間は ${timetable.meta.travel_time_minutes.min}〜${timetable.meta.travel_time_minutes.max} 分の概算です。現在時刻検索は Asia/Tokyo 基準で処理しています。`;
}

function populateStops() {
  const entries = timetable.meta.stops;
  elements.stop.innerHTML = entries.map((stopKey) => `<option value="${stopKey}">${stopLabels[stopKey]}</option>`).join('');
  elements.stop.value = 'hino';
}

async function runSearch(kind) {
  setBusy(true);
  try {
    const stopKey = elements.stop.value;
    const dateStr = elements.date.value;
    const timeStr = elements.time.value;
    const result = buildResult(dateStr, timeStr, stopKey);
    applyResult(result);
    window.history.replaceState(null, '', `?stop=${encodeURIComponent(stopKey)}&date=${encodeURIComponent(dateStr)}&time=${encodeURIComponent(timeStr)}`);
  } finally {
    setBusy(false);
  }
}

async function init() {
  [calendar, timetable] = await Promise.all([
    fetch(calendarUrl).then((response) => response.json()),
    fetch(timetableUrl).then((response) => response.json()),
  ]);

  populateStops();
  syncRouteInfo();

  const params = new URLSearchParams(window.location.search);
  const now = formatTokyoNow();
  elements.date.value = params.get('date') || now.date;
  elements.time.value = params.get('time') || now.time;
  elements.stop.value = params.get('stop') || 'hino';

  const initial = buildResult(elements.date.value, elements.time.value, elements.stop.value);
  applyResult(initial);

  elements.searchBtn.addEventListener('click', () => runSearch('next'));
  elements.nowBtn.addEventListener('click', () => {
    const current = formatTokyoNow();
    elements.date.value = current.date;
    elements.time.value = current.time;
    applyResult(buildResult(current.date, current.time, elements.stop.value));
  });

  elements.stop.addEventListener('change', () => {
    applyResult(buildResult(elements.date.value, elements.time.value, elements.stop.value));
  });
}

init().catch((error) => {
  elements.resultMessage.textContent = '読み込みに失敗しました';
  elements.resultDetail.textContent = String(error);
});