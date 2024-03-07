// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from "aws-cdk-lib/aws-logs";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

interface CodebuildCoreRanStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    vpc: ec2.Vpc;
    dockerImageArm64: string
    buildBucketNamePath: string
}

export class CodebuildCoreRanStack extends cdk.Stack {
    readonly buildBucketNameParameter: ssm.StringParameter;
    readonly parameterNamePrefixBuildId: string;

    createBuildIdParameterString(parameterNamePrefix: string, arch: string, description: string, id: string): void {
        new ssm.StringParameter(this, id, {
            description: description,
            parameterName: parameterNamePrefix+'/'+arch,
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: 'n/a',
        });
    }
    
    createArm64Project(projectName: string, projectDescription: string, buildSpecPath: string, artifactPath: string, artifactName: string, buildSpecName: string, logPath: string, bucket: s3.Bucket, vpc: ec2.Vpc, securityGroup: ec2.SecurityGroup, logGroup: logs.LogGroup , buildBucketNamePath: string, functionProcessEvent: lambda.Function, dockerImage: string): void {
        const projectArm64 = new codebuild.Project(this, 'Build'+projectName+'Arm64', {
            description: projectDescription,
            source: codebuild.Source.s3({
                bucket: bucket,
                path: buildSpecPath,
            }),
            artifacts: codebuild.Artifacts.s3({ // Destination for the codebuild build
                bucket,
                includeBuildId: true,
                packageZip: true,
                path: artifactPath+'arm64/',
                name: artifactName
            }),
            buildSpec: codebuild.BuildSpec.fromSourceFilename(buildSpecName),
            environment: {
                // See https://hub.docker.com/r/arm64v8/amazonlinux/
                buildImage: codebuild.LinuxBuildImage.fromDockerRegistry(dockerImage), // 'arm64v8/amazonlinux:2023'
                computeType: codebuild.ComputeType.LARGE
            },
            vpc: vpc,
            subnetSelection: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            },
            securityGroups: [securityGroup],
            logging: {
                cloudWatch: {
                    logGroup: logGroup,
                    prefix: 'codeBuildStream/'+logPath+'/arm64'
                }
            },
        });
        NagSuppressions.addResourceSuppressions(projectArm64, [
            { id: 'AwsSolutions-CB4', reason: 'Not encrypting builds because source comes publicly available projects' },
            { id: 'AwsSolutions-CB5', reason: 'Using custom image because of Graviton architecture' },
        ]);

