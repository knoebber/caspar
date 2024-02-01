const apiUrl = 'https://6llfk2y33ccofsvg6zaw2xy4wu0qspjw.lambda-url.us-west-2.on.aws';
const bucketUrl = 'https://caspar-creek-data.s3.us-west-2.amazonaws.com'

const msInHour = 3600*1000;
const keyToLabel = {
  daily_rainfall: '24 hour rainfall',
};

const dataKeys = [
  'stage',
  'daily_rainfall',
  'turbidity',
  'annual_rainfall',
  'bottle_count',
  'temperature',
];

const urlKey = 'date';

function renderImg(selector, s3Path) {
  const img = document.querySelectorAll(selector)[0];
  if (s3Path) {
    img.src = `${bucketUrl}/${s3Path}`;
  } else {
    img.src = '';
  }
}

function renderDataItem(dataItem) {
  renderImg('.js-weir-image', dataItem.weir_image_s3_path);
  renderImg('.js-graph-image', dataItem.graph_image_s3_path);

  document
    .querySelectorAll('.js-date')[0]
    .innerHTML = new Date(parseInt(dataItem.unix_timestamp, 10) * 1000).toLocaleString();

  lineItems = document.querySelectorAll('.js-data-line-items')[0];
  lineItems.innerHTML = '';

  dataKeys.forEach((dataKey) => {
    const div = document.createElement('div');
    const label = keyToLabel[dataKey] || dataKey.replaceAll('_', ' ');
    const dataText = `${label}: ${dataItem[dataKey]}`
    div.classList.add(dataKey.replace('_', '-'));
    div.appendChild(document.createTextNode(dataText || '-'));
    lineItems.appendChild(div);
  });

}

function makeHourKey(date) {
  return date.toISOString().match(/^.+T\d\d/)[0];
}

function makeDayKey(date) {
  return date.toISOString().replaceAll(/T.+/g, '');
}

class Repo {
  constructor() {
    this.data = {};
  }

  isEmpty() {
    return Object.keys(this.data).length === 0;
  }

  setHour(hourData) {
    this.data[makeHourKey(new Date(hourData.unix_timestamp * 1000))] = hourData;
  }

  async getHour(date) {
    const hourKey = makeHourKey(date);
    if (!(hourKey in this.data)) {
      console.log('fetching', hourKey);
      await this.fetchDay(date);
    } else {
      console.log('cache hit for', hourKey);
    }

    return this.data[hourKey];
  }

  async fetchDay(date) {
    const resp = await fetch(`${apiUrl}?date=${makeDayKey(date)}`);
    const dataItems = await resp.json();
    dataItems.forEach((hourData) => {
      this.setHour(hourData);
    });
  }
}

class State {
  constructor() {
    this.date = null;
  }

  initialize() {
    const key = new URLSearchParams(window.location.search)[urlKey];
    if (key) {
      [year, month, day, hour] = key.replaceAll(/[-T]/g, ' ').split(' ') 
      this.date = new Date(Date.UTC(year, month - 1, hour, 0, 0, 0))
    } 
  }

  syncUrl() {
    const value = makeHourKey(this.date);
    // window.location.search = `?${urlKey}=${key}`;
    window.history.replaceState({urlKey: value }, '', `?${urlKey}=${value}`);
  }

  setDay(day) {
    this.date.setDate(day);
    this.syncUrl();
  }

  previousDay() {
    this.setDay(this.date.getDate() - 1);
  }

  nextDay() {
    this.setDay(this.date.getDate() + 1);
  }

  setHour(hour) {
    this.date.setHours(hour);
    this.syncUrl();
  }

  previousHour() {
    this.setHour(this.date.getHours() - 1);
  }

  nextHour() {
    this.setHour(this.date.getHours() + 1);
  }
}

async function main(repo, state) {

  state.initialize();

  let dataItem;

  if (state.date) {
    dataItem  = await repo.getHour(state.date);
  } else  {
    const initialDate = new Date();
    dataItem = await repo.getHour(initialDate);
    if (!dataItem) {
      initialDate.setHours(initialDate.getHours() - 1);
      dataItem = await repo.getHour(initialDate);
    }

    state.date = initialDate;
  }

  renderDataItem(dataItem || {});

  
  document.onkeydown = async ({ which }) => {
    if (which === 37) {
      // left arrow
      state.previousHour();
      dataItem = await repo.getHour(state.date);
      renderDataItem(dataItem || {});
    } else if (which === 39) {
      // right arrow
      state.nextHour();
      dataItem = await repo.getHour(state.date);
      renderDataItem(dataItem || {});
    }
  }
}

const repo = new Repo();
const state = new State();

main(repo, state);
