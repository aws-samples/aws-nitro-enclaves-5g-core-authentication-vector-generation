#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';
import { CoreRanStack } from '../lib/core-ran-stack';
import { ManagementStack } from  '../lib/management-stack';
import { ArpfEnclaveShardsStack } from  '../lib/arpf-enclave-shards-stack';
import { KeyInfrastructureStack } from  '../lib/key-infrastructure-stack';
import { BucketStack } from  '../lib/bucket-stack';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region: string = process.env.CDK_DEFAULT_REGION ?? 'eu-central-1';
const owner = 'acme@';
const applicationName = 'EnclaveArpf';
const stackNamePrefix = 'enclave-arpf';

const amiIdArm64ParameterPath = '/CoreRanAmiPipeline/AMI/ID/Latest/Arm64';
const arpfEnclaveamiIdArm64ParameterPath = '/EnclavePipeline/AMI/ID/Latest/Arm64';
const configurationBucketNameParameterPath = '/ConfigurationDeploymentAutomation/S3/ConfigurationBucketName';
const enclaveMaterialBucketNameParameterPath = '/'+applicationName+'/EnclaveDeploymentPipeline/S3/EnclaveMaterialBucketName';
const enclavesCapacity = 2;

const deploymentData={'coreCidr': '10.11.0.0/18', 'ranCidr': '10.11.32.0/18', 'managementCidr': '10.11.128.0/20'}
console.log(region,deploymentData)

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}));
new BucketStack(app, applicationName+'BucketStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-bucket',
    owner: owner,
    applicationName: applicationName,
    enclaveMaterialBucketNameParameterPath: enclaveMaterialBucketNameParameterPath,
});

const keyInfra = new KeyInfrastructureStack(app, applicationName+'KeyInfrastructureStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-key-infra-',
    owner: owner,
    applicationName: applicationName,
});

const vpcs = new VpcStack(app, applicationName+'VpcStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-vpc',
    owner: owner,
    applicationName: applicationName,
    coreVpcCidr: deploymentData['coreCidr'],
    ranVpcCidr: deploymentData['ranCidr'],
    managementVpcCidr: deploymentData['managementCidr'],
    natGateways:1,
});

const coreRan = new CoreRanStack(app, applicationName+'CoreRanStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-core-ran',
    owner: owner,
    applicationName: applicationName,
    coreVpc: vpcs.coreVpc,
    ranVpc: vpcs.ranVpc,
    hostedZone: vpcs.hostedZone,
    amiIdArm64ParameterPath: amiIdArm64ParameterPath,
    instanceRole: keyInfra.instanceRole,
    enclaveHostRole: keyInfra.enclaveHostRole,
    arpfEnclaveamiIdArm64ParameterPath: arpfEnclaveamiIdArm64ParameterPath,
    configurationBucketNameParameterPath: configurationBucketNameParameterPath,
    enclaveMaterialBucketNameParameterPath: enclaveMaterialBucketNameParameterPath,
    enclavesCapacity: enclavesCapacity,
});
NagSuppressions.addStackSuppressions(coreRan, [
    { id: 'AwsSolutions-IAM5', reason: 'Suppress all AwsSolutions-IAM5 findings: keep it simple for blog post' },
]);

const managementStack = new ManagementStack(app, applicationName+'ManagementStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-management',
    owner: owner,
    applicationName: applicationName,
    managementVpc: vpcs.managementVpc,
    amiIdArm64ParameterPath: amiIdArm64ParameterPath,
    managementHostRole: keyInfra.managementHostRole,
    configurationBucketNameParameterPath: configurationBucketNameParameterPath,
    enclaveMaterialBucketNameParameterPath: enclaveMaterialBucketNameParameterPath,
    keyArn: keyInfra.encryptionKey01.keyArn,        
});
NagSuppressions.addStackSuppressions(managementStack, [
    { id: 'AwsSolutions-IAM5', reason: 'Suppress all AwsSolutions-IAM5 findings: keep it simple for blog post' },
]);

const arpfAlbStack = new ArpfEnclaveShardsStack(app, applicationName+'ArpfEnclaveShardsStack', {
    env: { account: account, region: region },
    stackName: stackNamePrefix+'-shards',
    owner: owner,
    applicationName: applicationName,
    coreVpc: vpcs.coreVpc,
    hostedZone: vpcs.hostedZone,
    securityGroupSubscriberManagement: coreRan.securityGroupSubscriberManagement,
    arpfEnclaveamiIdArm64ParameterPath: arpfEnclaveamiIdArm64ParameterPath,
    enclaveHostRole: keyInfra.shardHostRole,
    configurationBucketNameParameterPath: configurationBucketNameParameterPath,
    enclaveMaterialBucketNameParameterPath: enclaveMaterialBucketNameParameterPath,
});
NagSuppressions.addStackSuppressions(arpfAlbStack, [
    { id: 'AwsSolutions-IAM5', reason: 'Suppress all AwsSolutions-IAM5 findings: keep it simple for blog post' },
]);
