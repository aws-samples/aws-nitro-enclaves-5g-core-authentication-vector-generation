// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface ManagementStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    managementVpc: ec2.Vpc;
    amiIdArm64ParameterPath: string;
    managementHostRole: iam.Role;
    configurationBucketNameParameterPath: string;
    enclaveMaterialBucketNameParameterPath: string;
    keyArn: string
    azNumber?: number;
}

export class ManagementStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: ManagementStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const amiArm64 = ec2.MachineImage.fromSsmParameter(props.amiIdArm64ParameterPath);
        const azNumber = props.azNumber ?? 1;

        const instanceRole = props.managementHostRole;
        
        const managementInstanceType = ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.LARGE);

        const keyArn = props.keyArn;
        const configurationBucketName = ssm.StringParameter.valueForStringParameter(
            this, props.configurationBucketNameParameterPath);
        const enclaveMaterialBucketName = ssm.StringParameter.valueForStringParameter(
            this, props.enclaveMaterialBucketNameParameterPath);

        const ebsRootVolume16GB = ec2.BlockDeviceVolume.ebs(16, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3
        });
        
        // Add tags to all constructs in the stack
        cdk.Tags.of(this).add('Owner', owner);
        cdk.Tags.of(this).add('CreatedByCdkStack', stackName);
        cdk.Tags.of(this).add('ApplicationName', applicationName);

        const cloudWatchAgentPutLogsRetention = new iam.Policy(this, 'CwaPutLogsRetention', {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['logs:PutRetentionPolicy'],
                    resources: ['*']
                })
            ],
        });
        const s3ReadConfigurationBucketPolicy = new iam.Policy(this, 'S3ReadConfigurationBucket', {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['s3:ListAllMyBuckets'],
                    resources: ['*']
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['s3:ListBucket'],
                    resources: ['arn:aws:s3:::'+configurationBucketName]
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['s3:GetObject'],
                    resources: ['arn:aws:s3:::'+configurationBucketName+'/*']
                }),
            ],
        });
        const managementHostPolicy = new iam.Policy(this, 'managementPolicy', {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['s3:ListAllMyBuckets',
                              'kms:ListKeys',
                              'kms:ListAliases',
                              'kms:ListKeyPolicies',
                             ],
                    resources: ['*'],
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['kms:GetKeyPolicy','kms:PutKeyPolicy','kms:GenerateDataKey'],
                    resources: [keyArn],
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['s3:ListBucket'],
                    resources: ['arn:aws:s3:::'+enclaveMaterialBucketName],
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['s3:GetObject','s3:PutObject'],
                    resources: ['arn:aws:s3:::'+enclaveMaterialBucketName+'/*'],
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['ecr:GetAuthorizationToken',
                              'ecr:BatchGetImage',
                              'ecr:GetDownloadUrlForLayer'],
                    resources: ['*']
                }),
            ]
        });
        // Role created earlier
        instanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        instanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
        instanceRole.attachInlinePolicy(cloudWatchAgentPutLogsRetention);
        instanceRole.attachInlinePolicy(s3ReadConfigurationBucketPolicy);
        instanceRole.attachInlinePolicy(managementHostPolicy);


        // Launch template
        const managementTemplate = new ec2.LaunchTemplate(this, 'ManagementLaunchTemplate', {
            machineImage: amiArm64,
            role: instanceRole,
            blockDevices: [{
                deviceName: '/dev/xvda', // Naming is very peaky here, https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/device_naming.html
                volume: ebsRootVolume16GB
            }],
            detailedMonitoring: false, // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html
            requireImdsv2: true,
            httpPutResponseHopLimit: 1,
            instanceMetadataTags: true
        });

        // RAN Host(s)
        const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
            vpc: props.managementVpc,
            description: 'Management security group',
            allowAllOutbound: true
        });

        // Dropping to L2 construct in order to use the Launch Template
        //
        const ec2Management = new ec2.CfnInstance(this, 'managementInstance', {
            instanceType: managementInstanceType.toString(),
            securityGroupIds: [securityGroup.securityGroupId],
            subnetId: props.managementVpc.selectSubnets({ subnetGroupName: 'Operator' }).subnetIds[azNumber],
            tags: [{
                key: 'Name',
                value: 'Management',
            }],
            launchTemplate: {
                version: managementTemplate.latestVersionNumber,
                launchTemplateId: managementTemplate.launchTemplateId
            }
        });
        NagSuppressions.addResourceSuppressions(ec2Management, [
            { id: 'AwsSolutions-EC28', reason: 'No detailed monitoring needed' },
            { id: 'AwsSolutions-EC29', reason: 'No need to use an ASG for this scenario. And the instance can be terminated' },
        ]);
        cdk.Tags.of(ec2Management).add('HostName', 'management');
        cdk.Tags.of(ec2Management).add('Deployment', applicationName);
        cdk.Tags.of(ec2Management).add('Association', 'management');
    }
}
