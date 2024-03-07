#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

# Get bucket name
REGION_NAME='eu-central-1'
APPLICATION_NAME='CoreRanAmiPipeline' # To get the BucketName. And using this application name because reusing the bucket from the CodeBuild Setup
BUCKET_PATH='S3/CodeBuildCoreRanBucketName'

BUCKET_NAME=$(aws ssm get-parameter  --region ${REGION_NAME} --name "/${APPLICATION_NAME}/${BUCKET_PATH}" --query "Parameter.Value" --output text)
echo "BucketName: ${BUCKET_NAME}"

SRC_CONTAINER_BUILD_DIRECTORY=imagebuilder/dockerfiles
DST_CONTAINER_BUILD_DIRECTORY=dockerFiles

aws s3 sync ${SRC_CONTAINER_BUILD_DIRECTORY} s3://${BUCKET_NAME}/${DST_CONTAINER_BUILD_DIRECTORY}/

SRC_UTILS_DIRECTORY=imagebuilder/utils
DST_UTILS_DIRECTORY=utils

aws s3 sync ${SRC_UTILS_DIRECTORY} s3://${BUCKET_NAME}/${DST_UTILS_DIRECTORY}/
