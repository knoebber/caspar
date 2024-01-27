import json
import pytesseract


def handler(event, context):
    print(dir(pytesseract))
    s3_key = event['s3_key']

    return {
        'statusCode': 200,
        'body': json.dumps(s3_key)
    }
