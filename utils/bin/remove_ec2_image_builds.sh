#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
IMAGE_ARN=$(aws imagebuilder list-images --query imageVersionList[0].arn --output text)
echo $IMAGE_ARN
while [ "$IMAGE_ARN" != "None" ]; do
    IMAGE_BUILD_ID=$(aws imagebuilder list-image-build-versions --image-version-arn $IMAGE_ARN --query imageSummaryList[0].arn --output text)
    echo Remove builds for $IMAGE_ARN
    echo $IMAGE_BUILD_ID
    while [ "$IMAGE_BUILD_ID" != "None" ]; do
        aws imagebuilder delete-image --image-build-version-arn $IMAGE_BUILD_ID
        IMAGE_BUILD_ID=$(aws imagebuilder list-image-build-versions --image-version-arn $IMAGE_ARN --query imageSummaryList[0].arn --output text)
    done
    # Try next IMAGE
    IMAGE_ARN=$(aws imagebuilder list-images --query imageVersionList[0].arn --output text)
    echo $IMAGE_ARN
done
