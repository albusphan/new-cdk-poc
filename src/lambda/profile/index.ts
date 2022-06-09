import {APIGatewayProxyHandlerV2} from 'aws-lambda';

import {serialize} from 'cookie';
import {FINGERPRINT_COOKIE_NAME, SAMPLE_FINGERPRINT} from '../constants';

export const main: APIGatewayProxyHandlerV2 = async event => {
  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': serialize(FINGERPRINT_COOKIE_NAME, SAMPLE_FINGERPRINT, {
        httpOnly: true,
        path: '/',
        domain: '.predictablexp.com',
        maxAge: 60 * 60 * 8,
        secure: process.env.NODE_ENV === 'production',
      }),
      'Access-Control-Allow-Origin': event.headers?.origin || '*',
      'Access-Control-Allow-Credentials': true,
    },
  };
};
