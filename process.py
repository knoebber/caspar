import decimal

from PIL import Image
from datetime import datetime
from datetime import timezone
from enum import Enum
from io import BytesIO
from pprint import pprint
from time import time

import boto3
import pytesseract

S3_BUCKET = 'caspar-creek-data'
DYNAMO_DB_TABLE = 'caspar-creek-data'

s3 = boto3.resource('s3')
dynamodb = boto3.resource('dynamodb')
s3_bucket = s3.Bucket(S3_BUCKET)

dynamo_db_client = boto3.client('dynamodb')
s3_client = boto3.client('s3')


def unix_now():
    return int(time())


def get_text(img):
    return pytesseract.image_to_string(
        img,
        config='--psm 7 -c tessedit_char_whitelist=APM0123456789.:/\\ '
    ).strip()


def delete_dynamo_table():
    return dynamo_db_client.delete_table(TableName=DYNAMO_DB_TABLE)


class DynamoSchema(str, Enum):
    DATE_STRING = 'date_string'
    HOUR_OF_DAY = 'hour_of_day'


def create_dynamo_table():
    return dynamodb.create_table(
        TableName=DYNAMO_DB_TABLE,
        KeySchema=[
            {
                'AttributeName': DynamoSchema.DATE_STRING,
                'KeyType': 'HASH',
            },
            {
                'AttributeName': DynamoSchema.HOUR_OF_DAY,
                'KeyType': 'RANGE',
            },

        ],
        AttributeDefinitions=[
            {
                'AttributeName': DynamoSchema.DATE_STRING,
                'AttributeType': 'S',
            },
            {
                'AttributeName': DynamoSchema.HOUR_OF_DAY,
                'AttributeType': 'N',
            },
        ],
        ProvisionedThroughput={
            'ReadCapacityUnits': 2,
            'WriteCapacityUnits': 2
        },
    )


def upload_img_to_s3(img, key):
    buffer = BytesIO()
    img.save(buffer, format='gif')
    buffer.seek(0)
    s3_bucket.put_object(Body=buffer, Key=key)


CROPS_DIR = 'crops/'


def add_tz_string(date_string):
    return f'{date_string} -0800'  # they don't update clocks for DST


# http://fs-server.humboldt.edu/RTMC/SFCaspar_DetailView.gif
class DataLabel(str, Enum):
    ANNUAL_RAINFALL = 0
    DAILY_RAINFALL = 1
    GRAPH_IMAGE = 2
    STAGE = 3
    TEMPERATURE = 4
    TIMESTAMP = 5
    TURBIDITY = 6
    WEIR_IMAGE = 7
    WEIR_IMAGE_TIMESTAMP = 8

    @property
    def is_img(self):
        return self in (DataLabel.WEIR_IMAGE, DataLabel.GRAPH_IMAGE)

    @property
    def is_text(self):
        return not self.is_img

    @property
    def dynamo_key(self):
        if self == DataLabel.TIMESTAMP:
            raise RuntimeError(self+' should be split between hash/range')
        elif self.is_img:
            return f'{self.name.lower()}_s3_path'
        else:
            return self.name.lower()

    def get_s3_img_keyname(self, full_img_keyname):
        if self.is_img:
            return CROPS_DIR + full_img_keyname.replace(
                '.gif',
                f'_{self.name.lower()}.gif'
            )

    def get_dynamo_value(self, value):
        if self.is_img:
            return {'S': value}

        match self:
            case (
                    self.ANNUAL_RAINFALL
                    | self.DAILY_RAINFALL
                    | self.TEMPERATURE
                    | self.STAGE
            ):
                return {'N': str(decimal.Decimal(value))}
            case self.TURBIDITY:
                return {'N': str(int(value))}
            case self.TIMESTAMP:
                raise RuntimeError(self + 'must be split between hash/range')
            case self.WEIR_IMAGE_TIMESTAMP:
                return {
                    'N': str(int(
                        datetime.strptime(
                            add_tz_string(value),
                            '%Y/%m/%d %H:%M:%S %z',
                        ).timestamp()
                    ))
                }


DATA_LABEL_TO_COORDINATES = {
    DataLabel.ANNUAL_RAINFALL: (140, 650, 270, 700),
    DataLabel.DAILY_RAINFALL: (140, 610, 270, 650),
    DataLabel.GRAPH_IMAGE: (270, 443, 1077, 784),
    DataLabel.STAGE: (10, 190, 160, 230),
    DataLabel.TEMPERATURE: (245, 411, 370, 452),
    DataLabel.TURBIDITY: (40, 270, 140, 307),
    DataLabel.WEIR_IMAGE: (380, 124, 985, 409),
    # TODO: fiddle with text recognition on weir image timestamp
    # DataLabel.WEIR_IMAGE_TIMESTAMP: (379, 393, 665, 409),
}


# this creates the dynamo hash/sort key, so it's handled separately
TIMESTAMP_COORDS = (530, 57, 897, 90)


def process_obj(s3_key, s3_body, should_save_images_locally=False):
    img = Image.open(s3_body)
    cropped = img.crop(box=TIMESTAMP_COORDS)

    timestamp_string = get_text(cropped)
    if should_save_images_locally:
        cropped.save('timestamp.gif')

    if 'PM' not in timestamp_string and 'AM' not in timestamp_string:
        timestamp_string += ' AM'

    timestamp = datetime.strptime(
        add_tz_string(timestamp_string),
        '%m/%d/%Y %I:%M:%S %p %z',
    ).astimezone(timezone.utc)

    dynamo_item_dict = {
        's3_key': {'S': s3_key},
        DynamoSchema.DATE_STRING: {
            'S': datetime.strftime(timestamp, '%Y-%m-%d')
        },
        DynamoSchema.HOUR_OF_DAY: {'N': str(timestamp.hour)},
    }

    for label, coords in DATA_LABEL_TO_COORDINATES.items():
        cropped = img.crop(box=coords)
        if should_save_images_locally:
            cropped.save(f'{label.dynamo_key}.gif')

        if label.is_text:
            text = get_text(cropped)
            item_value = text
        else:
            cropped_keyname = label.get_s3_img_keyname(s3_key)
            item_value = cropped_keyname
            if not should_save_images_locally:
                upload_img_to_s3(cropped, cropped_keyname)

        try:
            value = label.get_dynamo_value(item_value)
        except (ValueError, decimal.InvalidOperation) as e:
            print(f'"{s3_key}": {label.dynamo_key}="{item_value}": {str(e)}')
        else:
            dynamo_item_dict[label.dynamo_key] = value

    if should_save_images_locally:
        pprint(dynamo_item_dict)
    else:
        dynamo_db_client.put_item(
            TableName=DYNAMO_DB_TABLE,
            Item=dynamo_item_dict,
        )
        print(s3_key, 'is done')


def get_s3_obj(key):
    return s3_client.get_object(Key=key, Bucket=S3_BUCKET)


def process_s3_key(key, should_save_locally):
    obj = get_s3_obj(key)
    process_obj(key, obj['Body'], should_save_locally)


def process_all():
    for obj in s3_bucket.objects.all():
        if not obj.key.startswith(CROPS_DIR):
            process_obj(obj.key, obj.get()['Body'])
