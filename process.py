from PIL import Image
from enum import Enum

import pytesseract


# http://fs-server.humboldt.edu/RTMC/SFCaspar_DetailView.gif
class DataLabel(str, Enum):
    ANNUAL_RAINFALL = 'ar'
    DAILY_RAINFALL = 'dr'
    GRAPH_IMAGE = 'g_img'
    STAGE = 'stg'
    TEMPERATURE = 'temp'
    TIMESTAMP = 'ts'
    TURBIDITY = 'turb'
    WEIR_IMAGE = 'w_img'
    WEIR_IMAGE_TIMESTAMP = 'w_img_ts'

    @property
    def is_text(self):
        return self not in (DataLabel.WEIR_IMAGE, DataLabel.GRAPH_IMAGE)


data_label_to_coordinates = {
    DataLabel.ANNUAL_RAINFALL: (140, 650 , 270, 700),
    DataLabel.DAILY_RAINFALL: (140, 610 , 270, 650),
    DataLabel.GRAPH_IMAGE: (270, 443 , 1077, 784),
    DataLabel.STAGE: (10, 190, 160, 230),
    DataLabel.TEMPERATURE: (245, 411 , 370, 452),
    DataLabel.TIMESTAMP: (530, 57 , 897, 90),
    DataLabel.TURBIDITY: (40, 270 , 140, 307),
    DataLabel.WEIR_IMAGE: (380, 124 , 985, 409),
    DataLabel.WEIR_IMAGE_TIMESTAMP: (379, 393, 665, 409),
}


original = Image.open('example.gif')
for label, coords in data_label_to_coordinates.items():
    cropped = original.crop(box=coords)
    cropped.save(f'{label.name}.gif')
    if label.is_text:
        print(pytesseract.image_to_string(cropped, config='-c tessedit_char_whitelist=0123456789.:/\ ').strip())

    
