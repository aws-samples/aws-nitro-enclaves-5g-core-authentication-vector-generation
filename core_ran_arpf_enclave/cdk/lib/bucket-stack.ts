// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from 'constructs';

interface BucketStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    enclaveMaterialBucketNameParameterPath: string;
}

export class BucketStack extends cdk.Stack {
    public readonly enclaveMaterialBucket: s3.Bucket;
    public enclaveMaterialBucketNameParameter: ssm.StringParameter;

    constructor(scope: Construct, id: string, props: BucketStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;

        const enclaveMaterialBucketNameParameterPath = props.enclaveMaterialBucketNameParameterPath;

        // S3 bucket(s) for storing the encrypted key material and further enclave artefacts
        this.enclaveMaterialBucket = new s3.Bucket(this, 'EnclaveMaterialBucket', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            enforceSSL: true,
            minimumTLSVersion: 1.2,
            serverAccessLogsPrefix: `${stackName}-${applicationName}-${owner}-s3-access-logs`,
        });
        // Save bucket name
        this.enclaveMaterialBucketNameParameter =  new ssm.StringParameter(this, 'EnclaveMaterialBucketName', {
            description: 'S3 bucket for key and enclave material',
            parameterName: enclaveMaterialBucketNameParameterPath,
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: this.enclaveMaterialBucket.bucketName,
        });

    }
}
