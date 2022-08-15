import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class LambdaStack extends Stack {
    public readonly lambdaCode: lambda.CfnParametersCode;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        this.lambdaCode = lambda.Code.fromCfnParameters();

        // Get Slackbot token and Signing secret from Secrets Manager
        const slackbotCredentials = secretsmanager.Secret.fromSecretAttributes(this, 'SlackbotCredentials', {
            // TODO:
            secretPartialArn: `insert secret partial ARN`
        });

        const slackbotToken = slackbotCredentials.secretValueFromJson('SLACK_BOT_TOKEN').unsafeUnwrap();
        const slackbotSigningCreds = slackbotCredentials.secretValueFromJson('SLACK_SIGNING_SECRET').unsafeUnwrap();

        // Lambda
        const fn = new lambda.Function(this, 'AppLambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            environment: {
                SLACK_BOT_TOKEN: slackbotToken,
                SLACK_SIGNING_SECRET: slackbotSigningCreds
            },
            handler: 'dist/app.handler',
            code: this.lambdaCode,
            memorySize: 1024,
            timeout: Duration.seconds(5),
        });

        // Ensure CDK synth produces new version each time
        const version = fn.currentVersion;
        const alias = new lambda.Alias(this, 'LambdaAlias', {
            aliasName: 'Prod',
            provisionedConcurrentExecutions: 1,
            version
        });

        // CodeDeploy
        new codedeploy.LambdaDeploymentGroup(this, 'DeploymentGroup', {
            alias,
            deploymentConfig: codedeploy.LambdaDeploymentConfig.LINEAR_10PERCENT_EVERY_1MINUTE,
        });

        // Api Gateway
        const apigw = new apigateway.LambdaRestApi(this, 'AppApi', {
            handler: fn,
            proxy: true,
            endpointTypes: [
                apigateway.EndpointType.REGIONAL,
            ],
            deployOptions: {
                dataTraceEnabled: true,
                tracingEnabled: true
            }
        });

        // Cloudfront
        new cloudfront.CloudFrontWebDistribution(this, "MyCf", {
            defaultRootObject: "/",
            originConfigs: [{
                customOriginSource: {
                    domainName: `${apigw.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
                    originPath: '/' + apigw.deploymentStage.stageName,
                },
                behaviors: [{
                    isDefaultBehavior: true,
                }]
            }],
            enableIpV6: true,
        });
    }
}