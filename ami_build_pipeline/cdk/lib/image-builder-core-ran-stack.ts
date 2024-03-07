// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as imagebuilder from 'aws-cdk-lib/aws-imagebuilder';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as topic from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as subscription from 'aws-cdk-lib/aws-sns-subscriptions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as fs from 'fs';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

interface ImageBuilderCoreRanStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    arm64ParentImagePath: string;
    buildBucketNameParameter: ssm.StringParameter;
    parameterNamePrefixBuildId: string;
}


export class ImageBuilderCoreRanStack extends cdk.Stack {
    readonly latestAmiIdPrefix: string;
    readonly latestOpen5gsWebUiUriPrefix: string;
    //readonly latestOpen5gsBinariesPrefix: string;
    readonly open5gsRepositoryUriParameterPath: string

    createDistributionConfiguration(namePrefix: string, region: string, name: string): imagebuilder.CfnDistributionConfiguration {
        const distributionConfiguration = new imagebuilder.CfnDistributionConfiguration(this, 'DistributionConfiguration'+name, {
            distributions: [{
                region: region,
                amiDistributionConfiguration: {
                    Name: namePrefix+'-{{ imagebuilder:buildDate }}',
                    AmiTags: {
                        CreatedBy: 'EC2ImageBuilder',
                        Name: namePrefix+'-{{ imagebuilder:buildDate }}'
                    },
                },
            }],
            name: name,
        });
        return distributionConfiguration;
    }

    createContainerDistributionConfiguration(repository: ecr.Repository, region: string, name: string): imagebuilder.CfnDistributionConfiguration {
        const containerDistributionConfiguration = new imagebuilder.CfnDistributionConfiguration(this, 'ContainerDistributionConfiguration'+name, {
            distributions: [{
                region: region,
                containerDistributionConfiguration: { // Achtung!!! Had to put Capital on the first letter because this is otherwise failing the CFN check
                    TargetRepository: {
                        RepositoryName: repository.repositoryName,
                        Service: 'ECR',
                    },
                },
            }],
            name: 'Containers'+name,
        });
        return containerDistributionConfiguration;
    }
    
    createInfrastructureConfiguration(instanceProfileRef: string, arch: string, instanceTypes: string[], notificationTopicArn: string, logBucketName: string, prefixString: string): imagebuilder.CfnInfrastructureConfiguration {
        const cfnInfrastructureConfiguration = new imagebuilder.CfnInfrastructureConfiguration(this, prefixString+'InfrastructureConfiguration'+arch, {
            instanceProfileName: instanceProfileRef,
            name: prefixString+'Infrastructure'+arch,
            instanceTypes: instanceTypes,
            terminateInstanceOnFailure: true,
            snsTopicArn: notificationTopicArn,
            logging: {
                s3Logs: {
                    s3BucketName: logBucketName,
                    s3KeyPrefix: 'imagebuilder/logs',
                },
            },
        });
        return cfnInfrastructureConfiguration;
    }

