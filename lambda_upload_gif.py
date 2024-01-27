from datetime import datetime
import boto3
import json
import urllib.request



def lambda_handler(event, context):
    now = datetime.utcnow().strftime('%Y-%m-%d_%H-%M-%S')
    s3_key = now + '.gif'
    gif_url = 'http://fs-server.humboldt.edu/RTMC/SFCaspar_DetailView.gif'
    s3_client = boto3.client('s3')
    lambda_client = boto3.client('lambda')

    with urllib.request.urlopen(gif_url) as response:
        s3_client.put_object(
            Body=response.read(),
            Bucket='caspar-creek-data',
            Key=s3_key,
        )

    lambda_client.invoke(
        FunctionName='process_caspar_creek_data',
        InvocationType='Event',
        Payload=json.dumps({'s3_key': s3_key}),
    )

    return {
        'statusCode': 200,
        'body': s3_key,
    }
