// 対応期間と出典は静的な案内ページと同じ学期定義から読み込む。
const termRegistryPath = './data/terms.json';
const stopLabels = {
  minamiosawa_east: '南大沢キャンパス東',
  minamiosawa_west: '南大沢キャンパス西',
  hino: '日野キャンパス',
};

const elements = {
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
  calendarTitle: document.getElementById('calendar-title'),
  calendarCaption: document.getElementById('calendar-caption'),
  calendarPrev: document.getElementById('calendar-prev'),
  calendarNext: document.getElementById('calendar-next'),
  calendarGrid: document.getElementById('calendar-grid'),
  scheduleList: document.getElementById('schedule-list'),
  note: document.getElementById('note'),
  dataCoverage: document.getElementById('data-coverage'),
  calendarSource: document.getElementById('calendar-source'),
};

let terms = [];
let termRegistry = null;
// ルート名・停留所など共通の表示には指定された現行学期の meta を使う。
let timetable = null;
let activeResult = null;
let liveClockTimer = null;
let calendarMonth = '';
let liveMode = true;

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
  if (!isValidTime(value)) {
    return NaN;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function addMinutes(value, minutes) {
  const total = toMinutes(value) + minutes;
  const hours = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mins = ((total % 1440) + 1440) % 1440 % 60;
  return `${pad2(hours)}:${pad2(mins)}`;
}

function parseDateParts(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number(value.slice(0, 4)) > 0
    && !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isKnownStop(stopKey) {
  return Object.prototype.hasOwnProperty.call(stopLabels, stopKey);
}

function initialStop(search) {
  const stopKey = new URLSearchParams(search).get('stop');
  return isKnownStop(stopKey) ? stopKey : 'hino';
}

function monthKeyForDate(dateStr) {
  const { year, month } = parseDateParts(dateStr);
  return `${year}-${pad2(month)}`;
}

function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}`;
}

function serviceForDate(dateStr) {
  if (!isValidDate(dateStr)) {
    return { term: null, serviceType: 'unknown' };
  }
  const term = terms.find((item) => dateStr >= item.validFrom && dateStr <= item.validThrough);
  if (!term) {
    return { term: null, serviceType: 'unknown' };
  }
  for (const serviceType of Object.keys(term.timetable.timetables)) {
    if (term.calendar[`${serviceType}_dates`]?.includes(dateStr)) {
      return { term, serviceType };
    }
  }
  return { term, serviceType: 'no_service' };
}

function serviceTypeForDate(dateStr) {
  return serviceForDate(dateStr).serviceType;
}

function serviceTypeLabel(serviceType) {
  switch (serviceType) {
    case 'two_bus':
      return '2台運行';
    case 'three_bus_all':
      return '3台運行（日野デー終日）';
    case 'three_bus_pm':
      return '3台運行（日野デー午後）';
    case 'one_bus':
      return '1台運行';
    case 'no_service':
      return '運休';
    default:
      return 'データ未確認';
  }
}

function departuresForDate(dateStr, stopKey) {
  const { term, serviceType } = serviceForDate(dateStr);
  if (!term || serviceType === 'no_service' || !isKnownStop(stopKey)) {
    return [];
  }
  return [...(term.timetable.timetables[serviceType][stopKey] || [])];
}

function buildUpcoming(dateStr, departures, timeStr) {
  if (!isValidTime(timeStr) || departures.length === 0) {
    return [];
  }
  const { term } = serviceForDate(dateStr);
  const rideMin = (term?.timetable || timetable).meta.travel_time_minutes.min;
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
  const validInput = isValidDate(dateStr) && isValidTime(timeStr) && isKnownStop(stopKey);
  const stopLabel = isKnownStop(stopKey) ? stopLabels[stopKey] : '停留所を選択してください';
  const serviceType = serviceTypeForDate(dateStr);
  const departures = validInput ? departuresForDate(dateStr, stopKey) : [];
  const upcoming = validInput ? buildUpcoming(dateStr, departures, timeStr) : [];

  const result = {
    stopKey,
    stopLabel,
    date: dateStr,
    time: timeStr,
    serviceType: validInput ? serviceTypeLabel(serviceType) : '入力を確認',
    serviceCode: validInput ? serviceType : 'invalid',
    validInput,
    message: '',
    nextDeparture: '',
    arrival: '',
    upcoming,
  };

  if (!validInput) {
    result.message = '停留所・日付・時刻を正しく入力してください。';
    return result;
  }

  if (serviceType === 'unknown') {
    result.message = 'この日は対応期間外のため、運行データが未確認です。公式の運行日程をご確認ください。';
    return result;
  }

  if (serviceType === 'no_service') {
    result.message = 'この日は運休です。';
    return result;
  }

  if (upcoming.length === 0) {
    result.message = 'この日のバスは終了しました';
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

function renderUpcoming(items, message) {
  if (!items.length) {
    elements.upcomingList.innerHTML = `
      <article class="trip-card">
        <p class="trip-summary">${escapeHtml(message)}</p>
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

function renderCalendar(dateStr) {
  const [year, month] = calendarMonth.split('-').map(Number);
  const monthLabel = `${year}年${month}月`;
  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const now = formatTokyoNow();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push('<span class="calendar-day calendar-day-empty" aria-hidden="true"></span>');
  }

  for (let currentDay = 1; currentDay <= daysInMonth; currentDay += 1) {
    const currentDate = `${year}-${pad2(month)}-${pad2(currentDay)}`;
    const classes = ['calendar-day'];
    const serviceType = serviceTypeForDate(currentDate);
    let badge = '<small>運休</small>';

    if (serviceType === 'two_bus') {
      classes.push('calendar-day-two-bus');
      badge = '<small>2台</small>';
    } else if (serviceType === 'three_bus_all' || serviceType === 'three_bus_pm') {
      classes.push('calendar-day-three-bus');
      badge = '<small>3台</small>';
    } else if (serviceType === 'one_bus') {
      classes.push('calendar-day-one-bus');
      badge = '<small>1台</small>';
    } else if (serviceType === 'unknown') {
      classes.push('calendar-day-unknown');
      badge = '<small>未確認</small>';
    } else {
      classes.push('calendar-day-off');
    }

    if (currentDate === dateStr) {
      classes.push('calendar-day-selected');
    }

    if (currentDate === now.date) {
      classes.push('calendar-day-today');
    }

    cells.push(`
      <button class="${classes.join(' ')}" type="button" data-date="${currentDate}" aria-pressed="${currentDate === dateStr ? 'true' : 'false'}" aria-label="${currentDate} ${serviceTypeLabel(serviceType)}">
        <strong>${currentDay}</strong>
        ${badge}
      </button>
    `);
  }

  elements.calendarTitle.textContent = monthLabel;
  elements.calendarCaption.textContent = '3台（日野デー） / 2台 / 1台 / 運休 / データ未確認を区別しています';
  elements.calendarGrid.innerHTML = cells.join('');
}

