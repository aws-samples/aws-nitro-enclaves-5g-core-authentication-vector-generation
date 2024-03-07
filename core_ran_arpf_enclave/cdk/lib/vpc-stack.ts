// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as r53 from 'aws-cdk-lib/aws-route53'
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface VpcStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    ranVpcCidr?: string;
    coreVpcCidr?: string;
    managementVpcCidr?: string;
    natGateways?: number;
}

export class VpcStack extends cdk.Stack {
    public readonly ranVpc: ec2.Vpc;
    public readonly coreVpc: ec2.Vpc;
    public readonly managementVpc: ec2.Vpc;
    public readonly hostedZone: r53.PrivateHostedZone;

    createVpc(natGateways: number, vpcCidr: string, subnetConfiguration: ec2.SubnetConfiguration[], logicalIdPrefix: string): ec2.Vpc {
        const vpc= new ec2.Vpc(this, logicalIdPrefix+'Vpc', {
            natGateways: natGateways, // NAT for UE pool
            maxAzs: 99,
            ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
            subnetConfiguration: subnetConfiguration,
        });
        vpc.addGatewayEndpoint('S3Endpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });
        vpc.addInterfaceEndpoint('SsmEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SSM,
            privateDnsEnabled: true,
            subnets: { subnetGroupName: 'Endpoints' }
        });
        vpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
            privateDnsEnabled: true,
            subnets: { subnetGroupName: 'Endpoints' }
        });
        vpc.addInterfaceEndpoint('Ec2Endpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.EC2,
            privateDnsEnabled: true,
            subnets: { subnetGroupName: 'Endpoints' }
        });
        vpc.addInterfaceEndpoint('Ec2MessagesEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
            privateDnsEnabled: true,
            subnets: { subnetGroupName: 'Endpoints' }
        });
        vpc.addInterfaceEndpoint('KmsEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.KMS,
            privateDnsEnabled: true,
            subnets: { subnetGroupName: 'Endpoints' }
        });
        vpc.addInterfaceEndpoint('LogsEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            privateDnsEnabled: true,
            subnets: { subnetGroupName: 'Endpoints' }
        });
        // STS
        vpc.addInterfaceEndpoint('StsEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.STS,
            privateDnsEnabled: true,
            subnets: { subnetGroupName: 'Endpoints' }
        });
        return vpc;
    }
    
    constructor(scope: Construct, id: string, props: VpcStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;
        const natGateways = props.natGateways || 0;
        const ranVpcCidr = props.ranVpcCidr ?? '10.07.0.0/16';
        const coreVpcCidr = props.coreVpcCidr ?? '10.08.0.0/16';
        const managementVpcCidr = props.managementVpcCidr ?? '10.09.0.0/16';

        // Add tags to all constructs in the stack
        cdk.Tags.of(this).add('Owner', owner);
        cdk.Tags.of(this).add('CreatedByCdkStack', stackName);
        cdk.Tags.of(this).add('ApplicationName', applicationName);

        var ranSubnetConfiguration: ec2.SubnetConfiguration[];
        ranSubnetConfiguration = [
            { cidrMask: 24,
              name: 'Internet',
              subnetType: ec2.SubnetType.PUBLIC },
            { cidrMask: 24,
              name: 'RAN',
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            { cidrMask: 24,
              name: 'Endpoints',
              subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        ];
        var coreSubnetConfiguration: ec2.SubnetConfiguration[];
        coreSubnetConfiguration = [
            { cidrMask: 24,
              name: 'Internet',
              subnetType: ec2.SubnetType.PUBLIC },
            { cidrMask: 24,
              name: 'UserPlane',
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            { cidrMask: 24,
              name: 'ControlPlane',
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            { cidrMask: 24,
              name: 'ControlPlaneSubscriberManagement',
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            { cidrMask: 24,
              name: 'ControlPlaneArpf',
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            { cidrMask: 24,
              name: 'Endpoints',
              subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        ];
        var managementSubnetConfiguration: ec2.SubnetConfiguration[];
        managementSubnetConfiguration = [
            { cidrMask: 24,
              name: 'Operator',
              subnetType: ec2.SubnetType.PUBLIC },
            { cidrMask: 24,
              name: 'Endpoints',
              subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        ];

        this.ranVpc = this.createVpc(natGateways, ranVpcCidr, ranSubnetConfiguration,'Ran');
        this.coreVpc = this.createVpc(natGateways, coreVpcCidr, coreSubnetConfiguration,'Core');
        this.managementVpc = this.createVpc(0, managementVpcCidr, managementSubnetConfiguration,'Management');
        NagSuppressions.addResourceSuppressions(this.ranVpc, [
            { id: 'AwsSolutions-VPC7', reason: 'No VPC Flow Logs needed for this blog post deployment.' },
            { id: 'CdkNagValidationFailure', reason: 'To ignore CdkNagValidationFailure on the endpoint' },
        ],true);
        NagSuppressions.addResourceSuppressions(this.coreVpc, [
            { id: 'AwsSolutions-VPC7', reason: 'No VPC Flow Logs needed for this blog post deployment.' },
            { id: 'CdkNagValidationFailure', reason: 'To ignore CdkNagValidationFailure on the endpoint' },
        ],true);
        NagSuppressions.addResourceSuppressions(this.managementVpc, [
            { id: 'AwsSolutions-VPC7', reason: 'No VPC Flow Logs needed for this blog post deployment.' },
            { id: 'CdkNagValidationFailure', reason: 'To ignore CdkNagValidationFailure on the endpoint' },
        ],true);

        // Peering
        const vpcPeering = new ec2.CfnVPCPeeringConnection(this, 'CoreRanVpcPeering', {
            peerVpcId: this.coreVpc.vpcId,
            vpcId: this.ranVpc.vpcId,

        });
        // Add route peering
        let index = 0;
        for (const coreSubnet of this.coreVpc.selectSubnets({ subnetGroupName: 'UserPlane' }).subnets) {
            for (const ranSubnet of this.ranVpc.selectSubnets({ subnetGroupName: 'RAN' }).subnets) {
                new ec2.CfnRoute(this, 'coreSubnetPeering' + index++, {
                    routeTableId: coreSubnet.routeTable.routeTableId,
                    destinationCidrBlock: ranSubnet.ipv4CidrBlock,
                    vpcPeeringConnectionId: vpcPeering.ref,
                });
            }
        }
        for (const coreSubnet of this.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlane' }).subnets) {
            for (const ranSubnet of this.ranVpc.selectSubnets({ subnetGroupName: 'RAN' }).subnets) {
                new ec2.CfnRoute(this, 'coreSubnetPeering' + index++, {
                    routeTableId: coreSubnet.routeTable.routeTableId,
                    destinationCidrBlock: ranSubnet.ipv4CidrBlock,
                    vpcPeeringConnectionId: vpcPeering.ref,
                });
            }
        }
        for (const ranSubnet of this.ranVpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnets) {
            for (const coreSubnet of this.coreVpc.selectSubnets({ subnetGroupName: 'UserPlane' }).subnets) {
                new ec2.CfnRoute(this, 'ranSubnetPeering' + index++, {
                    routeTableId: ranSubnet.routeTable.routeTableId,
                    destinationCidrBlock: coreSubnet.ipv4CidrBlock,
                    vpcPeeringConnectionId: vpcPeering.ref,
                });
            }
            for (const coreSubnet of this.coreVpc.selectSubnets({ subnetGroupName: 'ControlPlane' }).subnets) {
                new ec2.CfnRoute(this, 'ranSubnetPeering' + index++, {
                    routeTableId: ranSubnet.routeTable.routeTableId,
                    destinationCidrBlock: coreSubnet.ipv4CidrBlock,
                    vpcPeeringConnectionId: vpcPeering.ref,
                });
            }
        }

        // DNS
        this.hostedZone = new r53.PrivateHostedZone(this, 'HostedZone', {
            zoneName: 'local',
            vpc: this.coreVpc
        });
        this.hostedZone.addVpc(this.ranVpc);
    }
}
