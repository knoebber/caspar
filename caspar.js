const apiUrl = 'https://6llfk2y33ccofsvg6zaw2xy4wu0qspjw.lambda-url.us-west-2.on.aws';
const bucketUrl = 'https://caspar-creek-data.s3.us-west-2.amazonaws.com'

function getBucketPath(key) {
  return `${bucketUrl}/${key}`;
}

const msInHour = 36E5;

const urlKey = 'date';

function roundTwoPlaces(n) {
  return Math.round(n*100)/100;
} 

function parseDateFromHourKey(hourKey) {
  const [year, month, day, hour] = hourKey
    .replaceAll(/[-T]/g, ' ')
    .split(' ');
  
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0));

}

function selectFirst(selector) {
  return document.querySelectorAll(selector)[0];
}

function makeHourKey(date) {
  return date.toISOString().match(/^.+T\d\d/)[0];
}

function makeDayKey(date) {
  return date.toISOString().replaceAll(/T.+/g, '');
}

class HourlyDataItem {
  constructor(d, date) {
    this.maybeNullData = d;
    this.hasData = d !== null;
    this.givenDate = date;
  }

  get date() {
    return this.hasData ? new Date(parseInt(this.maybeNullData.unix_timestamp, 10) * 1000) : null;
  }

  get key() {
    return this.hasData ? makeHourKey(this.date) : null;
  }

  get dataItem() {
    return this.maybeNullData ?? {};
  }

  get bottleCount() {
    return {
      label: 'Bottle count',
      selector: '.js-bottle-count',
      value: parseInt(this.dataItem.bottle_count, 10) || 0,
    };
  }

  get dailyRainfall() {
    return {
      label: '24 hour rainfall',
      selector: '.js-daily-rainfall',
      value: parseFloat(this.dataItem.daily_rainfall) || 0,
    };
  }

  get seasonRainfall() {
    return {
      label: 'Season rainfall',
      selector: '.js-season-rainfall',
      value: parseFloat(this.dataItem.annual_rainfall) || 0,
    };
  }

  get stage() {
    return {
      label: 'Stage',
      selector: '.js-stage',
      value: parseFloat(this.dataItem.stage) || 0,
    };
  }

  get temperature() {
    return {
      label: 'Temperature',
      selector: '.js-temperature',
      value: parseFloat(this.dataItem.temperature) || 0,
    };
  }

  get turbidity() {
    return {
      label: 'Turbidity',
      selector: '.js-turbidity',
      value: parseFloat(this.dataItem.turbidity) || 0,
    };
  }

  render() {
    const headerSpan = selectFirst('.js-header-span');
    const weirImage = selectFirst('.js-weir-image');
    const graphImage = selectFirst('.js-graph-image');

    if (this.hasData) {
      graphImage.src = getBucketPath(this.maybeNullData.graph_image_s3_path);
      weirImage.src = getBucketPath(this.maybeNullData.weir_image_s3_path);
      headerSpan.innerHTML = this.date.toLocaleString();
    } else {
      weirImage.src = '';
      graphImage.src = '';
      headerSpan.innerHTML = `(no data ${this.givenDate.toLocaleString()})`;
    }

    [
      this.bottleCount,
      this.dailyRainfall,
      this.seasonRainfall,
      this.stage,
      this.temperature,
      this.turbidity,
    ].forEach(({ label, selector, value }) => {
      selectFirst(selector).innerHTML = `${label}: ${value}`;
    });
  }
}

class Controller {
  constructor(onFetch) {
    this.viewedDate = null;
    this.responseCache = {};
    this.onFetch = onFetch;
  }

  get viewKey() {
    return makeHourKey(this.viewedDate);
  }

  get currentPromise() {
    return this.responseCache[this.viewKey];
  }


  async initialize() {
    const urlValue = new URLSearchParams(window.location.search).get(urlKey);
    if (urlValue) {
      this.viewedDate = parseDateFromHourKey(urlValue);
      this.sync();
    } else {
      this.syncLatest();
    }

  }

  async getHourlyDataItem(date) {
    const dayKey = makeDayKey(date);

    let dataPromise = this.responseCache[dayKey];
    if (!dataPromise) {
      dataPromise = fetch(`${apiUrl}?date=${dayKey}`).then((resp) => resp.json());
      this.onFetch(dataPromise);
      this.responseCache[dayKey] = dataPromise;
    }

    const dailyData = await dataPromise;
    return new HourlyDataItem(dailyData[date.getUTCHours()] || null, date);
  }

