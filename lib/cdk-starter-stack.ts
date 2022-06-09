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
import {Duration} from 'aws-cdk-lib';

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
      customAttributes: {
        companies: new cognito.StringAttribute({
          mutable: true,
        }),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      lambdaTriggers: {
        preTokenGeneration: new NodejsFunction(this, 'pre-token-generator', {
          runtime: lambda.Runtime.NODEJS_14_X,
          handler: 'main',
          entry: path.join(
            __dirname,
            `/../src/lambda/preTokenTrigger/index.ts`,
          ),
        }),
      },
    });

    // 👇 create the user pool client
    const userPoolClient = new cognito.UserPoolClient(this, 'userpool-client', {
      userPool,
      authFlows: {
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

    // 👇 create the lambda that sits behind the authorizer
    const queryGraph = new NodejsFunction(this, 'query-graph', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'main',
      entry: path.join(__dirname, `/../src/lambda/graphs/index.ts`),
      timeout: Duration.seconds(30),
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
      entry: path.join(__dirname, `/../src/lambda/books/index.ts`),
    });

    const getProfile = new NodejsFunction(this, 'get-profile', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'main',
      entry: path.join(__dirname, `/../src/lambda/profile/index.ts`),
    });

    const refreshSession = new NodejsFunction(this, 'refresh-token', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'main',
      entry: path.join(__dirname, `/../src/lambda/refresh-session/index.ts`),
    });

    refreshSession.role?.addManagedPolicy(
      new iam.ManagedPolicy(this, 'refresh-token-lambda', {
        managedPolicyName: 'refresh-token-lambda',
        statements: [
          new iam.PolicyStatement({
            actions: ['cognito-idp:AdminInitiateAuth'],
            resources: [userPool.userPoolArn],
            effect: iam.Effect.ALLOW,
          }),
        ],
      }),
    );

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
      defaultCorsPreflightOptions: {
        allowOrigins: ['http://local.sandbox.predictablexp.com:4444'],
        allowHeaders: [
          'Content-Type',
          'Content-Length',
          'Authorization',
          'Accept',
          'X-Requested-With',
          'X-API-KEY',
        ],
        allowCredentials: true,
      },
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

    const profile = restApi.root.addResource('profile');
    profile.addMethod('GET', new apiGateway.LambdaIntegration(getProfile), {
      authorizer,
      authorizationType: apiGateway.AuthorizationType.COGNITO,
    });
    const profileRefreshSession = profile.addResource('refresh-session');
    profileRefreshSession.addMethod(
      'POST',
      new apiGateway.LambdaIntegration(refreshSession),
      {
        authorizer,
        authorizationType: apiGateway.AuthorizationType.COGNITO,
        requestValidatorOptions: {
          validateRequestBody: true,
        },
        requestModels: {
          'application/json': new apiGateway.Model(
            this,
            'refresh-token-model',
            {
              restApi,
              schema: {
                type: apiGateway.JsonSchemaType.OBJECT,
                properties: {
                  companyId: {
                    type: apiGateway.JsonSchemaType.STRING,
                  },
                  refreshToken: {
                    type: apiGateway.JsonSchemaType.STRING,
                  },
                },
                required: ['companyId', 'refreshToken'],
              },
            },
          ),
        },
      },
    );
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
