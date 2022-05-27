#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {CdkStarterStack} from '../lib/cdk-starter-stack';

const AWS_SANDBOX_ACCOUNT = '747827147613';
const AWS_REGION = 'eu-central-1';

const app = new cdk.App();

new CdkStarterStack(app, 'sample-api-gateway-cognito', {
  stackName: 'sample-api-gateway-cognito',
  env: {
    region: AWS_REGION,
    account: AWS_SANDBOX_ACCOUNT,
  },
  domainName: 'sandbox.predictablexp.com',
});
