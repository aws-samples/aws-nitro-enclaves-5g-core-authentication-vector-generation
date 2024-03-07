#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Get bucket name
REGION_NAME=$(aws configure get region)
APPLICATION_NAME='CoreRanAmiPipeline' # To get the BucketName
BUCKET_PATH='S3/CodeBuildCoreRanBucketName'

BUCKET_NAME=$(aws ssm get-parameter  --region ${REGION_NAME} --name "/${APPLICATION_NAME}/${BUCKET_PATH}" --query "Parameter.Value" --output text)
echo "BucketName: ${BUCKET_NAME}"

SRC_CONTAINER_BUILD__DIRECTORY=imagebuilder/dockerfiles
DST_CONTAINER_BUILD__DIRECTORY=dockerFiles

aws s3 sync ${SRC_CONTAINER_BUILD__DIRECTORY} s3://${BUCKET_NAME}/${DST_CONTAINER_BUILD__DIRECTORY}/
