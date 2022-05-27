import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandler,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {STSClient, AssumeRoleCommand} from '@aws-sdk/client-sts';

const client = new STSClient({});

export const main: APIGatewayProxyHandler = async (event, context) => {
  return {body: JSON.stringify({message: 'Success'}), statusCode: 200};
};