function renderSchedule(dateStr, stopLabel, serviceType, items, departures, markerTime, isLive, message) {
  const hours = Array.from({ length: 17 }, (_, index) => 6 + index);
  // 目盛は hours の各行がちょうど1時間ぶんの高さを占める前提。行と同じ基準で位置を出す
  const firstMinute = hours[0] * 60;
  const lastMinute = (hours[hours.length - 1] + 1) * 60;
  const markerMinute = toMinutes(markerTime);
  const hasCurrentLine = markerMinute >= firstMinute && markerMinute <= lastMinute;
  const linePosition = hasCurrentLine
    ? ((markerMinute - firstMinute) / (lastMinute - firstMinute)) * 100
    : null;

  // チップの高さぶん（約25分）以内に続く便は重なるので、横にずらした列に置く
  const laneGapMinutes = 28;
  const laneLastMinutes = [];
  const laneByDeparture = new Map();
  for (const departure of departures) {
    const minute = toMinutes(departure);
    let lane = laneLastMinutes.findIndex((last) => minute - last >= laneGapMinutes);
    if (lane === -1) {
      lane = laneLastMinutes.length;
    }
    laneLastMinutes[lane] = minute;
    laneByDeparture.set(departure, lane);
  }

  const chipsByHour = new Map();
  for (const departure of departures) {
    const hour = Number(departure.slice(0, 2));
    if (!chipsByHour.has(hour)) {
      chipsByHour.set(hour, []);
    }
    chipsByHour.get(hour).push(departure);
  }

  const currentLabel = isLive ? `現在時刻 ${markerTime}` : `選択時刻 ${markerTime}`;
  elements.timelineSubtitle.textContent = `${stopLabel} · ${currentLabel} · ${serviceType}`;

  const previousTrack = elements.scheduleList.querySelector('.timeline-track');
  const previousScroll = previousTrack ? previousTrack.scrollTop : null;

  elements.scheduleList.innerHTML = `
    <div class="timeline-track">
      <div class="timeline-intro">日中の便を上から順に表示しています</div>
      <div class="timeline-hours">
        ${hasCurrentLine ? `<div class="timeline-now" style="top: ${linePosition}%;"><span>${escapeHtml(markerTime)}</span></div>` : ''}
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
                    <div class="timeline-chip" style="top: ${minutePosition}%; --lane: ${laneByDeparture.get(departure)};">
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

  const track = elements.scheduleList.querySelector('.timeline-track');
  const marker = track.querySelector('.timeline-now');

  if (previousScroll !== null) {
    // 30秒ごとの再描画でスクロール位置を先頭に戻さない
    track.scrollTop = previousScroll;
  } else if (marker) {
    // 初回は目盛の先頭ではなく基準時刻の付近を開く
    const offset = marker.getBoundingClientRect().top - track.getBoundingClientRect().top;
    track.scrollTop = Math.max(0, offset - track.clientHeight / 2);
  }

  if (message) {
    elements.note.textContent = message;
  } else {
    elements.note.textContent = `次の便は ${items[0].departure} 発、到着目安は ${items[0].arrival} です。`;
  }
}

function formatCoverageDate(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  return `${year}年${month}月${day}日`;
}

function renderCoverage(dateStr) {
  const { term } = serviceForDate(dateStr);
  if (term) {
    elements.dataCoverage.textContent = `${term.label}対応：${formatCoverageDate(term.validFrom)}〜${formatCoverageDate(term.validThrough)}。運行日程の確認日：${formatCoverageDate(term.calendarVerifiedOn)}。`;
    elements.calendarSource.href = term.calendarSource;
    elements.calendarSource.textContent = `${term.label}の運行日程の出典`;
    return;
  }
  const from = terms.map((item) => item.validFrom).sort()[0];
  const through = terms.map((item) => item.validThrough).sort().at(-1);
  const message = isValidDate(dateStr)
    ? '選択日は対応期間外のため、運行データは未確認です。'
    : '日付を入力すると、その日の運行情報を確認できます。';
  elements.dataCoverage.textContent = `データ対応期間：${formatCoverageDate(from)}〜${formatCoverageDate(through)}。${message}`;
  elements.calendarSource.href = termRegistry.officialPage;
  elements.calendarSource.textContent = '大学公式の連絡バス情報';
}

function applyResult(result) {
  activeResult = result;
  if (isValidDate(result.date)) {
    calendarMonth = monthKeyForDate(result.date);
  } else if (!calendarMonth) {
    calendarMonth = monthKeyForDate(formatTokyoNow().date);
  }
  const now = formatTokyoNow();
  elements.currentTime.textContent = now.display;
  elements.serviceType.textContent = result.serviceType;
  elements.selectedStopLabel.textContent = result.stopLabel;
  renderUpcoming(result.upcoming, result.message);
  renderCoverage(result.date);
  renderCalendar(result.date);
  renderSchedule(
    result.date,
    result.stopLabel,
    result.serviceType,
    result.upcoming,
    result.validInput ? departuresForDate(result.date, result.stopKey) : [],
    result.time,
    liveMode,
    result.message,
  );
}

function syncLiveMode() {
  const now = formatTokyoNow();
  liveMode = elements.date.value === now.date && elements.time.value === now.time;
}

function refreshLiveClock() {
  if (!activeResult) {
    return;
  }

  const now = formatTokyoNow();
  elements.currentTime.textContent = now.display;

  if (liveMode) {
    // 現在時刻に追従している間は次の便も取り直す
    if (now.date !== activeResult.date) {
      elements.date.value = now.date;
      elements.time.value = now.time;
      applyResult(buildResult(now.date, now.time, activeResult.stopKey));
      return;
    }

    elements.time.value = now.time;
    activeResult = buildResult(now.date, now.time, activeResult.stopKey);
    renderUpcoming(activeResult.upcoming, activeResult.message);
  }

  renderSchedule(
    activeResult.date,
    activeResult.stopLabel,
    activeResult.serviceType,
    activeResult.upcoming,
    activeResult.validInput ? departuresForDate(activeResult.date, activeResult.stopKey) : [],
    activeResult.time,
    liveMode,
    activeResult.message,
  );
}

function syncRouteInfo() {
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
    syncLiveMode();
    const result = buildResult(dateStr, timeStr, stopKey);
    applyResult(result);
  } finally {
    setBusy(false);
  }
}

async function init() {
  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`運行データを取得できませんでした (${response.status})`);
    }
    return response.json();
  }
  termRegistry = await fetchJson(termRegistryPath);
  terms = await Promise.all(termRegistry.terms.map(async (term) => {
    const [calendar, termTimetable] = await Promise.all([
      fetchJson(`./${term.directory}/bus_calendar.json`),
      fetchJson(`./${term.directory}/bus_timetable.json`),
    ]);
    return { ...term, calendar, timetable: termTimetable };
  }));
  timetable = (terms.find((term) => term.id === termRegistry.currentTerm) || terms[terms.length - 1]).timetable;

  populateStops();
  syncRouteInfo();

  const now = formatTokyoNow();
  elements.date.value = now.date;
  elements.time.value = now.time;
  elements.stop.value = initialStop(window.location.search);
  liveMode = true;

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
    liveMode = true;
    applyResult(buildResult(current.date, current.time, elements.stop.value));
  });

  elements.stop.addEventListener('change', () => {
    applyResult(buildResult(elements.date.value, elements.time.value, elements.stop.value));
  });

  elements.date.addEventListener('change', () => {
    syncLiveMode();
    applyResult(buildResult(elements.date.value, elements.time.value, elements.stop.value));
  });

  elements.time.addEventListener('change', () => {
    syncLiveMode();
    applyResult(buildResult(elements.date.value, elements.time.value, elements.stop.value));
  });

  elements.calendarGrid.addEventListener('click', (event) => {
    const dayButton = event.target.closest('[data-date]');
    if (!dayButton) {
      return;
    }

    const nextDate = dayButton.getAttribute('data-date');
    elements.date.value = nextDate;
    runSearch('next');
  });

  elements.calendarPrev.addEventListener('click', () => {
    calendarMonth = shiftMonth(calendarMonth, -1);
    renderCalendar(elements.date.value);
  });

  elements.calendarNext.addEventListener('click', () => {
    calendarMonth = shiftMonth(calendarMonth, 1);
    renderCalendar(elements.date.value);
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