  async sync() {
    window.history.replaceState({urlKey: this.viewKey }, '', `?${urlKey}=${this.viewKey}`);
    (await this.getHourlyDataItem(this.viewedDate)).render();
    this.renderCalculatedRain();
  }


  async calcHourlyRain() {
    const currentData = await this.getHourlyDataItem(this.viewedDate);
    let previousHourData = new HourlyDataItem(null);
    if (currentData.hasData) {
      const previousHour = new Date(currentData.date.valueOf() - msInHour);
      previousHourData = await this.getHourlyDataItem(previousHour);
    }

    return currentData.hasData && previousHourData.hasData
      ? roundTwoPlaces(currentData.seasonRainfall.value - previousHourData.seasonRainfall.value)
      :  null;
  }

  async calcThreeDayRain() {
    const currentMs = this.viewedDate.valueOf();
    const hourlyPromises = Array
      .from({ length: 3})
      .map((_, i) => this.getHourlyDataItem(new Date(currentMs - (msInHour * 24 * i))));

    return roundTwoPlaces(
      (await Promise.all(hourlyPromises))
	.reduce((acc, current) => {
	  if (acc !== null && current.hasData) {
	    return acc + current.dailyRainfall.value;
	  } else {
	    return null;
	  }
      }, 0));
  }

  async renderCalculatedRain() {
    const threeDayRain = await this.calcThreeDayRain() ?? '?';
    const hourlyRain = await this.calcHourlyRain() ?? '?';
    selectFirst('.js-72-hour-rainfall').innerHTML = `72 hour rain: ${threeDayRain}`;
    selectFirst('.js-1-hour-rainfall').innerHTML = `1 hour rain: ${hourlyRain}`;
  }

  setViewedDay(day) {
    this.viewedDate.setDate(day);
    this.sync();
  }

  async syncLatest() {
    const now = new Date();
    const cacheKey = makeDayKey(now);
    delete this.responseCache[cacheKey];
    this.viewedDate = now;
    const dataItem = await this.getHourlyDataItem(this.viewedDate);
    if (!dataItem.hasData) {
      this.viewPreviousHour();
    } else {
      this.sync();
    }
  }

  viewPreviousDay() {
    this.setViewedDay(this.viewedDate.getDate() - 1);
  }

  viewNextDay() {
    this.setViewedDay(this.viewedDate.getDate() + 1);
  }

  setViewedHour(hour) {
    this.viewedDate.setHours(hour);
    this.sync();
  }

  viewPreviousHour() {
    this.setViewedHour(this.viewedDate.getHours() - 1);
  }

  viewNextHour() {
    this.setViewedHour(this.viewedDate.getHours() + 1);
  }
}

let isFirstLoad = true;
let isLoading = true;

const nowButton = selectFirst('.js-now');
const nowStartText = nowButton.innerHTML;

async function onFetch(p) {
  console.log('start await for', p);
  nowButton.innerHTML = nowStartText;
  await p;


  nowButton.innerHTML = 'Most Recent';
  if (isFirstLoad) {
    document.querySelectorAll('.js-show-after-load').forEach((el) => {
      el.classList.remove('hidden');
    });
    isFirstLoad = false;
  }

  isLoading = false;
}

const controller = new Controller(onFetch);

async function main(controller) {
  controller.initialize();
  await controller.calcHourlyRain();

  document.onkeydown = async (e) => {
    let controllerMethod;

    switch (e.code) {
    case 'ArrowLeft':
      controllerMethod = e.shiftKey ? 'viewPreviousDay' : 'viewPreviousHour';
      break;
    case 'ArrowRight':
      controllerMethod = e.shiftKey ? 'viewNextDay' : 'viewNextHour';
      break;
    }

    if (controllerMethod) {
      await controller.currentPromise;
      controller[controllerMethod]();
    }
  };

  [
    {
      selector: '.js-last-day',
      method: 'viewPreviousDay',
    },
    {
      selector: '.js-last-hour',
      method: 'viewPreviousHour',
    },
    {
      selector: '.js-now',
      method: 'syncLatest',
    },
    {
      selector: '.js-next-hour',
      method: 'viewNextHour',
    },
    {
      selector: '.js-next-day',
      method: 'viewNextDay',
    },
  ].forEach(({ selector, method }) => {
    selectFirst(selector).onclick = async () => {
      await controller.currentPromise;
      controller[method]();
    };
  });
}


main(controller);

