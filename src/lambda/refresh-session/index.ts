import {APIGatewayProxyWithCognitoAuthorizerHandler} from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import * as cookie from 'cookie';
import jwt_decode from 'jwt-decode';

import {FINGERPRINT_COOKIE_NAME} from '../constants';
import {sha256} from '../utils';

const client = new CognitoIdentityProviderClient({});

export const main: APIGatewayProxyWithCognitoAuthorizerHandler =
  async event => {
    try {
      const cookies = cookie.parse(event.headers.cookie || '');
      const fingerprint = cookies[FINGERPRINT_COOKIE_NAME];

      const {refreshToken, companyId = ''} = JSON.parse(event.body || '{}');

      const fingerprintCookieHash = sha256(fingerprint);

      const fingerprintHash = jwt_decode<{fingerprintHash: string}>(
        event.headers.Authorization || '',
      )?.fingerprintHash;

      const isValidFingerprint =
        fingerprintCookieHash === fingerprintHash &&
        fingerprintCookieHash !== '';

      if (!isValidFingerprint)
        return {
          statusCode: 400,
          body: JSON.stringify({message: 'Invalid Request'}),
        };

      const command = new AdminInitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: '69p3rafri5blpg437h22he9jhl',
        UserPoolId: 'eu-central-1_jWfAMOer3',
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
        ClientMetadata: {
          companyId,
        },
      });

      const response = await client.send(command);

      return {
        body: JSON.stringify(response),
        headers: {
          'Access-Control-Allow-Origin': event.headers?.origin || '*',
          'Access-Control-Allow-Credentials': true,
        },
        statusCode: 200,
      };
    } catch (error) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message: `Unauthorized`,
        }),
        headers: {
          'Access-Control-Allow-Origin': event.headers?.origin || '*',
          'Access-Control-Allow-Credentials': true,
        },
      };
    }
  };
