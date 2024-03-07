// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as r53 from 'aws-cdk-lib/aws-route53'
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';


interface ArpfEnclaveShardsStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    coreVpc: ec2.Vpc;
    hostedZone: r53.PrivateHostedZone;
    enclaveHostRole: iam.Role;
    arpfEnclaveamiIdArm64ParameterPath: string;
    configurationBucketNameParameterPath: string;
    enclaveMaterialBucketNameParameterPath: string;
    securityGroupSubscriberManagement: ec2.SecurityGroup;
    enclavesCapacity?: number;
}

export class ArpfEnclaveShardsStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: ArpfEnclaveShardsStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const enclaveAmiArm64 = ec2.MachineImage.fromSsmParameter(props.arpfEnclaveamiIdArm64ParameterPath);
        const enclavesCapacity = props.enclavesCapacity ?? 2;
        const securityGroupSubscriberManagement = props.securityGroupSubscriberManagement;

        const enclaveHostRole = props.enclaveHostRole;

        const enclaveInstanceType = ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE);
        
        const hostedZone = props.hostedZone;
        const configurationBucketName = ssm.StringParameter.valueForStringParameter(
            this, props.configurationBucketNameParameterPath); 
        const enclaveMaterialBucketName = ssm.StringParameter.valueForStringParameter(
            this, props.enclaveMaterialBucketNameParameterPath); 

        const ebsRootVolume8GB = ec2.BlockDeviceVolume.ebs(8, {
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
            // new iam.PolicyStatement({
            //     effect: iam.Effect.ALLOW,
            //     resources: ['arn:aws:rds:'+cdk.Stack.of(this).region+':'+cdk.Stack.of(this).account+':cluster:*'],
            //     actions: ['rds:DescribeDBClusters'],
            // }),
        });

        const enclaveHostPolicy = new iam.Policy(this, 'enclaveHostPolicy', {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    resources: ['*'],
                    actions: ['s3:ListAllMyBuckets',
                              'kms:ListKeys',
                              'kms:ListAliases'],
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    resources: ['arn:aws:s3:::'+enclaveMaterialBucketName],
                    actions: ['s3:ListBucket'],
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    //resources: [bucket.bucketArn+'/devel/*',cryptoBucket.bucketArn+'/enclaves/*',cryptoBucket.bucketArn+'/subscriber_data/*'],
                    resources: ['arn:aws:s3:::'+enclaveMaterialBucketName+'/*',
                                'arn:aws:s3:::'+enclaveMaterialBucketName+'/enclaves/*',
                                'arn:aws:s3:::'+enclaveMaterialBucketName+'/subscriber_data/*'],
                    actions: ['s3:GetObject'],
                }),
            ]
        });
        // Role created earlier
        enclaveHostRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        enclaveHostRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
        enclaveHostRole.attachInlinePolicy(cloudWatchAgentPutLogsRetention);
        enclaveHostRole.attachInlinePolicy(s3ReadConfigurationBucketPolicy);
        enclaveHostRole.attachInlinePolicy(enclaveHostPolicy);

        const securityGroupArpfEnclaveShards = new ec2.SecurityGroup(this, 'SecurityGroupArpfEnclaveShards', {
            vpc: props.coreVpc,
            description: 'Enclave ARPF security group',
            allowAllOutbound: true
        });

        const arpfEnclaveShardsTemplate = new ec2.LaunchTemplate(this, 'ArpfEnclaveShardsLaunchTemplate', {
            machineImage: enclaveAmiArm64,
            role: enclaveHostRole,
            blockDevices: [{
                deviceName: '/dev/xvda',
                volume: ebsRootVolume8GB
            }],
            securityGroup: securityGroupArpfEnclaveShards,
            instanceType: enclaveInstanceType,
            nitroEnclaveEnabled: true,
            detailedMonitoring: true,
            requireImdsv2: true,
            httpPutResponseHopLimit: 1,
            instanceMetadataTags: true
        });

        const asgArpfEnclaveShardsTarget0 = new autoscaling.AutoScalingGroup(this, 'AsgArpfEnclaveShardsTarget0', {
            vpc: props.coreVpc,
            vpcSubnets: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneArpf' }),
            launchTemplate: arpfEnclaveShardsTemplate,
            minCapacity: enclavesCapacity,
            healthCheck: autoscaling.HealthCheck.elb({
                grace: cdk.Duration.minutes(12),
            })
        });
        NagSuppressions.addResourceSuppressions(asgArpfEnclaveShardsTarget0, [
            { id: 'AwsSolutions-AS3', reason: 'Scaling events notifications disabled for simplicity reason. This code is for a blog post' },
        ]);
        cdk.Tags.of(asgArpfEnclaveShardsTarget0).add('Name', 'ArpfEnclaveShard');
        cdk.Tags.of(asgArpfEnclaveShardsTarget0).add('HostName', 'shard');
        cdk.Tags.of(asgArpfEnclaveShardsTarget0).add('Deployment', applicationName);
        cdk.Tags.of(asgArpfEnclaveShardsTarget0).add('Association', 'core');

        const asgArpfEnclaveShardsTarget1 = new autoscaling.AutoScalingGroup(this, 'AsgArpfEnclaveShardsTarget1', {
            vpc: props.coreVpc,
            vpcSubnets: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneArpf' }),
            launchTemplate: arpfEnclaveShardsTemplate,
            minCapacity: enclavesCapacity,
            healthCheck: autoscaling.HealthCheck.elb({
                grace: cdk.Duration.minutes(12),
            })
        });
        NagSuppressions.addResourceSuppressions(asgArpfEnclaveShardsTarget1, [
            { id: 'AwsSolutions-AS3', reason: 'Scaling events notifications disabled for simplicity reason. This code is for a blog post' },
        ]);
        cdk.Tags.of(asgArpfEnclaveShardsTarget1).add('Name', 'ArpfEnclaveShard');
        cdk.Tags.of(asgArpfEnclaveShardsTarget1).add('HostName', 'shard');
        cdk.Tags.of(asgArpfEnclaveShardsTarget1).add('Deployment', applicationName);
        cdk.Tags.of(asgArpfEnclaveShardsTarget1).add('Association', 'core');
        
        // ALB tied to ASG for ARPF
        //
        // From the UDM host: curl shards.local:8080/status
        const enclaveAlb = new elbv2.ApplicationLoadBalancer(this, 'ShardsAlbA', {
            vpc: props.coreVpc,
            internetFacing: false,
            securityGroup: securityGroupArpfEnclaveShards,
            vpcSubnets: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneArpf' }),
        });
        NagSuppressions.addResourceSuppressions(enclaveAlb, [
            { id: 'AwsSolutions-ELB2', reason: 'Access logs disabled for simplicity reason. This code is for a blog post' },
        ]);
        const atg0 = new elbv2.ApplicationTargetGroup(this, 'ShardFleetTarget0', {
            port: 8080,
            vpc: props.coreVpc,
            targets: [asgArpfEnclaveShardsTarget0],
            healthCheck: {
                enabled: true,
                healthyHttpCodes: '200',
                path: '/status'
            }
        });
        const atg1 = new elbv2.ApplicationTargetGroup(this, 'ShardFleetTarget1', {
            port: 8080,
            vpc: props.coreVpc,
            targets: [asgArpfEnclaveShardsTarget1],
            healthCheck: {
                enabled: true,
                healthyHttpCodes: '200',
                path: '/status'
            }
        });
        const listener = enclaveAlb.addListener('AlbListener', {
            port: 8080,
            protocol: elbv2.ApplicationProtocol.HTTP,
            //defaultTargetGroups: [atg0,atg1],
            // 'open: true' is the default, you can leave it out if you want. Set it
            // to 'false' and use `listener.connections` if you want to be selective
            // about who can access the load balancer.
            open: false,
        });
        // The first shard is to split the size of the data-set
        // The second is to implement a form of suffle sharding
        listener.addAction('ToShard0', {
            action: elbv2.ListenerAction.forward([atg0]),
            conditions: [
                elbv2.ListenerCondition.pathPatterns(['/shard0','/shard0/*']),
            ],
            priority: 10,
        });
        listener.addAction('ToShard1', {
            action: elbv2.ListenerAction.forward([atg1]),
            conditions: [
                elbv2.ListenerCondition.pathPatterns(['/shard1','/shard1/*']),
            ],
            priority: 11,
        });
        listener.addAction('Default', {
            action: elbv2.ListenerAction.forward([atg0,atg1])
        });
        // listener.addTargetGroups('shard0', {
        //     targetGroups: [atg0],
        //     conditions: [elbv2.ListenerCondition.pathPatterns(['/shard0', '/shard0/*'])],
        //     priority: 123,
        // });
        // listener.addTargetGroups('shard1', {
        //     targetGroups: [atg1],
        //     conditions: [elbv2.ListenerCondition.pathPatterns(['/shard1', '/shard1/*'])],
        //     priority: 124,
        // });

        // ALB access
        listener.connections.allowFrom(securityGroupSubscriberManagement, ec2.Port.tcp(8080), 'Allow connections from UDM host');


        new r53.CnameRecord(this, 'AlbCnameRecord', {
            zone: hostedZone,
            recordName: 'alb.'+hostedZone.zoneName,
            domainName: enclaveAlb.loadBalancerDnsName
        });
        new r53.ARecord(this, 'ArpfShardsARecord', {
            zone: hostedZone,
            recordName: 'shards.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromAlias(new LoadBalancerTarget(enclaveAlb))
        });
    }
}
