import json

from process import process_obj
from process import upload_caspar_creek_gif_to_s3


def handler(event, context):
    s3_key, img = upload_caspar_creek_gif_to_s3()
    item_dict = process_obj(s3_key, img)

    return {
        'statusCode': 200,
        'body': json.dumps(item_dict)
    }
