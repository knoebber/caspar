const apiUrl = 'https://6llfk2y33ccofsvg6zaw2xy4wu0qspjw.lambda-url.us-west-2.on.aws';
const bucketUrl = 'https://caspar-creek-data.s3.us-west-2.amazonaws.com'

const keyToLabel = {
  daily_rainfall: '24 hour rainfall',
};


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
    'stage',
    'daily_rainfall',
    'turbidity',
    'annual_rainfall',
    'bottle_count',
    'temperature',
  ].forEach((dataKey) => {
    const div = document.createElement('div');
    const label = keyToLabel[dataKey] || dataKey.replaceAll('_', ' ');
    const dataText = `${label}: ${dataItem[dataKey]}`
    div.classList.add(dataKey.replace('_', '-'));
    div.appendChild(document.createTextNode(dataText));
    lineItems.appendChild(div);
  });

}


getData(new Date())
  .then((data) => {
    // TODO: might break at uct midnight
    renderDataItem(data[data.length - 1]);
  });
