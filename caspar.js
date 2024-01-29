const apiUrl = 'https://6llfk2y33ccofsvg6zaw2xy4wu0qspjw.lambda-url.us-west-2.on.aws';
const bucketUrl = 'https://caspar-creek-data.s3.us-west-2.amazonaws.com'

/**
   E.G:

   "annual_rainfall": "24.88",
   "bottle_count": "0",
   "daily_rainfall": "0.01",
   "date_string": "2024-01-29",
   "graph_image_s3_path": "crops/caspar_creek_1706500385_graph_image.gif",
   "hour_of_day": "3",
   "s3_key": "caspar_creek_1706500385.gif",
   "stage": "0.88",
   "temperature": "53.4",
   "turbidity": "10",
   "unix_timestamp": "1706500385",
   "weir_image_s3_path": "crops/caspar_creek_1706500385_weir_image.gif"
*/
function getData(date) {
  date_string = date.toISOString().replaceAll(/T.+/g, '')
  return fetch(`${apiUrl}?date=${date_string}`)
    .then((resp) => resp.json());
}

function renderImg(selector, s3Path) {
  img = document.querySelectorAll(selector)[0];
  img.src = `${bucketUrl}/${s3Path}`;
}

function renderDataItem(dataItem) {
  renderImg('.js-weir-image', dataItem.weir_image_s3_path);
  renderImg('.js-graph-image', dataItem.graph_image_s3_path);

  document
    .querySelectorAll('.js-date')[0]
    .innerHTML = new Date(parseInt(dataItem.unix_timestamp, 10) * 1000).toLocaleString();

  lineItems = document.querySelectorAll('.js-data-line-items')[0];

  [
    'annual_rainfall',
    'bottle_count',
    'daily_rainfall',
    'stage',
    'temperature',
    'turbidity',
  ].forEach((dataKey) => {
    const div = document.createElement('div');

    const dataText = `${dataKey.replaceAll('_', ' ')}: ${dataItem[dataKey]}`
    div.appendChild(document.createTextNode(dataText));
    lineItems.appendChild(div);
  });

}

getData(new Date())
  .then((data) => {
    // TODO: might break at uct midnight
    renderDataItem(data[data.length - 1]);
  });
