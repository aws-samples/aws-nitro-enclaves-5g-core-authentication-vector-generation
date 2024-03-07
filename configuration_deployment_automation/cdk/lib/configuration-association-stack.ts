// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface ConfigurationAssociationStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    configurationBucketNameParameterPath: string;
}

export class ConfigurationAssociationStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: ConfigurationAssociationStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const configurationBucketNameParameterPath = props.configurationBucketNameParameterPath;

        const enclaveArpfAnsibleConfigurationsDirectory = 'configuration/arpf_enclave/';

        // Add tags to all constructs in the stack
        cdk.Tags.of(this).add('Owner', owner);
        cdk.Tags.of(this).add('CreatedByStack', stackName);
        cdk.Tags.of(this).add('ApplicationName', applicationName);

        // S3 bucket(s) for configuration files and scripts
        const bucket = new s3.Bucket(this, 'ConfigurationBucket', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            enforceSSL: true,
            minimumTLSVersion: 1.2,
            serverAccessLogsPrefix: 'accessLogs/'
        });
        // Save bucket name
        const configurationBucketNameParameter =  new ssm.StringParameter(this, 'ConfigurationBucketName', {
            description: 'S3 bucket for configuration deployment and automation (and possibly CodeBuild)',
            parameterName: configurationBucketNameParameterPath,
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: bucket.bucketName,
        });

        // From https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-state-manager-ansible.html#systems-manager-state-manager-ansible-cli
        const enclaveArpfAssociation = new ssm.CfnAssociation(this, 'EnclaveArpfAssociation', {
            name: 'AWS-ApplyAnsiblePlaybooks',

            // Following roperties are optional
            associationName: 'EnclaveArpfAssociation',
            parameters: {
                "SourceType": ["S3"],
                "SourceInfo": ["{\"path\":\""+bucket.virtualHostedUrlForObject(enclaveArpfAnsibleConfigurationsDirectory)+"\"}"],
                "PlaybookFile":["playbook.yaml"],
                "Check":["False"],
                "InstallDependencies": ["False"] // Because using a native x86 image
            },
            complianceSeverity: 'MEDIUM',
            targets: [
                {
                    key: 'tag:Deployment',
                    values: ['EnclaveArpf'],
                },
                {
                    key: 'tag:Association',
                    values: ['ran','core','management','enclave'],
                }],
        });
    }
}
