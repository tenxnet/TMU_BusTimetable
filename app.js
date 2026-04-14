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
  timelineSubtitle: document.getElementById('timeline-subtitle'),
  stop: document.getElementById('stop'),
  date: document.getElementById('date'),
  time: document.getElementById('time'),
  searchBtn: document.getElementById('search-btn'),
  nowBtn: document.getElementById('now-btn'),
  upcomingList: document.getElementById('upcoming-list'),
  scheduleList: document.getElementById('schedule-list'),
  note: document.getElementById('note'),
};

let timetable = null;
let calendar = null;
let activeResult = null;
let liveClockTimer = null;

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
  const currentMinutes = toMinutes(timeStr);
  const upcoming = [];

  for (const departure of departures) {
    if (toMinutes(departure) < currentMinutes) {
      continue;
    }

    upcoming.push({
      departure,
      arrival: addMinutes(departure, rideMin),
      minutesToRide: rideMin,
    });

    if (upcoming.length === 1) {
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
    arrival: '',
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
  result.arrival = upcoming[0].arrival;
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
        <p class="trip-summary">本日のバスは終了しました</p>
      </article>
    `;
    return;
  }

  const item = items[0];
  elements.upcomingList.innerHTML = `
    <article class="trip-card trip-card-single">
      <p class="trip-summary">
        <span>${escapeHtml(item.departure)} 発</span>
        <span class="trip-arrow">→</span>
        <span>到着目安 ${escapeHtml(item.arrival)}</span>
      </p>
    </article>
  `;
}

function renderSchedule(dateStr, stopLabel, serviceType, items, departures, now) {
  const currentLine = dateStr === now.date ? now.time : '';
  const hours = Array.from({ length: 17 }, (_, index) => 6 + index);
  const hasCurrentLine = Boolean(currentLine);
  const currentMinute = hasCurrentLine ? toMinutes(currentLine) : null;
  const firstMinute = toMinutes('06:00');
  const lastMinute = toMinutes('23:00');
  const linePosition = hasCurrentLine
    ? Math.max(0, Math.min(100, ((currentMinute - firstMinute) / (lastMinute - firstMinute)) * 100))
    : null;

  const chipsByHour = new Map();
  for (const departure of departures) {
    const hour = Number(departure.slice(0, 2));
    if (!chipsByHour.has(hour)) {
      chipsByHour.set(hour, []);
    }
    chipsByHour.get(hour).push(departure);
  }

  const currentLabel = hasCurrentLine ? `現在時刻 ${currentLine}` : `${dateStr} の選択時刻`;
  elements.timelineSubtitle.textContent = `${stopLabel} · ${currentLabel} · ${serviceType}`;

  elements.scheduleList.innerHTML = `
    <div class="timeline-track">
      <div class="timeline-intro">日中の便を上から順に表示しています</div>
      <div class="timeline-hours">
        ${hasCurrentLine ? `<div class="timeline-now" style="top: ${linePosition}%;"><span>${escapeHtml(currentLine)}</span></div>` : ''}
        ${hours.map((hour) => {
          const departuresInHour = chipsByHour.get(hour) || [];
          return `
            <section class="timeline-hour">
              <div class="timeline-hour-label">${pad2(hour)}:00</div>
              <div class="timeline-hour-body">
                <div class="timeline-hour-line"></div>
                ${departuresInHour.map((departure) => {
                  const minute = Number(departure.slice(3, 5));
                  const minutePosition = Math.max(0, Math.min(100, (minute / 60) * 100));
                  return `
                    <div class="timeline-chip" style="top: ${minutePosition}%;">
                      <span class="timeline-dot"></span>
                      <strong>${escapeHtml(departure)}</strong>
                    </div>
                  `;
                }).join('')}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    </div>
  `;

  if (serviceType === '運休') {
    elements.note.textContent = 'この日は運休です。';
  } else if (items.length === 0) {
    elements.note.textContent = '本日のバスは終了しました';
  } else {
    elements.note.textContent = `次の便は ${items[0].departure} 発、到着目安は ${items[0].arrival} です。`;
  }
}

function applyResult(result) {
  activeResult = result;
  const now = formatTokyoNow();
  elements.currentTime.textContent = now.display;
  elements.serviceType.textContent = result.serviceType;
  elements.selectedStopLabel.textContent = result.stopLabel;
  renderUpcoming(result.upcoming);
  renderSchedule(result.date, result.stopLabel, result.serviceType, result.upcoming, departuresForDate(result.date, result.stopKey), now);
}

function refreshLiveClock() {
  if (!activeResult) {
    return;
  }

  const now = formatTokyoNow();
  elements.currentTime.textContent = now.display;
  renderSchedule(
    activeResult.date,
    activeResult.stopLabel,
    activeResult.serviceType,
    activeResult.upcoming,
    departuresForDate(activeResult.date, activeResult.stopKey),
    now,
  );
}

function syncRouteInfo() {
  elements.routeLabel.textContent = '東京都立大学 南大沢⇔日野キャンパス連絡バス タイムテーブル';
  elements.routeName.textContent = timetable.meta.route;
  elements.note.textContent = `1日の便を時刻順に追える表示です。赤線が現在時刻、点が発車時刻です。`;
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

  if (liveClockTimer) {
    clearInterval(liveClockTimer);
  }
  liveClockTimer = window.setInterval(refreshLiveClock, 30000);
  refreshLiveClock();

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
  elements.upcomingList.innerHTML = `
    <article class="trip-card">
      <p class="trip-summary">読み込みに失敗しました</p>
    </article>
  `;
  elements.note.textContent = String(error);
});
