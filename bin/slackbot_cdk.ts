#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LambdaStack } from '../lib/lambda-stack';
import { PipelineStack } from '../lib/pipeline-stack';

const props = {
  env: {
    // TODO
    region: "insert default region"
  }
};

const app = new cdk.App();
const lambdaStack = new LambdaStack(app, 'LambdaStack', props);
const pipelineStack = new PipelineStack(app, 'PipelineStack', {
  lambdaCode: lambdaStack.lambdaCode,
  ...props
});

app.synth();