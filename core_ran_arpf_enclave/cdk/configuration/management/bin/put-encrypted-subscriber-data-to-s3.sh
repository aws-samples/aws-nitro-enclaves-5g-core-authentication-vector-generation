#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
DATA=sub_data_binary.encrypted.base64

# Get bucket name
REGION_NAME='eu-central-1'
# REMOTE_REGIONS_NAME=('eu-central-2')
APPLICATION_NAME='EnclaveArpf' # To get the BucketName
BUCKET_PATH='EnclaveDeploymentPipeline/S3/EnclaveMaterialBucketName'
BUCKET_NAME=$(aws ssm get-parameter  --region ${REGION_NAME} --name "/${APPLICATION_NAME}/${BUCKET_PATH}" --query "Parameter.Value" --output text)
echo "BucketName: ${BUCKET_NAME}"

DATA_DST=s3://${BUCKET_NAME}/subscriber_data/

aws s3 cp ${DATA} ${DATA_DST}