        const cfnProjectArm64 = projectArm64.node.defaultChild as codebuild.CfnProject;
        cfnProjectArm64.addPropertyOverride('Environment.Type','ARM_CONTAINER');
        // Allow for fetching the s3 bucket name
        projectArm64.addToRolePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                resources: ['*'],
                actions: ['ssm:DescribeParameters'],
            })
        );
        projectArm64.addToRolePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                resources: ['arn:aws:ssm:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':parameter'+buildBucketNamePath],
                actions: ['ssm:GetParameter'],
            })
        );
        // Store the latest successful build ID
        projectArm64.onBuildSucceeded('CopyLatestBuildID', {
             target: new targets.LambdaFunction(functionProcessEvent),
        });
    }

    constructor(scope: Construct, id: string, props: CodebuildCoreRanStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const dockerImageArm64 = props.dockerImageArm64;
        const buildBucketNamePath = props.buildBucketNamePath;

        // Add tags to all constructs in the stack
        cdk.Tags.of(this).add('Owner', owner);
        cdk.Tags.of(this).add('CreatedByStack', stackName);
        cdk.Tags.of(this).add('ApplicationName', applicationName);


        // S3 bucket(s) for buildspec.yaml and artifacts
        const bucket = new s3.Bucket(this, 'CodeBuildBucket', {
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
        this.buildBucketNameParameter =  new ssm.StringParameter(this, 'CodeBuildBucketName', {
            description: 'S3 bucket for CodeBuild',
            parameterName: buildBucketNamePath,
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: bucket.bucketName,
        });

        const logGroup = new logs.LogGroup(this, `CodeBuildLogGroup`, {
            retention: logs.RetentionDays.ONE_WEEK,
        });
        // Custom security group
        const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
            vpc: props.vpc,
            description: 'CodeBuild Custom Security Group',
            allowAllOutbound: true
        });

        // Helper Lambda to copy latest build ID to parameter store and s3
        this.parameterNamePrefixBuildId = '/'+applicationName+'/CodeBuild/';
        const parameterNameOpen5gsBuildId = this.parameterNamePrefixBuildId+'Open5gsLatestBuildId';
        this.createBuildIdParameterString(parameterNameOpen5gsBuildId, 'Arm64', 'Open5gs latest build Arm64','LatestBuildParamOpen5gsArm64');
        const parameterNameOpen5gsEnclaveBuildId = this.parameterNamePrefixBuildId+'Open5gsEnclaveLatestBuildId';
        this.createBuildIdParameterString(parameterNameOpen5gsEnclaveBuildId, 'Arm64', 'Open5gs latest build Arm64','LatestBuildParamOpen5gsEnclaveArm64');
        const parameterNameUeransimBuildId = this.parameterNamePrefixBuildId+'UeransimLatestBuildId';
        this.createBuildIdParameterString(parameterNameUeransimBuildId, 'Arm64', 'UERANSIM latest build Arm64','LatestBuildParamUeransimArm64');

        const functionProcessEventArm64 = new lambda.Function(this, 'CopyLatestBuildArm64', {
            description: 'Copy latest successful build artifact to parameter store',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'latest.main',
            code: lambda.Code.fromAsset('lambda/'),
            architecture: lambda.Architecture.ARM_64,
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            },
            securityGroups: [securityGroup],
            environment: {
                region: cdk.Stack.of(this).region,
                bucket_name: bucket.bucketName,
                open5gs_artifact_parameter: parameterNameOpen5gsBuildId+'/Arm64',
                open5gs_enclave_artifact_parameter: parameterNameOpen5gsEnclaveBuildId+'/Arm64',
                ueransim_artifact_parameter: parameterNameUeransimBuildId+'/Arm64',
            },
            // See https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_destinations.LambdaDestinationOptions.html
            //onSuccess: new destinations.LambdaDestination(functionTriggerBuild,  {
            //    responseOnly: true,
            //}),
        });
        const s3ListBucketsPolicy = new iam.PolicyStatement({
            actions: ['s3:ListAllMyBuckets'],
            resources: ['arn:aws:s3:::*']
        });
        const ssmPutParameterPolicy = new iam.PolicyStatement({
            actions: ['ssm:PutParameter'],
            resources: ['arn:aws:ssm:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':parameter'+parameterNameOpen5gsBuildId+'/*',
                        'arn:aws:ssm:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':parameter'+parameterNameOpen5gsEnclaveBuildId+'/*',
                        'arn:aws:ssm:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':parameter'+parameterNameUeransimBuildId+'/*']
        });
        functionProcessEventArm64.role?.attachInlinePolicy(
            new iam.Policy(this, 'ssm-put-parameter-policy-arm64', {
                statements: [ssmPutParameterPolicy],
            }),
        );
        NagSuppressions.addResourceSuppressions(functionProcessEventArm64, [
            { id: 'AwsSolutions-IAM4', reason: 'Suppress all AwsSolutions-IAM4 on the children of the Lambda function' },
        ],true);
        
        // Build projects
        const open5gsProjectName = 'Open5gs';
        const open5gsDescription = 'Builds Open5GS on Arm64, export to S3';
        const open5gsBuildSpecPath = 'buildSpecs/open5gs.zip';
        const open5gsBuildSpecName = 'buildSpecOpen5gs.yaml';
        const open5gsArtifactPath = 'builds/open5gs/';
        const open5gsArtifactName = 'open5gs-build.zip';
        const open5gsLogPath = 'open5gs';
        this.createArm64Project(open5gsProjectName, open5gsDescription, open5gsBuildSpecPath, open5gsArtifactPath, open5gsArtifactName, open5gsBuildSpecName, open5gsLogPath, bucket, props.vpc, securityGroup, logGroup, buildBucketNamePath, functionProcessEventArm64, dockerImageArm64);
        const open5gsEnclaveProjectName = 'Open5gsEnclave';
        const open5gsEnclaveDescription = 'Builds Open5GS with ARPF Enclave support on Arm64, export to S3';
        const open5gsEnclaveBuildSpecPath = 'buildSpecs/open5gs-enclave.zip';
        const open5gsEnclaveBuildSpecName = 'buildSpecOpen5gsEnclave.yaml';
        const open5gsEnclaveArtifactPath = 'builds/open5gs-enclave/';
        const open5gsEnclaveArtifactName = 'open5gs-enclave-build.zip';
        const open5gsEnclaveLogPath = 'open5gs-enclave';
        this.createArm64Project(open5gsEnclaveProjectName, open5gsEnclaveDescription, open5gsEnclaveBuildSpecPath, open5gsEnclaveArtifactPath, open5gsEnclaveArtifactName, open5gsEnclaveBuildSpecName, open5gsEnclaveLogPath, bucket, props.vpc, securityGroup, logGroup, buildBucketNamePath, functionProcessEventArm64, dockerImageArm64);
        const ueransimProjectName = 'Ueransim';
        const ueransimDescription = 'Builds Ueransim on Arm64, export to S3';
        const ueransimBuildSpecPath = 'buildSpecs/ueransim.zip';
        const ueransimBuildSpecName = 'buildSpecUeransim.yaml';
        const ueransimArtifactPath = 'builds/ueransim/';
        const ueransimArtifactName = 'ueransim-build.zip';
        const ueransimLogPath = 'ueransim';
        this.createArm64Project(ueransimProjectName, ueransimDescription, ueransimBuildSpecPath, ueransimArtifactPath, ueransimArtifactName, ueransimBuildSpecName, ueransimLogPath, bucket, props.vpc, securityGroup, logGroup, buildBucketNamePath, functionProcessEventArm64, dockerImageArm64);
    }
}
