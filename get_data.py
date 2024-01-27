import boto3

from boto3.dynamodb.conditions import Key, Attr


def lambda_handler(event, context):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('caspar-creek-data')
    return table.query(
        KeyConditionExpression=Key('date_string').eq('2024-01-25')
    )
