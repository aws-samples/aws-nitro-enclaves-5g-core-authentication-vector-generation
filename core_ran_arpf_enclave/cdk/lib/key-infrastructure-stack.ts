// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface KeyInfrastructureStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
}

export class KeyInfrastructureStack extends cdk.Stack {
    public readonly instanceRole: iam.Role;
    public readonly enclaveHostRole: iam.Role;
    public readonly shardHostRole: iam.Role;
    public readonly managementHostRole: iam.Role;
    public readonly encryptionKey01: kms.Key;

    constructor(scope: Construct, id: string, props: KeyInfrastructureStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;

        // Create roles to be used later for CoreRan and Enclave hosts
        this.instanceRole = new iam.Role(this, 'Ec2Role', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
        });
        cdk.Tags.of(this.instanceRole).add('Name', 'coreRanHostRole');
        this.enclaveHostRole = new iam.Role(this, 'EnclaveHostRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
        });
        cdk.Tags.of(this.enclaveHostRole).add('Name', 'enclaveHostRole');
        this.shardHostRole = new iam.Role(this, 'ShardHostRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
        });
        cdk.Tags.of(this.shardHostRole).add('Name', 'shardHostRole');
        this.managementHostRole = new iam.Role(this, 'ManagementHostRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
        });
        cdk.Tags.of(this.managementHostRole).add('Name', 'managementHostRole');
        NagSuppressions.addResourceSuppressions(this.instanceRole, [
            { id: 'AwsSolutions-IAM4', reason: 'Suppress IAM4 on the roles to keep it simple for a blog post. ' }
        ]);
        NagSuppressions.addResourceSuppressions(this.enclaveHostRole, [
            { id: 'AwsSolutions-IAM4', reason: 'Suppress IAM4 on the roles to keep it simple for a blog post. ' }
        ]);
        NagSuppressions.addResourceSuppressions(this.shardHostRole, [
            { id: 'AwsSolutions-IAM4', reason: 'Suppress IAM4 on the roles to keep it simple for a blog post. ' }
        ]);
        NagSuppressions.addResourceSuppressions(this.managementHostRole, [
            { id: 'AwsSolutions-IAM4', reason: 'Suppress IAM4 on the roles to keep it simple for a blog post. ' }
        ]);

        // Key management
        const customEncryptionKeyPolicy = new iam.PolicyDocument({
            statements: [new iam.PolicyStatement({
                sid: 'Enable IAM User Permissions, from CDK, replacing default',
                effect: iam.Effect.ALLOW,
                principals: [new iam.AccountRootPrincipal()],
                actions: ['kms:*'],
                resources: ['*'],
            })],
        });
        this.encryptionKey01 = new kms.Key(this, 'Key01', {
            alias: 'encryption-key-01',
            keySpec: kms.KeySpec.SYMMETRIC_DEFAULT, // Default is SYMMETRIC_DEFAULT
            keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
            pendingWindow: cdk.Duration.days(7),
            policy: customEncryptionKeyPolicy,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            enableKeyRotation: true,
        });

    }
}
