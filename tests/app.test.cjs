const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
// Load the production functions and exercise init explicitly with local JSON fixtures.
const functionsSource = source.slice(0, source.lastIndexOf('\ninit().catch'));
const fixedNow = Date.UTC(2026, 9, 2, 3, 0);

async function app(search = '') {
  const elements = new Map();
  const track = {
    scrollTop: 0,
    clientHeight: 500,
    querySelector: () => null,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '', textContent: '', innerHTML: '', disabled: false,
        listeners: {},
        addEventListener(event, callback) { this.listeners[event] = callback; },
        querySelector: () => id === 'schedule-list' ? track : null,
      });
    }
    return elements.get(id);
  }
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  }
  const context = vm.createContext({
    document: { getElementById: element },
    window: { location: { search }, setInterval: () => 1 },
    Date: TestDate,
    URLSearchParams,
    clearInterval() {},
    fetch: async (file) => ({
      ok: true,
      json: async () => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')),
    }),
  });
  vm.runInContext(functionsSource, context, { filename: 'app.js' });
  await vm.runInContext('init()', context);
  return {
    context,
    element,
    evaluate: (code) => vm.runInContext(code, context),
    result: (date, time = '12:00', stop = 'hino') => context.buildResult(date, time, stop),
  };
}

test('coverage distinguishes confirmed no-service dates from dates outside either term', async () => {
  const site = await app();
  for (const date of ['2026-03-31', '2027-04-01']) {
    assert.equal(site.result(date).serviceCode, 'unknown', date);
    assert.match(site.result(date).message, /未確認/);
  }
  for (const date of ['2026-04-01', '2026-09-30', '2027-03-31']) {
    assert.equal(site.result(date).serviceCode, 'no_service', date);
    assert.equal(site.result(date).message, 'この日は運休です。');
  }
  assert.equal(site.result('2026-10-01').serviceCode, 'three_bus_pm');
  assert.equal(site.result('2026-10-02').serviceCode, 'two_bus');
  assert.equal(site.result('2026-10-07').serviceCode, 'three_bus_all');
  assert.equal(site.result('2026-12-24').serviceCode, 'one_bus');
});

test('the final departure is available at its minute and then marked finished for the selected day', async () => {
  const site = await app();
  assert.equal(site.result('2026-10-02', '18:55').nextDeparture, '18:55');
  const afterLast = site.result('2026-10-02', '18:56');
  assert.equal(afterLast.upcoming.length, 0);
  assert.equal(afterLast.message, 'この日のバスは終了しました');
  assert.equal(afterLast.serviceCode, 'two_bus');
});

test('search card and note agree for no service, unknown date, finished day and invalid input', async () => {
  const site = await app();
  const cases = [
    ['2027-03-31', '12:00', 'この日は運休です。'],
    ['2027-04-01', '12:00', '未確認'],
    ['2026-10-02', '19:00', 'この日のバスは終了しました'],
    ['', '12:00', '正しく入力'],
    ['2026-10-02', '', '正しく入力'],
  ];
  for (const [date, time, expected] of cases) {
    site.context.applyResult(site.result(date, time));
    assert.ok(site.element('upcoming-list').innerHTML.includes(expected));
    assert.ok(site.element('note').textContent.includes(expected));
    assert.doesNotMatch(site.element('upcoming-list').innerHTML, /undefined|NaN/);
  }
});

test('invalid dates, times and stop names are rejected without throwing', async () => {
  const site = await app();
  for (const date of ['', '2026-02-29', '2026-04-31', '2026-13-01', 'invalid', null]) {
    assert.equal(site.result(date).validInput, false, String(date));
  }
  assert.equal(site.context.isValidDate('2028-02-29'), true);
  for (const time of ['', '24:00', '12:60', '1:00', 'invalid', null]) {
    assert.equal(site.result('2026-10-02', time).validInput, false, String(time));
  }
  for (const stop of ['', 'unknown', '__proto__', 'toString']) {
    assert.equal(site.result('2026-10-02', '12:00', stop).validInput, false, stop);
  }
});

test('stop query only accepts the three known stop keys and preserves current Tokyo date/time', async () => {
  for (const stop of ['hino', 'minamiosawa_east', 'minamiosawa_west']) {
    const site = await app(`?stop=${stop}&date=2027-04-01&time=00:00`);
    assert.equal(site.element('stop').value, stop);
    assert.equal(site.element('date').value, '2026-10-02');
    assert.equal(site.element('time').value, '12:00');
  }
  const site = await app();
  for (const query of ['', '?stop=', '?stop=evil', '?stop=__proto__', '?stop=toString']) {
    assert.equal(site.context.initialStop(query), 'hino', query);
  }
});

test('calendar selection matches the entire date, and dates beyond coverage show unconfirmed', async () => {
  const site = await app();
  site.evaluate("calendarMonth = '2027-04'");
  site.context.renderCalendar('2026-10-02');
  assert.doesNotMatch(site.element('calendar-grid').innerHTML, /aria-pressed="true"/);
  assert.match(site.element('calendar-grid').innerHTML, /calendar-day-unknown/);
  assert.match(site.element('calendar-grid').innerHTML, /2027-04-01 データ未確認/);
  assert.doesNotMatch(site.element('calendar-grid').innerHTML, /<small>運休<\/small>/);
  site.context.renderCalendar('2027-04-02');
  assert.equal((site.element('calendar-grid').innerHTML.match(/aria-pressed="true"/g) || []).length, 1);
});

test('coverage and source links follow the selected term rather than the final service date', async () => {
  const site = await app();
  site.context.renderCoverage('2026-05-01');
  assert.match(site.element('data-coverage').textContent, /2026年度前期/);
  assert.match(site.element('data-coverage').textContent, /2026年9月30日/);
  const firstSource = site.element('calendar-source').href;
  site.context.renderCoverage('2027-03-31');
  assert.match(site.element('data-coverage').textContent, /2026年度後期/);
  assert.match(site.element('data-coverage').textContent, /2027年3月31日/);
  assert.notEqual(site.element('calendar-source').href, firstSource);
  site.context.renderCoverage('2027-04-01');
  assert.match(site.element('data-coverage').textContent, /対応期間外/);
  assert.equal(site.element('calendar-source').href, site.evaluate('termRegistry.officialPage'));
});

test('next buses are selected from each stop and the initial title is never overwritten', async () => {
  const site = await app();
  assert.equal(site.result('2026-10-02', '12:00', 'hino').nextDeparture, '12:20');
  assert.equal(site.result('2026-10-02', '12:00', 'minamiosawa_east').nextDeparture, '12:15');
  assert.equal(site.result('2026-10-02', '12:00', 'minamiosawa_west').nextDeparture, '12:17');
  site.element('route-label').textContent = 'ページ固有の見出し';
  site.context.syncRouteInfo();
  assert.equal(site.element('route-label').textContent, 'ページ固有の見出し');
});
