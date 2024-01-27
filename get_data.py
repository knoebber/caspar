import json
import boto3
from decimal import Decimal

from boto3.dynamodb.conditions import Key


class JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return json.JSONEncoder.default(self, obj)


def lambda_handler(event, context):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('caspar-creek-data')
    date = event['queryStringParameters']['date']

    return {
        'statusCode': 200,
        'body': json.dumps(
            table.query(
                KeyConditionExpression=Key('date_string').eq(date)
            )['Items'],
            cls=JSONEncoder,
        )
    }
