import json

from process import process_s3_key


def handler(event, context):
    item_dict = process_s3_key(event['s3_key'])

    return {
        'statusCode': 200,
        'body': json.dumps(item_dict)
    }
