import decimal
import urllib.request

from PIL import Image
from datetime import datetime
from datetime import timezone
from enum import Enum
from io import BytesIO
from pprint import pprint
from time import time

import boto3
import botocore
import pytesseract


"""
This program processes the image at the following URL.
The file is downloaded, uploaded to S3, and then parsed with OCR.
Finally, the data is stored in DynamoDB.
"""
GIF_URL = 'http://fs-server.humboldt.edu/RTMC/SFCaspar_DetailView.gif'

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
    UNIX_TIMESTAMP = 'unix_timestamp'


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


def does_s3_key_exist(s3_key):
    try:
        s3_client.head_object(Bucket=S3_BUCKET, Key=s3_key)
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == '404':
            return False
        raise e
    else:
        return True


def upload_img_to_s3(s3_key, img):
    buffer = BytesIO()
    img.save(buffer, format='gif')
    buffer.seek(0)
    s3_bucket.put_object(Body=buffer, Key=s3_key)
    print('uploaded', s3_key)


CROPS_DIR = 'crops/'


def add_tz_string(date_string):
    return f'{date_string} -0800'  # they don't update clocks for DST


# http://fs-server.humboldt.edu/RTMC/SFCaspar_DetailView.gif
class DataLabel(str, Enum):
    ANNUAL_RAINFALL = 0
    BOTTLE_COUNT = 1
    DAILY_RAINFALL = 2
    GRAPH_IMAGE = 3
    STAGE = 4
    TEMPERATURE = 5
    TIMESTAMP = 6
    TURBIDITY = 7
    WEIR_IMAGE = 8
    WEIR_IMAGE_TIMESTAMP = 9

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
                    | self.BOTTLE_COUNT
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
    DataLabel.BOTTLE_COUNT: (40, 400, 140, 450),
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


def process_obj(img, should_save_images_locally=False):
    cropped = img.crop(box=TIMESTAMP_COORDS)

    try:
        timestamp_string = get_text(cropped)
        if should_save_images_locally:
            cropped.save('timestamp.gif')

        if 'PM' not in timestamp_string and 'AM' not in timestamp_string:
            timestamp_string += ' AM'

        timestamp = datetime.strptime(
            add_tz_string(timestamp_string),
            '%m/%d/%Y %I:%M:%S %p %z',
        ).astimezone(timezone.utc)

        unix_timestamp = int(timestamp.timestamp())
    except Exception as e:
        s3_key = f'error_{unix_now()}.gif'
        print(f'caught {e} while parsing timestamp')
        raise e
    else:
        s3_key = f'caspar_creek_{unix_timestamp}.gif'
    finally:
        upload_img_to_s3(s3_key, img)

    dynamo_item_dict = {
        's3_key': {'S': s3_key},
        DynamoSchema.DATE_STRING: {
            'S': datetime.strftime(timestamp, '%Y-%m-%d')
        },
        DynamoSchema.HOUR_OF_DAY: {'N': str(timestamp.hour)},
        DynamoSchema.UNIX_TIMESTAMP: {'N': str(unix_timestamp)},
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
                upload_img_to_s3(cropped_keyname, cropped)

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

    return dynamo_item_dict


def get_caspar_creek_gif():
    with urllib.request.urlopen(GIF_URL) as response:
        return Image.open(response)


def get_s3_obj(key):
    return s3_client.get_object(Key=key, Bucket=S3_BUCKET)


def process_s3_key(key, should_save_locally=False):
    obj = get_s3_obj(key)
    return process_obj(Image.open(obj['Body']), should_save_locally)


def process_all():
    for obj in s3_bucket.objects.all():
        if not obj.key.startswith(CROPS_DIR):
            process_obj(Image.open(obj.get()['Body']))


def delete_old_images():
    for obj in s3_bucket.objects.all():
        if not obj.key.startswith('caspar_creek'):
            obj.delete()
