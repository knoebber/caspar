import json

from process import process_obj
from process import get_caspar_creek_gif


def handler(event, context):
    item_dict = process_obj(get_caspar_creek_gif())

    return {
        'statusCode': 200,
        'body': json.dumps(item_dict)
    }
