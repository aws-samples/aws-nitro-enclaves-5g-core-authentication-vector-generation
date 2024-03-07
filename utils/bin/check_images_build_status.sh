#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
imageName=ArpfNitroEnclaveArm64
imageArn=$(aws imagebuilder list-images --query "imageVersionList[?name=='${imageName}'].arn" --output text)
echo $imageArn
aws imagebuilder list-image-build-versions --image-version-arn $imageArn --query "imageSummaryList[].state.status" --output text

imageName=CoreRanArm64
imageArn=$(aws imagebuilder list-images --query "imageVersionList[?name=='${imageName}'].arn" --output text)
echo $imageArn
aws imagebuilder list-image-build-versions --image-version-arn $imageArn --query "imageSummaryList[].state.status" --output text
