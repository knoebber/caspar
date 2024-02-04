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
  constructor(d) {
    this.maybeNullData = d;
    this.hasData = d !== null;
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
      label: 'Bottle Count',
      selector: '.js-bottle-count',
      value: parseInt(this.dataItem.bottle_count, 10) || 0,
    };
  }

  get dailyRainfall() {
    return {
      label: '24 Hour Rainfall',
      selector: '.js-daily-rainfall',
      value: parseFloat(this.dataItem.daily_rainfall) || 0,
    };
  }

  get seasonRainfall() {
    return {
      label: 'Season Rainfall',
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
      headerSpan.innerHTML = 'no data';
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
  constructor() {
    this.viewedDate = null;
    this.responseCache = {};
    this.hourlyRainCache = {};
    this.threeDayRainCache = {};
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
      this.responseCache[dayKey] = dataPromise;
    }

    const dailyData = await dataPromise;
    return new HourlyDataItem(dailyData[date.getUTCHours()] || null);
  }

  getDataForHourDelta(startData, hourDelta) {
    return this.getHourlyDataItem(new Date(startData.date.valueOf() + (msInHour * hourDelta)));
  }

  async sync() {
    window.history.replaceState({urlKey: this.viewKey }, '', `?${urlKey}=${this.viewKey}`);
    (await this.getHourlyDataItem(this.viewedDate)).render();
  }

  async calcHourlyRain() {
    // If there are this many straight days of rain, give up.
    const maxLookbackDays = 14;

    const currentMs = this.viewedDate.valueOf();
    let startData = null;

    for (let i = 0; i < maxLookbackDays * 24; i += 1) {
      const rainCheckDate = new Date(currentMs - (msInHour * i));
      const hourlyData = await this.getHourlyDataItem(rainCheckDate);
      if (hourlyData.hasData && hourlyData.dailyRainfall.value === 0) {
	startData = hourlyData;
	break;
      }
    }

    if (startData) {
      console.log('found', startData.key, 'no 24 hours of rain');
      const startDate = startData.date
      this.hourlyRainCache[startData.key] = 0;

      // 24 hours previous to this have 0 inches per hour
      for (let i = 0; i < 24; i +=1) {
	this.hourlyRainCache[makeHourKey(new Date(startDate.valueOf() - (msInHour * i)))] = 0;
      }

      console.log({...this.hourlyRainCache});

      const currentMs = this.viewedDate.valueOf();
      let msCursor = startDate.valueOf() + msInHour;
      let previousDailyRainfall = startData.dailyRainfall.value;

      while (msCursor < currentMs) {
	const hourlyData = await this.getHourlyDataItem(new Date(msCursor));
	const key = hourlyData.key;
	const dailyRainfall = hourlyData.dailyRainfall.value;
	const oneDayAgo = new Date(msCursor - (msInHour * 24));

	// console.log(new Date(msCursor), 'dailyRainfall=',dailyRainfall);
	// console.log('previousDailyRainfall=',previousDailyRainfall, 'date=', oneDayAgo, 'key=', makeHourKey(oneDayAgo));

	const hourlyRain24HoursAgo = this.hourlyRainCache[makeHourKey(oneDayAgo)]
	const hourlyRainfall = roundTwoPlaces((dailyRainfall - previousDailyRainfall) + hourlyRain24HoursAgo);
	this.hourlyRainCache[key] = !hourlyRainfall || hourlyRainfall < 0 ? 0 : hourlyRainfall;
	if (hourlyRain24HoursAgo > 0) {
	  console.log('===')
	  console.log('dailyRainfall', dailyRainfall);
	  console.log('previousDailyRainfall', previousDailyRainfall);
	  console.log('hourlyRain24HoursAgo', hourlyRain24HoursAgo);
	  console.log('calculated', this.hourlyRainCache[key]);
	}

	previousDailyRainfall = hourlyData.dailyRainfall.value;
	msCursor += msInHour;
      }
      console.log(this.hourlyRainCache);

      const hourlyInchKeys = Object.keys(this.hourlyRainCache);
      hourlyInchKeys.sort((a, b) => {
	return parseDateFromHourKey(a).valueOf() > parseDateFromHourKey(b).valueOf();
      });

      console.log({...this.hourlyRainCache});

      hourlyInchKeys.forEach((key, i) => {
	const val = this.hourlyRainCache[key];
	const display = val ? val.toFixed(2) : val;
	console.log(`(${i}) LOCAL DATE="${new Date(parseDateFromHourKey(key)).toLocaleString()}" KEY="${key}": ${display}`);
      });

      return;
    } else {
      console.warning('could not calculate hourly rain for', this.viewKey);
    }
  }

  async calcThreeDayRain() {
    const currentMs = this.viewedDate.valueOf();
    let total = 0;
    let hourlyData;
    for (let i = 0; i < 3; i +=1 ) {
      hourlyData = await this.getHourlyDataItem(new Date(currentMs - (msInHour * 24 * i)));
      if (hourlyData.hasData) {
	total += parseFloat(hourlyData.dailyRainfall.value);
      } else {
	total = null;
	break;
      }
    }
    this.threeDayRainCache[this.viewKey] = total;
    return total;
  }

  async getCalculatedRain() {
    let hourlyRain = this.hourlyRainCache[this.viewKey];
    let threeDayRain = this.threeDayRainCache[this.viewKey];

    if (hourlyRain === undefined) {
      await this.calcThreeDayRain();
      threeDayRain = this.threeDayRainCache[this.viewKey]
    }
    if (hourlyRain === undefined) {
      hourlyRain = this.hourlyRainCache[this.viewKey];
    }

    return { threeDayRain, hourlyRain };
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

async function main(controller) {
  controller.initialize();
  await controller.calcHourlyRain();

  document.onkeydown = async ({ code }) => {
    switch (code) {
    case 'ArrowLeft':
      await controller.currentPromise;
      controller.viewPreviousHour();
      break;
    case 'ArrowRight':
      await controller.currentPromise;
      controller.viewNextHour();
      break;
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


// Global scope so it's easy to mess with in console.
const controller = new Controller();
main(controller);

