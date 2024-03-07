#!/bin/bash

# Get bucket name
REGION_NAME=$(aws configure get region)
APPLICATION_NAME='ConfigurationDeploymentAutomation' # To get the BucketName
BUCKET_PATH='S3/ConfigurationBucketName'
BUCKET_NAME=$(aws ssm get-parameter  --region ${REGION_NAME} --name "/${APPLICATION_NAME}/${BUCKET_PATH}" --query "Parameter.Value" --output text)
echo "BucketName: ${BUCKET_NAME}"

CONFIGURATION_DIRECTORY=arpf_enclave
aws s3 sync configuration/open5gs s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/open5gs/
aws s3 sync configuration/ueransim s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/ueransim/
aws s3 sync configuration/cloudwatch s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/cloudwatch/
aws s3 sync configuration/arpf s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/arpf/
aws s3 sync configuration/management s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/management/
aws s3 sync configuration/shard s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/shard/
# Utilities to test encryption
aws s3 sync bin/  s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/enclave/bin/ --exclude "*" --include "test-key-*.sh"
# Playbook for all node types
aws s3 sync configuration/ansible s3://${BUCKET_NAME}/configuration/${CONFIGURATION_DIRECTORY}/
