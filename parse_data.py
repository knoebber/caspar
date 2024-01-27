import json

def lambda_handler(event, context):
    s3_key = event['s3_key']

    return {
        'statusCode': 200,
        'body': json.dumps(s3)
    }
