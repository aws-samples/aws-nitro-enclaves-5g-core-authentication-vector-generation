#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
AMI_ID=$(aws ec2 describe-images --owner self --query Images[0].ImageId --output text)
echo $AMI_ID
while [ "$AMI_ID" != "None" ]; do
    echo Remove $AMI_ID
    SNAP_ID=$(aws ec2 describe-images --owner self --query Images[0].BlockDeviceMappings[0].Ebs.SnapshotId --output text)
    echo $SNAP_ID
    aws ec2 deregister-image --image-id $AMI_ID
    sleep 5
    aws ec2 delete-snapshot --snapshot-id $SNAP_ID
    # Try next AMI
    AMI_ID=$(aws ec2 describe-images --owner self --query Images[0].ImageId --output text)
done
