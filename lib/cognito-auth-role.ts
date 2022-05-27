import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';

type CognitoAuthRoleProps = {
  identityPool: cognito.CfnIdentityPool;
};

const timestreamDatabaseName = 'FacialExpression';

export default class CognitoAuthRole extends cdk.Resource {
  role: cdk.aws_iam.Role;
  queryGraphPolicyName: string;
  constructor(scope: cdk.Stack, id: string, props: CognitoAuthRoleProps) {
    super(scope, id);

    const {identityPool} = props;

    // IAM role used for authenticated users
    this.role = new iam.Role(this, 'CognitoDefaultAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'mobileanalytics:PutEvents',
          'cognito-sync:*',
          'cognito-identity:*',
        ],
        resources: ['*'],
      }),
    );

    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      'IdentityPoolRoleAttachment',
      {
        identityPoolId: identityPool.ref,
        roles: {authenticated: this.role.roleArn},
      },
    );

    const queryGraphPolicy = new iam.ManagedPolicy(this, 'QueryGraphPolicy', {
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['timestream:DescribeEndpoints'],
            effect: iam.Effect.ALLOW,
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            actions: ['timestream:Select'],
            effect: iam.Effect.ALLOW,
            resources: [
              `arn:aws:timestream:${scope.region}:${scope.account}:database/${timestreamDatabaseName}/table/*`,
            ],
          }),
        ],
      }),
    });

    this.role.addManagedPolicy(queryGraphPolicy);

    this.queryGraphPolicyName = queryGraphPolicy.managedPolicyName;
  }
}
