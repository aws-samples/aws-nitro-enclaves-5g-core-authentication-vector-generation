// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// # SPDX-License-Identifier: MIT-0
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

interface VpcStackProps extends cdk.StackProps {
    applicationName: string;
    stackName: string;
    owner: string;
    vpcCidr?: string;
    withPrivateSubnet?: boolean;
    natGateways?: number;
}

export class VpcStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;

    constructor(scope: Construct, id: string, props: VpcStackProps) {
        super(scope, id, props);

        const stackName = props.stackName;
        const applicationName = props.applicationName;
        const owner = props.owner;

        // Add tags to all constructs in the stack
        cdk.Tags.of(this).add('Owner', owner);
        cdk.Tags.of(this).add('CreatedByCdkStack', stackName);
        cdk.Tags.of(this).add('ApplicationName', applicationName);

        const natGateways = props.natGateways ?? 0;
        const withPrivateSubnet = props.withPrivateSubnet ?? false;

        var subnetConfiguration: ec2.SubnetConfiguration[];
        if (withPrivateSubnet) {
            subnetConfiguration = [
                { cidrMask: 26,
                  name: 'Hosts',
                  subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
                { cidrMask: 26,
                  name: 'Access',
                  subnetType: ec2.SubnetType.PUBLIC },
            ];
        } else {
            subnetConfiguration = [
                { cidrMask: 26,
                  name: 'Hosts',
                  subnetType: ec2.SubnetType.PUBLIC },
            ];
        }
        
        this.vpc= new ec2.Vpc(this, 'VPC', {
            natGateways: natGateways,
            maxAzs: 99,
            ipAddresses: ec2.IpAddresses.cidr(props?.vpcCidr ?? '10.07.0.0/16'),
            subnetConfiguration: subnetConfiguration,
        });
        NagSuppressions.addResourceSuppressions(this.vpc, [
            { id: 'AwsSolutions-VPC7', reason: 'Not using VPC Flow Log for this blog post' },
        ]);

        if (withPrivateSubnet) {
            const s3Endpoint = this.vpc.addGatewayEndpoint('S3Endpoint', {
                service: ec2.GatewayVpcEndpointAwsService.S3,
                subnets: [
                    { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
                ]
            });
        }
    }
}
