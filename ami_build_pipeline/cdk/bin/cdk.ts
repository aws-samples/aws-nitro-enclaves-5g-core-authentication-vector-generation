#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import { VpcStack as CodebuildVpcStack } from '../lib/vpc-stack';
import { CodebuildCoreRanStack } from '../lib/codebuild-core-ran-stack';
import { ImageBuilderCoreRanStack } from '../lib/image-builder-core-ran-stack';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region: string = process.env.CDK_DEFAULT_REGION ?? 'eu-central-1';
const owner = 'acme@';
const applicationName = 'CoreRanAmiPipeline';
const stackNamePrefix = 'core-ran-ami-pipeline';
// To be reused outside
const buildBucketNamePath = '/'+applicationName+'/S3/CodeBuildCoreRanBucketName';

const dockerImageArm64 = 'arm64v8/amazonlinux:2023'
//From aws ec2 describe-images --owners amazon --filters "Name=name,Values=al2023*" --query 'sort_by(Images, &CreationDate)[].Name' and aws ssm get-parameters-by-path --path /aws/service/ami-amazon-linux-latest/
const arm64ParentImagePath = '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64'; // '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64';

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}));

const codebuildVpc = new CodebuildVpcStack(app, 'CodebuildVpcStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-vpc',
    applicationName: applicationName,
    owner: owner,
    withPrivateSubnet: true,
    natGateways: 1,
});

const codeBuild = new CodebuildCoreRanStack(app, 'CodebuildCoreRanStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-codebuild',
    applicationName: applicationName,
    owner: owner,
    vpc: codebuildVpc.vpc,
    dockerImageArm64: dockerImageArm64,
    buildBucketNamePath: buildBucketNamePath
});
NagSuppressions.addStackSuppressions(codeBuild, [
    { id: 'AwsSolutions-IAM5', reason: 'Suppress all AwsSolutions-IAM5 on the Stack' },
]);

const imageBuilder = new ImageBuilderCoreRanStack(app, 'ImageBuilderCoreRanStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-imagebuilder',
    applicationName: applicationName,
    owner: owner,
    arm64ParentImagePath: arm64ParentImagePath,
    buildBucketNameParameter: codeBuild.buildBucketNameParameter,
    parameterNamePrefixBuildId: codeBuild.parameterNamePrefixBuildId,
});
NagSuppressions.addStackSuppressions(imageBuilder, [
    { id: 'AwsSolutions-IAM5', reason: 'Suppress all AwsSolutions-IAM5 on the Stack' },
]);