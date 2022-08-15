import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { App, Stack, StackProps } from 'aws-cdk-lib';

const cdkBuildSpec = {
    version: '0.2',
    phases: {
        install: {
            commands: [
                'npm install'
            ]
        },
        build: {
            commands: [
                'npm run cdk synth -- -o dist'
            ]
        }
    },
    artifacts: {
        'base-directory': 'dist',
        files: [
            'LambdaStack.template.json'
        ]
    }
}

const lambdaBuildSpec = {
    version: '0.2',
    phases: {
        install: {
            commands: [
                'cd lambda',
                'npm i'
            ]
        },
        build: {
            commands: [
                'npm run build'
            ]
        }
    },
    artifacts: {
        'base-directory': 'lambda',
        files: [
            'dist/**/*',
            'node_modules/**/*',
            '@types'
        ]
    }
}

export interface PipelineStackProps extends StackProps {
    readonly lambdaCode: lambda.CfnParametersCode;
}

export class PipelineStack extends Stack {
    constructor(app: App, id: string, props: PipelineStackProps) {
        super(app, id, props);

        // Get Github token from Secrets Manager
        const githubSecret = secretsmanager.Secret.fromSecretAttributes(this, 'GithubSecret', {
            // TODO:
            secretPartialArn: `insert secret partial ARN`
        });

        const githubAccessToken = githubSecret.secretValueFromJson('AccessToken');

        // Create Artifacts
        const codeSourceArtifact = new codepipeline.Artifact('CodeSourceArtifact');
        const cdkBuildArtifact = new codepipeline.Artifact('CdkBuildArtifact');
        const lambdaBuildArtifact = new codepipeline.Artifact('LambdaBuildArtifact');

        // Github
        const codeSourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: 'GithubCheckout',
            output: codeSourceArtifact,
            owner: 'jenniwu',
            repo: 'SlackbotCDK',
            branch: 'master',
            oauthToken: githubAccessToken,
            trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
        });

        // CDK
        const cdkBuildAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'CDKBuildAction',
            project: this.createCodeBuildProject('CDK'),
            input: codeSourceArtifact,
            outputs: [cdkBuildArtifact]
        });

        // Lambda
        const lambdaBuildAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'LambdaBuildAction',
            project: this.createCodeBuildProject('Lambda'),
            input: codeSourceArtifact,
            outputs: [lambdaBuildArtifact]
        });

        // Complete Pipeline Project
        new codepipeline.Pipeline(this, 'Pipeline', {
            restartExecutionOnUpdate: true,
            stages: [
                {
                    stageName: 'Source',
                    actions: [codeSourceAction],
                },
                {
                    stageName: 'Build',
                    actions: [
                        lambdaBuildAction,
                        cdkBuildAction
                    ],
                },
                {
                    stageName: 'Deploy',
                    actions: [
                        new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                            actionName: 'Lambda_CFN_Deploy',
                            templatePath: cdkBuildArtifact.atPath('LambdaStack.template.json'),
                            stackName: 'LambdaDeploymentStack',
                            adminPermissions: true,
                            parameterOverrides: {
                                ...props.lambdaCode.assign(lambdaBuildArtifact.s3Location)
                            },
                            extraInputs: [lambdaBuildArtifact],
                        }),
                    ],
                },
            ],
        });
    }

    private getBuildSpecContent = (project: string) => {
        return project == 'CDK' ? cdkBuildSpec : lambdaBuildSpec;
    }

    private createCodeBuildProject = (project: string): codebuild.PipelineProject => {
        return new codebuild.PipelineProject(this, `${project}BuildProject`, {
            projectName: project,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0
            },
            buildSpec: codebuild.BuildSpec.fromObject(this.getBuildSpecContent(project))
        });
    }
}

