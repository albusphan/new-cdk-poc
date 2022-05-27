import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as router53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager';
import {SecurityPolicy} from 'aws-cdk-lib/aws-apigateway';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import CognitoAuthRole from './cognito-auth-role';

interface Props extends cdk.StackProps {
  domainName: string;
}

export class CdkStarterStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: Props) {
    super(scope, id, props);

    const apiDomainName = `mp.${props.domainName}`;
    const timestreamDatabaseName = 'FacialExpression';

    // 👇 create the user pool
    const userPool = new cognito.UserPool(this, 'userpool', {
      userPoolName: `my-user-pool`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      selfSignUpEnabled: true,
      signInAliases: {email: true},
      autoVerify: {email: true},
      passwordPolicy: {
        minLength: 6,
        requireLowercase: false,
        requireDigits: false,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // 👇 create the user pool client
    const userPoolClient = new cognito.UserPoolClient(this, 'userpool-client', {
      userPool,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        custom: true,
        userSrp: true,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    const identityPool = new cognito.CfnIdentityPool(this, 'identity-pool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    const authRole = new CognitoAuthRole(this, 'cognito-auth-role', {
      identityPool,
    });

    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['timestream:DescribeEndpoints'],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['timestream:Select'],
          Resource: `arn:aws:timestream:${props.env?.region}:${props.env?.account}:database/${timestreamDatabaseName}/table/*`,
        },
      ],
    };

    // 👇 create the lambda that sits behind the authorizer
    const queryGraph = new NodejsFunction(this, 'query-graph', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'main',
      entry: path.join(__dirname, `/../src/graphs/index.ts`),
    });

    queryGraph.role?.addManagedPolicy(
      iam.ManagedPolicy.fromManagedPolicyName(
        this,
        'query-graph-lambda',
        authRole.queryGraphPolicyName,
      ),
    );

    const queryBooks = new NodejsFunction(this, 'query-book', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'main',
      entry: path.join(__dirname, `/../src/books/index.ts`),
    });

    // 👇 Get hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'hosted-zone', {
      domainName: props.domainName,
    });

    const certificate = new Certificate(this, 'certificate', {
      domainName: `*.${props.domainName}`,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    // 👇 create the API
    const restApi = new apiGateway.RestApi(this, 'api', {
      restApiName: 'my-api',
      domainName: {
        certificate,
        domainName: apiDomainName,
        securityPolicy: SecurityPolicy.TLS_1_2,
      },
    });

    new route53.ARecord(this, 'api-record', {
      recordName: apiDomainName,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new router53Targets.ApiGateway(restApi),
      ),
    });

    // 👇 create the Authorizer
    const authorizer = new apiGateway.CognitoUserPoolsAuthorizer(
      this,
      'user-pool-authorizer',
      {
        cognitoUserPools: [userPool],
      },
    );

    const graphs = restApi.root.addResource('graphs');
    graphs.addMethod('GET', new apiGateway.LambdaIntegration(queryGraph), {
      authorizer,
      authorizationType: apiGateway.AuthorizationType.COGNITO,
    });

    const books = restApi.root.addResource('books');
    books.addMethod('GET', new apiGateway.LambdaIntegration(queryBooks), {
      authorizer,
      authorizationType: apiGateway.AuthorizationType.COGNITO,
    });

    new cdk.CfnOutput(this, 'region', {value: cdk.Stack.of(this).region});
    new cdk.CfnOutput(this, 'userPoolId', {value: userPool.userPoolId});
    new cdk.CfnOutput(this, 'userPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'apiUrl', {
      value: restApi.url!,
    });
  }
}
