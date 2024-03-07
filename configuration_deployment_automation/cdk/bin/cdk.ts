#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import { ConfigurationAssociationStack } from '../lib/configuration-association-stack';
import { AwsSolutionsChecks } from 'cdk-nag';

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region: string = process.env.CDK_DEFAULT_REGION ?? 'eu-central-1';
const owner = 'acme@';
const applicationName = 'ConfigurationDeploymentAutomation';
const stackNamePrefix = 'configuration-deployment-automation';
const configurationBucketNameParameterPath = '/'+applicationName+'/S3/ConfigurationBucketName';

console.log(region)
const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

new ConfigurationAssociationStack(app, 'ConfigurationAssociationAutomation', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-ssm',
    applicationName: applicationName,
    owner: owner,
    configurationBucketNameParameterPath: configurationBucketNameParameterPath
});
