#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
APPLICATION=ArpfEnclave
SESSION_DOCUMENT_NAME=SessionRegionalSettings
# Expects aws-cli, CDK, and jq to be installed: see https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install
ACCOUNT_NUMBER=$(aws sts get-caller-identity --query "Account" --output text)
echo AWS Account number: ${ACCOUNT_NUMBER}
REGION=$(aws configure get region)
echo Default AWS Region: ${REGION}
AMI_PIPELINE_DIR=ami_build_pipeline
ENCLAVE_PIPELINE_DIR=enclave_build_pipeline
CONFIGURATION_DEPLOYMENT_DIR=configuration_deployment_automation
APPLICATION_DIR=core_ran_arpf_enclave

CURRENT_DIR=$(pwd)
echo ${CURRENT_DIR}

cd ${APPLICATION_DIR}/cdk
cdk destroy --all --force true
cd ${CURRENT_DIR}

cd ${CONFIGURATION_DEPLOYMENT_DIR}/cdk
cdk destroy --all --force true
cd ${CURRENT_DIR}

cd ${ENCLAVE_PIPELINE_DIR}/cdk
cdk destroy --all --force true
cd ${CURRENT_DIR}

utils/bin/remove_artefacts_builds.sh

cd ${AMI_PIPELINE_DIR}/cdk
cdk destroy --all --force true
cd ${CURRENT_DIR}

echo Delete session document
aws ssm delete-document --name ${SESSION_DOCUMENT_NAME}

echo Clean-up CDK bootstrapping artefacts
aws cloudformation delete-stack --stack-name CDKToolkit
BOOTSTRAP_BUCKET=$(aws s3 ls | grep cdk-hnb | cut -d ' ' -f3)
# First objects that still exist
BOOTSTRAP_BUCKET_OBJECTS=$(aws s3api list-object-versions --bucket "${BOOTSTRAP_BUCKET}" --output=json --query='{Objects: Versions[].{Key:Key,VersionId:VersionId}}')
aws s3api delete-objects --bucket ${BOOTSTRAP_BUCKET} --delete "${BOOTSTRAP_BUCKET_OBJECTS}"
# Second objects that have a delete marker
BOOTSTRAP_BUCKET_OBJECTS=$(aws s3api list-object-versions --bucket "${BOOTSTRAP_BUCKET}" --output=json --query='{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}')
aws s3api delete-objects --bucket ${BOOTSTRAP_BUCKET} --delete "${BOOTSTRAP_BUCKET_OBJECTS}"
aws s3 rb --force s3://$BOOTSTRAP_BUCKET
ECR_NAME=$(aws ecr describe-repositories --query "repositories[?starts_with(repositoryName,'cdk-hnb')].repositoryName" --output text)
if [ ! -z "$ECR_NAME" ]; then
    echo Delete ECR repository ${ECR_NAME}
    aws ecr delete-repository --repository-name ${ECR_NAME}
fi

utils/bin/remove_ami.sh
utils/bin/remove_ec2_image_builds.sh
