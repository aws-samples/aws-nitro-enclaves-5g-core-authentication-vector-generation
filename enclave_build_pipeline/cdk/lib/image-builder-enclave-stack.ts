// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as imagebuilder from 'aws-cdk-lib/aws-imagebuilder';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as topic from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as subscription from 'aws-cdk-lib/aws-sns-subscriptions';
import * as fs from 'fs';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

interface ImageBuilderEnclaveStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    arm64ParentImagePath: string;
    buildBucketNamePath: string;
}


export class ImageBuilderEnclaveStack extends cdk.Stack {
    readonly latestAmiIdPrefix: string;
    readonly arpfPcr0ParameterPath: string;
    readonly enclaveRepositoryUriParameterPath: string

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
                    s3KeyPrefix: 'imagebuilder/logs/enclaves/',
                },
            },
        });
        return cfnInfrastructureConfiguration;
    }

    createContainerDistributionConfiguration(repository: ecr.Repository, region: string, tag: string, nameSuffix: string): imagebuilder.CfnDistributionConfiguration {
        const containerDistributionConfiguration = new imagebuilder.CfnDistributionConfiguration(this, 'ContainerDistributionConfiguration'+nameSuffix, {
            distributions: [{
                region: region,
                containerDistributionConfiguration: { // Achtung!!! Had to put Capital on the first letter because this is otherwise failing the CFN check
                    TargetRepository: {
                        RepositoryName: repository.repositoryName,
                        Service: 'ECR',
                    },
                    ContainerTags: [ tag ]
                },
            }],
            name: 'Containers'+nameSuffix,
        });
        return containerDistributionConfiguration;
    }

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

    constructor(scope: Construct, id: string, props: ImageBuilderEnclaveStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const arm64ParentImage = ec2.MachineImage.fromSsmParameter(props.arm64ParentImagePath);

        const buildBucketString = ssm.StringParameter.fromStringParameterName(
                this, 'BuildBucketString', props.buildBucketNamePath).stringValue
        
        // Add tags to all constructs in the stack
        cdk.Tags.of(this).add('Owner', owner);
        cdk.Tags.of(this).add('CreatedByStack', stackName);
        cdk.Tags.of(this).add('ApplicationName', applicationName);

        // KMS key for SNS topic
        const snsKey = new kms.Key(this,'SnsKey',{
            enableKeyRotation: true,
            pendingWindow: cdk.Duration.days(7),
            alias: 'ImageBuilderEnclaveSnsKey'
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
        // ECR repositories
        const enclaveRepository = new ecr.Repository(this, 'EnclaveRepository', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteImages: true,
            imageTagMutability: ecr.TagMutability.MUTABLE // Needed to use the tagging capability to have the same tag on the SDK
            //imageTagMutability: ecr.TagMutability.IMMUTABLE
        });
        this.enclaveRepositoryUriParameterPath = '/'+applicationName+'/ECR/Enclave/Uri';
        const enclaveRepositoryUriParameter = new ssm.StringParameter(this, 'EnclaveRepositoryUriParameter', {
            description: 'Enclave images repository URI',
            parameterName: this.enclaveRepositoryUriParameterPath,
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: enclaveRepository.repositoryUri,
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
            new iam.Policy(this, 'EcrPushPull', {
                statements: [
                    new iam.PolicyStatement({ 
                        actions: ['ecr:DescribeRepositories',
                                  'ecr:GetAuthorizationToken'],
                        resources: ['*'],
                    }),
                    new iam.PolicyStatement({
                        actions: ['ecr:*'],
                        resources: [enclaveRepository.repositoryArn],
                    }),
                ],
            })
        );
        NagSuppressions.addResourceSuppressions(ec2Role, [
            { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policy because this keeps definition easier. Replace in production setup' },
        ]);

        // Image Builder Deployment
        const arch = 'Arm64';
        const notificationTopicContainersArm64 = new topic.Topic(this,"EnclaveNotificationTopicContainersArm64",{
            topicName: 'EnclaveImageBuilderNotificationsContainersArm64',
            masterKey: snsKey,
        });
        const instanceTypes = ['m6g.xlarge','m6g.large','t4g.large'];


        // See
        // https://aws.amazon.com/blogs/devops/build-and-deploy-docker-images-to-aws-using-ec2-image-builder/
        // and
        // https://github.com/aws-samples/build-and-deploy-docker-images-to-aws-using-ec2-image-builder

        const arpfNitroEnclaveSetupComponentData = fs.readFileSync(path.join('imagebuilder/components/al2/arpfNitroEnclaveSetup.yaml'), 'utf-8');
        const arpfNitroEnclaveSetupComponent = new imagebuilder.CfnComponent(this, 'ArpfNitroEnclaveSetupComponent', {
            name: 'ArpfNitroEnclaveSetupComponent',
            platform: 'Linux',
            version: '0.0.3',
            // Properties below are optional
            changeDescription: 'Initial version',
            description: 'Get files needed to build the ARPF Nitro Enclave docker image',
            data: arpfNitroEnclaveSetupComponentData
            // uri: 'uri', // Or data
        });

        const containerRecipeArpfNitroEnclaveArm64 = new imagebuilder.CfnContainerRecipe(this, 'ContainerRecipeArpfNitroEnclave', {
            components: [
                {
                    componentArn: arpfNitroEnclaveSetupComponent.attrArn, parameters: [
                        {
                            name: 'BuildBucketPathUri',
                            value: [`s3://${ buildBucketString }/dockerFiles/al2/NitroEnclaveArpf/`],
                        },
                        {
                            name: 'DownloadDirectory',
                            value: ['/app/']
                        }
                    ]
                },
            ],
            containerType: 'DOCKER',
            name: 'arpfNitroEnclave',
            parentImage: 'arm64v8/amazonlinux:2',
            platformOverride: 'Linux',
            instanceConfiguration: { // aws ssm get-parameter --name "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
                image: ssm.StringParameter.valueForStringParameter(this,"/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id")
            },
            targetRepository: {
                repositoryName: enclaveRepository.repositoryName,
                service: 'ECR',
            },
            version: '0.0.21',
            // Properties below are optional
            description: 'Build ARPF Nitro Enclave Docker image',
            dockerfileTemplateUri: `s3://${ buildBucketString }/dockerFiles/al2/NitroEnclaveArpf/Dockerfile`, // Will be checked for existence
            workingDirectory: '/tmp', // This sets the original WORKDIR to /tmp
        });

        const containerInfrastructureConfigurationArm64 = this.createInfrastructureConfiguration(cfnInstanceProfile.ref, arch, instanceTypes, notificationTopicContainersArm64.topicArn, buildBucketString, 'EnclaveContainer');
        containerInfrastructureConfigurationArm64.addDependency(cfnInstanceProfile);
        const arpfNitroEnclaveContainerDistributionConfigurationArm64 = this.createContainerDistributionConfiguration(enclaveRepository, cdk.Stack.of(this).region, 'ArpfNitroEnclave', 'ArpfNitroEnclave'+arch);
        const imageTestsConfigurationProperty: imagebuilder.CfnImagePipeline.ImageTestsConfigurationProperty = {
            imageTestsEnabled: false,
            timeoutMinutes: 60, // 60 is the minimum
        };        

        const cfnArpfNitroEnclaveContainerPipeline = new imagebuilder.CfnImagePipeline(this, 'ArpfNitroEnclave', {
            name: 'ArpfNitroEnclave',
            description: 'ARPF image for Nitro Enclave setup',
            containerRecipeArn: containerRecipeArpfNitroEnclaveArm64.attrArn,
            infrastructureConfigurationArn: containerInfrastructureConfigurationArm64.attrArn,
            distributionConfigurationArn: arpfNitroEnclaveContainerDistributionConfigurationArm64.attrArn,
            imageTestsConfiguration: imageTestsConfigurationProperty,
            status: 'ENABLED',
        });

        // AMI with ARPF Enclave already built-in
        const name = 'ArpfNitroEnclave';
        const notificationTopicArm64 = new topic.Topic(this,name+"NotificationTopicArm64",{
            topicName: name+'ImageBuilderNotificationsArm64',
            masterKey: snsKey,
        });
        const namePrefix = name+'-AL2023';
        const infrastructureConfigurationArm64 = this.createInfrastructureConfiguration(cfnInstanceProfile.ref, arch, instanceTypes, notificationTopicArm64.topicArn, buildBucketString, name);
        infrastructureConfigurationArm64.addDependency(cfnInstanceProfile);
        const distributionConfigurationArpfNitroEnclaveArm64 = this.createDistributionConfiguration(namePrefix, cdk.Stack.of(this).region, name);

        const nitroEnclavesComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/enclaves.yaml'), 'utf-8');
        const nitroEnclavesComponentAL2023 = new imagebuilder.CfnComponent(this, 'EnclavesComponentAL2023', {
            name: 'Install Nitro Enclaves packages',
            platform: 'Linux',
            version: '0.0.2',
            changeDescription: 'Initial version',
            description: 'Install Nitro Enclaves packages',
            data: nitroEnclavesComponentAL2023Data
        });
        const installArpfNitroEnclavesComponentAL2023Data = fs.readFileSync(path.join('imagebuilder/components/al2023/install_arpf_enclaves.yaml'), 'utf-8');
        const installArpfNitroEnclavesComponentAL2023 = new imagebuilder.CfnComponent(this, 'InstallArpfEnclavesComponentAL2023', {
            name: 'Install ARPF Nitro Enclaves image',
            platform: 'Linux',
            version: '0.0.17',
            changeDescription: 'Initial version',
            description: 'Install ARPF Nitro Enclaves image',
            data: installArpfNitroEnclavesComponentAL2023Data
        });

        this.arpfPcr0ParameterPath = '/'+applicationName+'/Enclave/Arpf/Pcr/0';
        const arpfPcr0Parameter = new ssm.StringParameter(this, 'ArpfPcr0Parameter', {
            description: 'PCR0 of ARPF Enclave image',
            parameterName: this.arpfPcr0ParameterPath,
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: 'n/a', // Will be replaced in the component
        });
        arpfPcr0Parameter.grantWrite(ec2Role);
        const imageRecipeArpfNitroEnclaveArm64 = new imagebuilder.CfnImageRecipe(this, 'ImageRecipeArpfNitroEnclaveArm64', {
            name: name+'Arm64',
            description: 'Arpf Nitro Enclave Arm64 Image Recipe based on AL2023',
            components: [
                { componentArn: 'arn:aws:imagebuilder:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':component/'+'basic-packages'+'/x.x.x' },
                { componentArn: nitroEnclavesComponentAL2023.attrArn },
                { componentArn: installArpfNitroEnclavesComponentAL2023.attrArn, parameters: [
                    {
                        name: 'pcr0ParameterPath',
                        value: [arpfPcr0Parameter.parameterName],
                    },
                    {
                        name: 'BuildBucketPathUri',
                        value: [`s3://${ buildBucketString }/utils/al2023/NitroEnclaveArpf/`],
                    },
                    {
                        name: 'DOCKER-URI',
                        value: [enclaveRepository.repositoryUri+':'+'ArpfNitroEnclave'],
                    },
                ]},
                { componentArn: 'arn:aws:imagebuilder:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':component/'+'adot-binaries'+'/x.x.x' },
            ],
            parentImage: arm64ParentImage.getImage(this).imageId,
            version: '0.0.21',
            additionalInstanceConfiguration: {
                systemsManagerAgent: {
                    uninstallAfterBuild: false,
                },
            },
        });

        const cfnEnclaveImagePipelineAL2023Arm64 = new imagebuilder.CfnImagePipeline(this, 'EnclaveImagePipelineAL2023Arm64', {
            name: 'ArpfNitroEnclaveArm64',
            description: 'ARPF Nitro Enclave AL2023-based AMI for Arm64',
            infrastructureConfigurationArn: infrastructureConfigurationArm64.attrArn,
            imageRecipeArn: imageRecipeArpfNitroEnclaveArm64.attrArn,
            distributionConfigurationArn: distributionConfigurationArpfNitroEnclaveArm64.attrArn,
            status: 'ENABLED',
            enhancedImageMetadataEnabled: false,  // False needed if using PVE reporting, see https://docs.aws.amazon.com/imagebuilder/latest/userguide/troubleshooting.html#ts-ssm-mult-inventory
            imageTestsConfiguration: imageTestsConfigurationProperty
        });

        // Lambda to store the latest AMI in parameter store
        this.latestAmiIdPrefix = '/'+applicationName+'/AMI/ID/Latest/';
        const latestArm64AmiId = new ssm.StringParameter(this, 'latestArpfNitroEnclaveArm64AmiId', {
            description: 'Latest ARPF Nitro Enclave AMI ID for Arm64',
            parameterName: this.latestAmiIdPrefix+'Arm64',
            dataType: ssm.ParameterDataType.TEXT,
            stringValue: 'n/a', // This is a dummy value, will be filled in by the lambda below
        });
        const functionRecordArmAmiId = new lambda.Function(this, 'recordArmArpfNitroEnclaveAmiId', {
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
    }
}