    constructor(scope: Construct, id: string, props: ImageBuilderCoreRanStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const arm64ParentImage = ec2.MachineImage.fromSsmParameter(props.arm64ParentImagePath);
        const buildBucketString = props.buildBucketNameParameter.stringValue;
        const parameterNamePrefixBuildId = props.parameterNamePrefixBuildId;
        
        // Add tags to all constructs in the stack
        cdk.Tags.of(this).add('Owner', owner);
        cdk.Tags.of(this).add('CreatedByStack', stackName);
        cdk.Tags.of(this).add('ApplicationName', applicationName);

        // ECR repositories
        const open5gsRepository = new ecr.Repository(this, 'Open5gsRepository', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            //autoDeleteImages: true,
            imageTagMutability: ecr.TagMutability.IMMUTABLE
        });
        this.open5gsRepositoryUriParameterPath = '/'+applicationName+'/ECR/Open5gs/Uri';
        const open5gsRepositoryUriParameter = new ssm.StringParameter(this, 'Open5gsRepositoryUriParameter', {
            description: 'Open5gs repository URI',
            parameterName: this.open5gsRepositoryUriParameterPath,
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: open5gsRepository.repositoryUri,
        });
        // Instance Profile and role for EC2 instance being used by EC2 Image Builder
        //
        const ec2Role = new iam.Role(this, 'Role', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            description: 'Role used by the instance profile required by EC2 Image Builder',
        });
        const cfnInstanceProfile = new iam.CfnInstanceProfile(this, 'ImageBuilderCfnInstanceProfile', {
            roles: [ec2Role.roleName],
        });
        // According to https://docs.aws.amazon.com/imagebuilder/latest/userguide/image-builder-setting-up.html
        ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'));
        ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'));
        ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        const s3ListBucket = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:ListBucket'],
            resources: ['arn:aws:s3:::'+buildBucketString]
        });
        const s3GetObject = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:GetObject','s3:PutObject'],
            resources: ['arn:aws:s3:::'+buildBucketString+'/*']
        });
        // Add policy to function role
        ec2Role.attachInlinePolicy(
            new iam.Policy(this, 's3-download-binaries', {
                statements: [s3ListBucket,s3GetObject],
            }),
        );
        ec2Role.attachInlinePolicy(
            new iam.Policy(this, 'ecr-publish-container', {
                statements: [
                    new iam.PolicyStatement({ // Restrict to listing and describing tables
                        actions: ['ecr:DescribeRepositories','ecr:GetAuthorizationToken'],
                        resources: ['*'],
                    }),
                    new iam.PolicyStatement({ // Restrict to listing and describing tables
                        actions: ['ecr:CompleteLayerUpload','ecr:UploadLayerPart','ecr:InitiateLayerUpload','ecr:BatchCheckLayerAvailability','ecr:PutImage'],
                        resources: [open5gsRepository.repositoryArn],
                    }),
                ],
            })
        );
        const getCodeBuildIdParameter = new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: ['arn:aws:ssm:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':parameter'+parameterNamePrefixBuildId+'*'],
        });
        ec2Role.attachInlinePolicy(
            new iam.Policy(this, 'ssm-get-parameter', {
                statements: [getCodeBuildIdParameter],
            }),
        );
        NagSuppressions.addResourceSuppressions(ec2Role, [
            { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policy because this keeps definition easier. Replace in production setup' },
        ]);
        // Image Builder Deployment
        const arch = 'Arm64';
        const name = 'CoreRan'+arch;
        const namePrefix = name+'-AL2023';
        const snsKey = new kms.Key(this,'SnsKey',{
            enableKeyRotation: true,
            pendingWindow: cdk.Duration.days(7),
            alias: 'ImageBuilderCoreRanSnsKey'
        });
        // See https://docs.aws.amazon.com/imagebuilder/latest/userguide/integ-sns.html#integ-sns-encrypted
        snsKey.grant(
            new iam.ArnPrincipal('arn:aws:iam::'+cdk.Stack.of(this).account+':role/aws-service-role/imagebuilder.amazonaws.com/AWSServiceRoleForImageBuilder'),
            'kms:GenerateDataKey*'
        );
        snsKey.grant(
            new iam.ArnPrincipal('arn:aws:iam::'+cdk.Stack.of(this).account+':role/aws-service-role/imagebuilder.amazonaws.com/AWSServiceRoleForImageBuilder'),
            'kms:Decrypt'
        );
        const notificationTopicArm64 = new topic.Topic(this,"CoreRanNotificationTopicArm64",{
            topicName: 'CoreRanImageBuilderNotificationsArm64',
            masterKey: snsKey,

        });
        const notificationTopicContainersArm64 = new topic.Topic(this,"CoreRanNotificationTopicContainersArm64",{
            topicName: 'CoreRanImageBuilderNotificationsContainersArm64',
            masterKey: snsKey,
        });
        const instanceTypes = ['m6g.xlarge','m6g.large','t4g.large'];

        const infrastructureConfigurationArm64 = this.createInfrastructureConfiguration(cfnInstanceProfile.ref, arch, instanceTypes, notificationTopicArm64.topicArn, buildBucketString, '');
        infrastructureConfigurationArm64.addDependency(cfnInstanceProfile);
        const containerInfrastructureConfigurationArm64 = this.createInfrastructureConfiguration(cfnInstanceProfile.ref, arch, instanceTypes, notificationTopicContainersArm64.topicArn, buildBucketString, 'Container');
        containerInfrastructureConfigurationArm64.addDependency(cfnInstanceProfile);

        const installComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/install.yaml'), 'utf-8');
        const installComponentAL2023 = new imagebuilder.CfnComponent(this, 'InstallComponentAL2023', {
            name: 'Basic packages',
            platform: 'Linux',
            version: '0.0.10',
            changeDescription: 'Initial version',
            description: 'Install basic needed packages (e.g. jq)',
            data: installComponentAL2023Data
        });
        const dockerComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/docker.yaml'), 'utf-8');
        const dockerComponentAL2023 = new imagebuilder.CfnComponent(this, 'DockerComponentAL2023', {
            name: 'Docker',
            platform: 'Linux',
            version: '0.0.1',
            changeDescription: 'Initial version',
            description: 'Install docker',
            data: dockerComponentAL2023Data
        });
        const dependenciesComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/dependencies.yaml'), 'utf-8');
        const dependenciesComponentAL2023 = new imagebuilder.CfnComponent(this, 'DependenciesComponentAL2023', {
            name: 'Dependencies for Open5gs - SRSRAN - UERANSIM',
            platform: 'Linux',
            version: '0.0.3',
            changeDescription: 'Initial version',
            description: 'Install dependencies for Open5gs, SRSRAN, and UERANSIM',
            data: dependenciesComponentAL2023Data
        });
        const open5gsComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/open5gs.yaml'), 'utf-8');
        const open5gsComponentAL2023 = new imagebuilder.CfnComponent(this, 'Open5gsComponentAL2023', {
            name: 'Open5gs binaries',
            platform: 'Linux',
             version: '0.0.7',
            changeDescription: 'Initial version',
            description: 'Install Open5gs binaries',
            data: open5gsComponentAL2023Data
        });
        const open5gsEnclaveComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/open5gsEnclave.yaml'), 'utf-8');
        const open5gsEnclaveComponentAL2023 = new imagebuilder.CfnComponent(this, 'Open5gsEnclaveComponentAL2023', {
            name: 'Open5gs binaries with Enclave support',
            platform: 'Linux',
             version: '0.0.1',
            changeDescription: 'Initial version',
            description: 'Install the limited set of Open5gs binaries with Enclave support',
            data: open5gsEnclaveComponentAL2023Data
        });
        const mongoDbShellComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/mongosh.yaml'), 'utf-8');
        const mongoDbShellComponentAL2023 = new imagebuilder.CfnComponent(this, 'MongoDbShellComponentAL2023', {
            name: 'MongoDb',
            platform: 'Linux',
            version: '0.0.1',
            changeDescription: 'Initial version',
            description: 'Install MongoDb shell',
            data: mongoDbShellComponentAL2023Data
        });
        const ueransimComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/ueransim.yaml'), 'utf-8');
        const ueransimComponentAL2023 = new imagebuilder.CfnComponent(this, 'ueransimComponentAL2023', {
            name: 'UERANSIM binaries',
            platform: 'Linux',
            version: '0.0.1',
            changeDescription: 'Initial version',
            description: 'Install UERANSIM binaries',
            data: ueransimComponentAL2023Data
        });
        const adotComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/adot.yaml'), 'utf-8');
        const adotComponentAL2023 = new imagebuilder.CfnComponent(this, 'adotComponentAL2023', {
            name: 'ADOT binaries',
            platform: 'Linux',
            version: '0.0.1',
            changeDescription: 'Initial version',
            description: 'Install ADOT binaries',
            data: adotComponentAL2023Data
        });
        const imageRecipeCoreRanArm64 = new imagebuilder.CfnImageRecipe(this, 'ImageRecipeCoreRanArm64', {
            name: 'CoreRanArm64',
            description: 'Core and RAN (with Nitro Enclave) Arm64 Image Recipe based AL2023',
            components: [
                { componentArn: installComponentAL2023.attrArn },
                { componentArn: dockerComponentAL2023.attrArn },
                { componentArn: dependenciesComponentAL2023.attrArn },
                { componentArn: open5gsComponentAL2023.attrArn, parameters: [{
                    name: 'ParameterStorePath',
                    value: [parameterNamePrefixBuildId+'Open5gsLatestBuildId/Arm64'],
                }]},
                { componentArn: open5gsEnclaveComponentAL2023.attrArn, parameters: [{
                    name: 'ParameterStorePath',
                    value: [parameterNamePrefixBuildId+'Open5gsEnclaveLatestBuildId/Arm64'],
                }]},
                { componentArn: mongoDbShellComponentAL2023.attrArn },
                { componentArn: ueransimComponentAL2023.attrArn, parameters: [{
                    name: 'ParameterStorePath',
                    value: [parameterNamePrefixBuildId+'UeransimLatestBuildId/Arm64'],
                }]},
                // { componentArn: srsranComponentAL2023.attrArn, parameters: [{
                //     name: 'ParameterStorePath',
                //     value: [parameterNamePrefixBuildId+'SrsranLatestBuildId/Arm64'],
                // }]},
                { componentArn: adotComponentAL2023.attrArn },
                { componentArn: 'arn:aws:imagebuilder:'+cdk.Stack.of(this).region+':aws:component/aws-codedeploy-agent-linux/x.x.x' },
            ],
            parentImage: arm64ParentImage.getImage(this).imageId,
            version: '0.0.27',
            additionalInstanceConfiguration: {
                systemsManagerAgent: {
                    uninstallAfterBuild: false,
                },
            },
        });

        // See
        // https://aws.amazon.com/blogs/devops/build-and-deploy-docker-images-to-aws-using-ec2-image-builder/
        // and
        // https://github.com/aws-samples/build-and-deploy-docker-images-to-aws-using-ec2-image-builder
        const dummyComponent = new imagebuilder.CfnComponent(this, 'DummyComponent', {
            name: 'DummyComponent',
            platform: 'Linux',
            version: '0.0.1',
            // Properties below are optional
            changeDescription: 'Initial version',
            description: 'Dummy one',
            // From https://github.com/aws-samples/build-and-deploy-docker-images-to-aws-using-ec2-image-builder/blob/main/components/component.yml
            data: `name: 'Component file'
description: 'This is a sample component the different phases of the file.'
schemaVersion: 1.0
phases:
  - name: build
    steps:
      - name: BuildDebug
        action: ExecuteBash
        inputs:
          commands:
            - sudo echo "BuildDebug section"

  - name: validate
    steps:
      - name: ValidateDebug
        action: ExecuteBash
        inputs:
          commands:
            - sudo echo "ValidateDebug section"

  - name: test
    steps:
      - name: TestDebug
        action: ExecuteBash
        inputs:
          commands:
            - sudo echo "TestDebug section"
`
            // uri: 'uri', // Or data
        });

        const containerRecipeOpen5gsWebUIArm64 = new imagebuilder.CfnContainerRecipe(this, 'ContainerRecipeOpen5gsWebUI', {
            components: [{
                componentArn: dummyComponent.attrArn,
                //componentArn: 'arn:aws:imagebuilder:'+cdk.Stack.of(this).region+':aws:component/update-linux/x.x.x'
            }],
            containerType: 'DOCKER',
            name: 'open5gsWebUI',
            parentImage: 'arm64v8/alpine', // 'arm64v8/amazonlinux:2023', // amazonlinux:latest
            platformOverride: 'Linux',
            instanceConfiguration: { // aws ssm get-parameter --name "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
                image: ssm.StringParameter.valueForStringParameter(this,"/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id")
            },
            targetRepository: {
                repositoryName: open5gsRepository.repositoryName,
                service: 'ECR',
            },
            version: '0.1.5',
            // Properties below are optional
            description: 'Build Open5gs WebUI',
            dockerfileTemplateUri: `s3://${ buildBucketString }/dockerFiles/al2023/Open5gsWebUI/Dockerfile`, // Will be checked for existence
            //workingDirectory: 'workingDirectory',
        });

        const distributionConfigurationCoreRanArm64 = this.createDistributionConfiguration(namePrefix, cdk.Stack.of(this).region, name);
        const containerDistributionConfigurationCoreRanArm64 = this.createContainerDistributionConfiguration(open5gsRepository, cdk.Stack.of(this).region, name);
        const imageTestsConfigurationProperty: imagebuilder.CfnImagePipeline.ImageTestsConfigurationProperty = {
            imageTestsEnabled: false,
            timeoutMinutes: 60, // 60 is the minimum
        };  
        
        const cfnImagePipelineAL2023Arm64 = new imagebuilder.CfnImagePipeline(this, 'ImagePipelineAL2023Arm64', {
            name: 'CoreRanArm64',
            description: 'Core and RAN AL2023-based AMI for Arm64',
            infrastructureConfigurationArn: infrastructureConfigurationArm64.attrArn,
            imageRecipeArn: imageRecipeCoreRanArm64.attrArn,
            distributionConfigurationArn: distributionConfigurationCoreRanArm64.attrArn,
            status: 'ENABLED',
            enhancedImageMetadataEnabled: false,  // False needed if using PVE reporting, see https://docs.aws.amazon.com/imagebuilder/latest/userguide/troubleshooting.html#ts-ssm-mult-inventory
            imageTestsConfiguration: imageTestsConfigurationProperty
        });

        const cfnOpen5gsWebUIContainerPipeline = new imagebuilder.CfnImagePipeline(this, 'Open5gsWebUIPipeline', {
            name: 'Open5gs web UI container image',
            description: 'Produces a Docker image with the Open5gs web UI',
            containerRecipeArn: containerRecipeOpen5gsWebUIArm64.attrArn,
            infrastructureConfigurationArn: containerInfrastructureConfigurationArm64.attrArn,
            distributionConfigurationArn: containerDistributionConfigurationCoreRanArm64.attrArn,
            imageTestsConfiguration: imageTestsConfigurationProperty,
            status: 'ENABLED',
        });

        // Lambda to store the latest AMI in parameter store
        this.latestAmiIdPrefix = '/'+applicationName+'/AMI/ID/Latest/';
        const latestArm64AmiId = new ssm.StringParameter(this, 'latestArm64AmiId', {
            description: 'Latest AMI ID for Arm64',
            parameterName: this.latestAmiIdPrefix+'Arm64',
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: 'n/a', // This is a dummy value, will be filled in by the lambda below
        });
        const functionRecordArmAmiId = new lambda.Function(this, 'recordArmAmiId', {
            description: 'Copy AMI ID',
            retryAttempts: 2,
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            architecture: lambda.Architecture.ARM_64,
            code: lambda.Code.fromAsset('lambda/'),
            handler: 'record_ami_id.main',
            runtime: lambda.Runtime.PYTHON_3_11,
            environment: {
                region: cdk.Stack.of(this).region,
                topic_arm64: notificationTopicArm64.topicName,
                parameter_path_arm64: latestArm64AmiId.parameterName,
                // For x86, simply add topic_x86 and parameter_path_x86
            },
        });
        notificationTopicArm64.addSubscription(new subscription.LambdaSubscription(functionRecordArmAmiId));
        latestArm64AmiId.grantRead(functionRecordArmAmiId);
        latestArm64AmiId.grantWrite(functionRecordArmAmiId);
        NagSuppressions.addResourceSuppressions(functionRecordArmAmiId, [
            { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policy because this is the default CDK setting' },
        ],true);

        // Lambda to store the latest ECR images URI in parameter store
        this.latestOpen5gsWebUiUriPrefix = '/'+applicationName+'/ECR/Open5gs/WebUI/URI/Latest/';
        const latestArm64Open5gsWebUiUri = new ssm.StringParameter(this, 'LatestArm64Open5gsWebUiUri', {
            description: 'Latest Open5gs Web UI ECR URI for Arm64',
            parameterName: this.latestOpen5gsWebUiUriPrefix+'Arm64',
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: 'n/a', // This is a dummy value, will be filled in by the lambda below
        });

        const functionRecordContainerUriOpen5gsWebUI = new lambda.Function(this, 'recordContainerUriOpen5gsWebUI', {
            description: 'Copy latest container ECR URI for Open5gs WebUI',
            retryAttempts: 2,
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            architecture: lambda.Architecture.ARM_64,
            code: lambda.Code.fromAsset('lambda/'),
            handler: 'record_container_uri.main',
            runtime: lambda.Runtime.PYTHON_3_11,
            environment: {
                region: cdk.Stack.of(this).region,
                topic_arm64: notificationTopicContainersArm64.topicName,
                parameter_path_arm64: latestArm64Open5gsWebUiUri.parameterName,
            },
        });
        notificationTopicContainersArm64.addSubscription(new subscription.LambdaSubscription(functionRecordContainerUriOpen5gsWebUI));
        latestArm64Open5gsWebUiUri.grantRead(functionRecordContainerUriOpen5gsWebUI);
        latestArm64Open5gsWebUiUri.grantWrite(functionRecordContainerUriOpen5gsWebUI);
        NagSuppressions.addResourceSuppressions(functionRecordContainerUriOpen5gsWebUI, [
            { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policy because this is the default CDK setting' },
        ],true);
        // Outputs
        //
        // Get it via:
        // aws cloudformation list-exports | jq -r '[ .Exports[] | select( .Name | contains("latest")) ][].Value'
        new cdk.CfnOutput(this, 'LatestArm64AmiIdOutput', {
            value: latestArm64AmiId.parameterName,
            description: 'The path of the parameter holding the latest ID of the arm64 ID',
            exportName: 'latestArm64AmiId',
        });
    }
}
