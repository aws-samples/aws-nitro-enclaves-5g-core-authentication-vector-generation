#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import { ImageBuilderEnclaveStack } from '../lib/image-builder-enclave-stack';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region: string = process.env.CDK_DEFAULT_REGION ?? 'eu-central-1';
const owner = 'acme@';
const applicationName = 'EnclavePipeline';
const stackNamePrefix = 'enclave-pipeline';

// Reusing bucket from the AMI pipeline
const amiPipelineApplicationName = 'CoreRanAmiPipeline';
const buildBucketNamePath = '/'+amiPipelineApplicationName+'/S3/CodeBuildCoreRanBucketName';

const dockerImageArm64 = 'arm64v8/amazonlinux:2023'
//From aws ec2 describe-images --owners amazon --filters "Name=name,Values=al2023*" --query 'sort_by(Images, &CreationDate)[].Name' and aws ssm get-parameters-by-path --path /aws/service/ami-amazon-linux-latest/
const arm64ParentImagePath = '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64'; // '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64';

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const imageBuilder = new ImageBuilderEnclaveStack(app, 'ImageBuilderEnclaveStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-imagebuilder',
    applicationName: applicationName,
    owner: owner,
    arm64ParentImagePath: arm64ParentImagePath,
    buildBucketNamePath: buildBucketNamePath,
});
NagSuppressions.addStackSuppressions(imageBuilder, [
    { id: 'AwsSolutions-IAM5', reason: 'Suppress all AwsSolutions-IAM5 on the Stack' },
]);