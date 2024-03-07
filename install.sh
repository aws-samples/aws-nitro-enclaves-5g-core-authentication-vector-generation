#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
APPLICATION=ArpfEnclave
SESSION_DOCUMENT_NAME=SessionRegionalSettings
# Expects aws-cli, CDK, and jq to be installed: see https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install
ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)
echo AWS Account number: ${ACCOUNT}
REGION=$(aws configure get region)
echo Default AWS Region: ${REGION}
AMI_PIPELINE_DIR=ami_build_pipeline
ENCLAVE_PIPELINE_DIR=enclave_build_pipeline
CONFIGURATION_DEPLOYMENT_DIR=configuration_deployment_automation
APPLICATION_DIR=core_ran_arpf_enclave

# Bootstrap the environment if needed
cdk bootstrap aws://${ACCOUNT}/${REGION} -t Application=${APPLICATION}

SESSION_DOCUMENT=$(aws ssm list-documents --filters "Key=DocumentType, Values=Session" "Key=Owner, Values=Self" --query "DocumentIdentifiers[?Name=='$SESSION_DOCUMENT_NAME']" --output text)
#echo $SESSION_DOCUMENT
if [ -z "$SESSION_DOCUMENT" ]; then
    echo Create Session document
    aws ssm create-document --content file://utils/ssm/session_manager/session_document.yaml --document-type "Session" --name ${SESSION_DOCUMENT_NAME} --document-format YAML --region ${REGION}
else
    echo Document ${SESSION_DOCUMENT_NAME} already exists
    # aws ssm update-document --content file://utils/ssm/session_manager/session_document.yaml --name "session-regional-setting" --document-version '$LATEST' --region ${REGION}
fi

CURRENT_DIR=$(pwd)
echo ${CURRENT_DIR}

# AMI Pipeline
cd ${AMI_PIPELINE_DIR}/cdk
npm install
cdk synth
cdk deploy CodebuildVpcStack, CodebuildCoreRanStack --require-approval never
bin/push_buildspecs_to_s3.sh codebuild
bin/push_dockerfiles_to_s3.sh
cdk deploy ImageBuilderCoreRanStack --require-approval never
cd ${CURRENT_DIR}

# Enclave Pipeline
cd ${ENCLAVE_PIPELINE_DIR}/cdk
npm install
cdk synth
bin/push_artefacts_to_s3.sh
cdk deploy ImageBuilderEnclaveStack --require-approval never
cd ${CURRENT_DIR}

# Configuration deployment automation
cd ${CONFIGURATION_DEPLOYMENT_DIR}/cdk
npm install
cdk synth
cdk deploy ConfigurationAssociationAutomation* --require-approval never
cd ${CURRENT_DIR}

cd ${APPLICATION_DIR}/cdk
npm install
cdk synth
cdk deploy EnclaveArpfBucketStack --require-approval never
cdk deploy EnclaveArpfKeyInfrastructureStack --require-approval never
cd ${CURRENT_DIR}

echo "Trigger builds"
utils/bin/trigger_artefacts_build.sh
sleep 5
echo "Check with utils/bin/check_artefacts_build_status.sh and when complete, build images with trigger_images_build.sh"
#utils/bin/check_artefacts_build_status.sh
