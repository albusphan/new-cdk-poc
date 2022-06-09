/* eslint-disable @typescript-eslint/require-await */
import {
  QueryCommand,
  TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query';
import {APIGatewayProxyEventV2, APIGatewayProxyResultV2} from 'aws-lambda';

const client = new TimestreamQueryClient({
  region: 'eu-central-1',
});

enum graphType {
  AREA_SCORE = 'area_score',
}

export async function main(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const query =
    'SELECT gender, device_id FROM "FacialExpression"."b8fd7715-464b-46df-9e7f-465293d73755" where time between ago(1d) and now() group by gender, device_id';

  const params = new QueryCommand({
    QueryString: query,
  });

  const response = await client.send(params);

  return {body: JSON.stringify(response), statusCode: 200};
}
