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

interface CoreRanStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    ranVpc: ec2.Vpc;
    coreVpc: ec2.Vpc;
    hostedZone: r53.PrivateHostedZone;
    amiIdArm64ParameterPath: string;
    instanceRole: iam.Role;
    enclaveHostRole: iam.Role;
    arpfEnclaveamiIdArm64ParameterPath: string;
    configurationBucketNameParameterPath: string;
    enclaveMaterialBucketNameParameterPath: string;
    enclavesCapacity?: number;
    azNumber?: number;
}

export class CoreRanStack extends cdk.Stack {
    public readonly securityGroupSubscriberManagement: ec2.SecurityGroup;

    constructor(scope: Construct, id: string, props: CoreRanStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const amiArm64 = ec2.MachineImage.fromSsmParameter(props.amiIdArm64ParameterPath);
        const enclaveAmiArm64 = ec2.MachineImage.fromSsmParameter(props.arpfEnclaveamiIdArm64ParameterPath);
        const enclavesCapacity = props.enclavesCapacity ?? 3;
        const azNumber = props.azNumber ?? 1;

        const instanceRole = props.instanceRole;
        const enclaveHostRole = props.enclaveHostRole;

        const ranInstanceType = ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.XLARGE);
        const userPlaneInstanceType = ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.XLARGE);
        const controlPlaneInstanceType = ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.LARGE);
        const enclaveInstanceType = ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE);
        
        const hostedZone = props.hostedZone;
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
        // Both ran and core have the same role, can be split if needed
        //
        // Role created earlier
        instanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        instanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
        instanceRole.attachInlinePolicy(cloudWatchAgentPutLogsRetention);
        instanceRole.attachInlinePolicy(s3ReadConfigurationBucketPolicy);
        // Role created earlier
        enclaveHostRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        enclaveHostRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
        enclaveHostRole.attachInlinePolicy(cloudWatchAgentPutLogsRetention);
        enclaveHostRole.attachInlinePolicy(s3ReadConfigurationBucketPolicy);
        enclaveHostRole.attachInlinePolicy(enclaveHostPolicy);

        // Launch template
        const coreRanTemplate = new ec2.LaunchTemplate(this, 'CoreRanLaunchTemplate', {
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
        const securityGroupRan = new ec2.SecurityGroup(this, 'SecurityGroupRan', {
            vpc: props.ranVpc,
            description: 'RAN security group',
            allowAllOutbound: true
        });

        // Dropping to L2 construct in order to use the Launch Template
        //
        const ec2Ran = new ec2.CfnInstance(this, 'RanInstance', {
            // iamInstanceProfile: coreInstanceProfile.ref, // If dedicated role is needed
            instanceType: ranInstanceType.toString(),
            securityGroupIds: [securityGroupRan.securityGroupId],
            subnetId: props.ranVpc.selectSubnets({ subnetGroupName: 'RAN' }).subnetIds[azNumber],
            tags: [{
                key: 'Name',
                value: 'RAN',
            }],
            launchTemplate: {
                version: coreRanTemplate.latestVersionNumber,
                launchTemplateId: coreRanTemplate.launchTemplateId
            }
        });
        NagSuppressions.addResourceSuppressions(ec2Ran, [
            { id: 'AwsSolutions-EC28', reason: 'No detailed monitoring needed' },
            { id: 'AwsSolutions-EC29', reason: 'No need to use an ASG for this scenario. And the instance can be terminated' },
        ]);
        cdk.Tags.of(ec2Ran).add('HostName', 'ran');
        cdk.Tags.of(ec2Ran).add('Deployment', applicationName);
        cdk.Tags.of(ec2Ran).add('Association', 'ran');

        // Core Host(s)
        const securityGroupUserPlane = new ec2.SecurityGroup(this, 'SecurityGroupUserPlane', {
            vpc: props.coreVpc,
            description: 'User plane security group',
            allowAllOutbound: true
        });
        const securityGroupCore = new ec2.SecurityGroup(this, 'SecurityGroupCore', {
            vpc: props.coreVpc,
            description: 'Core security group',
            allowAllOutbound: true
        });
        this.securityGroupSubscriberManagement = new ec2.SecurityGroup(this, 'SecurityGroupUdm', {
            vpc: props.coreVpc,
            description: 'UDM security group (along with UDR and AUSF)',
            allowAllOutbound: true
        });

        const ec2User = new ec2.CfnInstance(this, 'UserPlaneInstance', {
            instanceType: userPlaneInstanceType.toString(),
            securityGroupIds: [securityGroupUserPlane.securityGroupId],
            subnetId: props.coreVpc.selectSubnets({ subnetGroupName: 'UserPlane' }).subnetIds[azNumber],
            sourceDestCheck: false, // NAT offloaded to AWS NAT Gateway
            tags: [{
                key: 'Name',
                value: 'UPF',
            }],
            launchTemplate: {
                version: coreRanTemplate.latestVersionNumber,
                launchTemplateId: coreRanTemplate.launchTemplateId
            }
        });
        NagSuppressions.addResourceSuppressions(ec2User, [
            { id: 'AwsSolutions-EC28', reason: 'No detailed monitoring needed' },
            { id: 'AwsSolutions-EC29', reason: 'No need to use an ASG for this scenario. And the instance can be terminated' },
        ]);
        cdk.Tags.of(ec2User).add('HostName', 'upf');
        cdk.Tags.of(ec2User).add('Deployment', applicationName);
        cdk.Tags.of(ec2User).add('Association', 'core');
        cdk.Tags.of(ec2User).add('CloudWatchAgentConfigurationName', 'open5gs');


        const ec2ControlNrf = new ec2.CfnInstance(this, 'ControlPlaneNrfInstance', {
            instanceType: controlPlaneInstanceType.toString(),
            securityGroupIds: [securityGroupCore.securityGroupId],
            subnetId: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlane' }).subnetIds[azNumber],
            tags: [{
                key: 'Name',
                value: 'ControlPlaneNrf',
            }],
            launchTemplate: {
                version: coreRanTemplate.latestVersionNumber,
                launchTemplateId: coreRanTemplate.launchTemplateId
            }
        });
        NagSuppressions.addResourceSuppressions(ec2ControlNrf, [
            { id: 'AwsSolutions-EC28', reason: 'No detailed monitoring needed' },
            { id: 'AwsSolutions-EC29', reason: 'No need to use an ASG for this scenario. And the instance can be terminated' },
        ]);
        cdk.Tags.of(ec2ControlNrf).add('HostName', 'nrf');
        cdk.Tags.of(ec2ControlNrf).add('Deployment', applicationName);
        cdk.Tags.of(ec2ControlNrf).add('Association', 'core');
        cdk.Tags.of(ec2ControlNrf).add('CloudWatchAgentConfigurationName', 'open5gs');

        const ec2ControlAmf = new ec2.CfnInstance(this, 'ControlPlaneAmfInstance', {
            instanceType: controlPlaneInstanceType.toString(),
            securityGroupIds: [securityGroupCore.securityGroupId],
            subnetId: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlane' }).subnetIds[azNumber],
            tags: [{
                key: 'Name',
                value: 'ControlPlaneAmf',
            }],
            launchTemplate: {
                version: coreRanTemplate.latestVersionNumber,
                launchTemplateId: coreRanTemplate.launchTemplateId
            }
        });
        NagSuppressions.addResourceSuppressions(ec2ControlAmf, [
            { id: 'AwsSolutions-EC28', reason: 'No detailed monitoring needed' },
            { id: 'AwsSolutions-EC29', reason: 'No need to use an ASG for this scenario. And the instance can be terminated' },
        ]);
        cdk.Tags.of(ec2ControlAmf).add('HostName', 'amf');
        cdk.Tags.of(ec2ControlAmf).add('Deployment', applicationName);
        cdk.Tags.of(ec2ControlAmf).add('Association', 'core');
        cdk.Tags.of(ec2ControlAmf).add('CloudWatchAgentConfigurationName', 'open5gs');

        const ec2SubscriberManagement = new ec2.CfnInstance(this, 'SubsriberManagementInstance', {
            instanceType: controlPlaneInstanceType.toString(),
            securityGroupIds: [this.securityGroupSubscriberManagement.securityGroupId],
            subnetId: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneSubscriberManagement' }).subnetIds[azNumber],
            tags: [{
                key: 'Name',
                value: 'SubscriberManagement',
            }],
            launchTemplate: {
                version: coreRanTemplate.latestVersionNumber,
                launchTemplateId: coreRanTemplate.launchTemplateId
            }
        });
        NagSuppressions.addResourceSuppressions(ec2SubscriberManagement, [
            { id: 'AwsSolutions-EC28', reason: 'No detailed monitoring needed' },
            { id: 'AwsSolutions-EC29', reason: 'No need to use an ASG for this scenario. And the instance can be terminated' },
        ]);
        cdk.Tags.of(ec2SubscriberManagement).add('HostName', 'udm');
        cdk.Tags.of(ec2SubscriberManagement).add('Deployment', applicationName);
        cdk.Tags.of(ec2SubscriberManagement).add('Association', 'core');
        cdk.Tags.of(ec2SubscriberManagement).add('CloudWatchAgentConfigurationName', 'open5gs');


        const securityGroupEnclaveArpf = new ec2.SecurityGroup(this, 'SecurityGroupEnclaveArpf', {
            vpc: props.coreVpc,
            description: 'Enclave ARPF security group',
            allowAllOutbound: true
        });

        const arpfTemplate = new ec2.LaunchTemplate(this, 'ArpfLaunchTemplate', {
            machineImage: enclaveAmiArm64,
            role: enclaveHostRole,
            blockDevices: [{
                deviceName: '/dev/xvda',
                volume: ebsRootVolume16GB
            }],
            securityGroup: securityGroupEnclaveArpf,
            instanceType: enclaveInstanceType,
            nitroEnclaveEnabled: true,
            detailedMonitoring: true,
            requireImdsv2: true,
            httpPutResponseHopLimit: 1,
            instanceMetadataTags: true
        });

        const asgArpf = new autoscaling.AutoScalingGroup(this, 'ASG', {
            vpc: props.coreVpc,
            vpcSubnets: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneArpf' }),
            launchTemplate: arpfTemplate,
            minCapacity: enclavesCapacity,
            healthCheck: autoscaling.HealthCheck.elb({
                grace: cdk.Duration.minutes(12),
            })
        });
        NagSuppressions.addResourceSuppressions(asgArpf, [
            { id: 'AwsSolutions-AS3', reason: 'Scaling events notifications disabled for simplicity reason. This code is for a blog post' },
        ]);
        cdk.Tags.of(asgArpf).add('Name', 'ArpfEnclave');
        cdk.Tags.of(asgArpf).add('HostName', 'arpf');
        cdk.Tags.of(asgArpf).add('Deployment', applicationName);
        cdk.Tags.of(asgArpf).add('Association', 'core');
        cdk.Tags.of(asgArpf).add('CloudWatchAgentConfigurationName', 'open5gs');

        // NLB tied to ASG for ARPF
        //
        // On the enclave hosts, make sure to load the enclave and then expose the port via proxy, e.g. socat tcp-listen:8012,fork,bind=0.0.0.0 vsock-connect:12:8888
        // Can check connectivity from the UDM host via echo -n '{ "command":"echo" }' | socat - tcp-connect:arpf.local:8012 or echo -n '{ "command":"echo" }' | socat - tcp-connect:lb.local:8012
        const enclaveNlb = new elbv2.NetworkLoadBalancer(this, 'EnclaveNLB', {
            vpc: props.coreVpc,
            internetFacing: false,
            vpcSubnets: props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneArpf' }),
        });
        NagSuppressions.addResourceSuppressions(enclaveNlb, [
            { id: 'AwsSolutions-ELB2', reason: 'Access logs disabled for simplicity reason. This code is for a blog post' },
        ]);
        const enclaveNlbListener8012 = enclaveNlb.addListener('arpfNlbListener8012', {
            port: 8012,
            protocol: elbv2.Protocol.TCP
        });
        enclaveNlbListener8012.addTargets('arpfEnclaves', {
            port: 8012,
            targets: [asgArpf],
            healthCheck: {
                port: '8080',
                healthyHttpCodes: '200',
                path: '/test', // /test is for deep health-check (using test-av on the ARPF enclave. /status just probes the ARPF enclave via ping command)
                protocol: elbv2.Protocol.HTTP
            }
        });

        // Section: Security groups
        //
        securityGroupRan.connections.allowFrom(securityGroupRan, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupRan.connections.allowFrom(securityGroupCore, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupRan.connections.allowFrom(securityGroupUserPlane, ec2.Port.icmpPing(), 'Allow ICMP echo request');

        securityGroupUserPlane.connections.allowFrom(securityGroupUserPlane, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupUserPlane.connections.allowFrom(securityGroupRan, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupUserPlane.connections.allowFrom(securityGroupCore, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupUserPlane.connections.allowFrom(securityGroupCore,ec2.Port.udp(8805),'Allow PFCP 8805');
        // N3 UDP 2152
        securityGroupUserPlane.connections.allowFrom(securityGroupRan,ec2.Port.udp(2152),'Allow UDP 2152');        

        securityGroupCore.connections.allowFrom(securityGroupCore, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupCore.connections.allowFrom(securityGroupRan, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupCore.connections.allowFrom(securityGroupUserPlane, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupCore.connections.allowFrom(this.securityGroupSubscriberManagement, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupCore.connections.allowFrom(securityGroupEnclaveArpf, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        securityGroupCore.connections.allowFrom(securityGroupRan, ec2.Port.tcp(25001), 'Allow iperf on port 25001');
        new ec2.CfnSecurityGroupIngress(this, 'CustomSCTPSecurityGroupIngress', {
            ipProtocol: '132', // SCTP
            description: 'SCTP to AMF on port 38412',
            groupId: securityGroupCore.securityGroupId,
            sourceSecurityGroupId: securityGroupRan.securityGroupId,
            fromPort: 38412,
            toPort: 38412,
        });
        // PFCP 8805 and 2152 for N4
        securityGroupCore.connections.allowFrom(securityGroupCore,ec2.Port.udp(8805),'Allow PFCP 8805');

        // SBI: 7777 (SCP), // 7778 (SMF), 7779 (AMF), 7780 (PCF), 7781 (BSF), 8777 (UDR), 8778 (UDM), 8779 (AUSF)
        securityGroupCore.connections.allowFrom(securityGroupCore,ec2.Port.tcp(7777), 'SBI 7777 (SCP)');
        securityGroupCore.connections.allowFrom(this.securityGroupSubscriberManagement,ec2.Port.tcp(7777), 'SBI 7777 (SCP)');

        securityGroupCore.connections.allowFrom(securityGroupCore,ec2.Port.tcp(7778), 'SBI 7778 (SMF)');
        securityGroupCore.connections.allowFrom(this.securityGroupSubscriberManagement,ec2.Port.tcp(7778), 'SBI 7778 (SMF)');

        securityGroupCore.connections.allowFrom(securityGroupCore,ec2.Port.tcp(7779), 'SBI 7779 (AMF)');
        securityGroupCore.connections.allowFrom(this.securityGroupSubscriberManagement,ec2.Port.tcp(7779), 'SBI 7779 (AMF)');

        securityGroupCore.connections.allowFrom(securityGroupCore,ec2.Port.tcp(7780), 'SBI 7780 (PCF)');
        securityGroupCore.connections.allowFrom(securityGroupCore,ec2.Port.tcp(7781), 'SBI 7781 (BSF)');


        this.securityGroupSubscriberManagement.connections.allowFrom(securityGroupCore, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        this.securityGroupSubscriberManagement.connections.allowFrom(this.securityGroupSubscriberManagement, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        this.securityGroupSubscriberManagement.connections.allowFrom(securityGroupEnclaveArpf, ec2.Port.icmpPing(), 'Allow ICMP echo request');
        this.securityGroupSubscriberManagement.connections.allowFrom(securityGroupCore,ec2.Port.tcp(8777),'SBI 8777 (UDR)');
        this.securityGroupSubscriberManagement.connections.allowFrom(securityGroupCore,ec2.Port.tcp(8778),'SBI 8778 (UDM)');
        this.securityGroupSubscriberManagement.connections.allowFrom(securityGroupCore,ec2.Port.tcp(8779),'SBI 8779 (AUSF)');
        // mongodb
        this.securityGroupSubscriberManagement.connections.allowFrom(securityGroupCore,ec2.Port.tcp(27017),'Allow mongodb 27017');

        // ARPF Enclave
        securityGroupEnclaveArpf.connections.allowFrom(securityGroupEnclaveArpf, ec2.Port.icmpPing(), 'Allow ICMP echo request from Enclaves security group');
        securityGroupEnclaveArpf.connections.allowFrom(this.securityGroupSubscriberManagement, ec2.Port.icmpPing(), 'Allow ICMP echo request from UDM security group');
        securityGroupEnclaveArpf.connections.allowFrom(securityGroupEnclaveArpf, ec2.Port.tcp(8012), 'Allow connections to ARPF enclave');
        securityGroupEnclaveArpf.connections.allowFrom(this.securityGroupSubscriberManagement, ec2.Port.tcp(8012), 'Allow connections to ARPF enclave');
        // For the load balancer
        const coreArpfSubnetSelection = props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneArpf' }); // For the health-check
        for (const subnet of coreArpfSubnetSelection.subnets) {
            securityGroupEnclaveArpf.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(8012), 'Allow connections to ARPF enclave for NLB health-check');
            securityGroupEnclaveArpf.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(8080), 'Allow connections to ARPF enclave for NLB health-check');
        }
        const coreUdmSubnetSelection = props.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlaneSubscriberManagement' });
        for (const subnet of coreUdmSubnetSelection.subnets) {
            securityGroupEnclaveArpf.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(8012), 'Allow connections to ARPF enclave via NLB from UDM');
        }

        // Add route for UE subnet
        const coreAccessSubnetSelection = props.coreVpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC });
        let index = 0;
        for (const subnet of coreAccessSubnetSelection.subnets) {
            new ec2.CfnRoute(this, 'coreAccessSubnetUERoute' + index++, {
                routeTableId: subnet.routeTable.routeTableId,
                destinationCidrBlock: '10.45.0.0/16',
                instanceId: ec2User.ref,
            });
        }

        // Section: Route53 DNS
        new r53.ARecord(this, 'ScpARecord', {
            zone: hostedZone,
            recordName: 'scp.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2ControlNrf.attrPrivateIp)
        });
        new r53.ARecord(this, 'UdmARecord', {
            zone: hostedZone,
            recordName: 'udm.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2SubscriberManagement.attrPrivateIp)
        });
        new r53.ARecord(this, 'CoreARecord', {
            zone: hostedZone,
            recordName: 'core.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2ControlAmf.attrPrivateIp)
        });
        new r53.ARecord(this, 'AmfARecord', {
            zone: hostedZone,
            recordName: 'amf.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2ControlAmf.attrPrivateIp)
        });
        new r53.ARecord(this, 'N4ARecord', {
            zone: hostedZone,
            recordName: 'n4.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2ControlAmf.attrPrivateIp)
        });
        new r53.ARecord(this, 'UpfARecord', {
            zone: hostedZone,
            recordName: 'upf.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2User.attrPrivateIp)
        });
        new r53.ARecord(this, 'RanARecord', {
            zone: hostedZone,
            recordName: 'ran.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2Ran.attrPrivateIp)
        });
        new r53.ARecord(this, 'GnbARecord', {
            zone: hostedZone,
            recordName: 'gnb.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses(ec2Ran.attrPrivateIp)
        });
        new r53.ARecord(this, 'N60ARecord', {
            zone: hostedZone,
            recordName: 'n6.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromIpAddresses("10.45.0.1")
        });
        new r53.CnameRecord(this, 'NlbCnameRecord', {
            zone: hostedZone,
            recordName: 'lb.'+hostedZone.zoneName,
            domainName: enclaveNlb.loadBalancerDnsName
        });
        new r53.ARecord(this, 'ArpfARecord', {
            zone: hostedZone,
            recordName: 'arpf.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromAlias(new LoadBalancerTarget(enclaveNlb))
        });
        new r53.AaaaRecord(this, 'ArpfAaaaRecord', {
            zone: hostedZone,
            recordName: 'arpf.'+hostedZone.zoneName,
            target: r53.RecordTarget.fromAlias(new LoadBalancerTarget(enclaveNlb))
        });
    }
}
