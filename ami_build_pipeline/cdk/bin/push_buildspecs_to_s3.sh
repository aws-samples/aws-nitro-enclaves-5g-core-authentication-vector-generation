#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# Example: bin/push_buildspecs_to_s3.sh codebuild
# Get bucket name
REGION_NAME=$(aws configure get region)
APPLICATION_NAME='CoreRanAmiPipeline'
BUCKET_PATH='S3/CodeBuildCoreRanBucketName'
BUCKET_NAME=$(aws ssm get-parameter  --region ${REGION_NAME} --name "/${APPLICATION_NAME}/${BUCKET_PATH}" --query "Parameter.Value" --output text)

echo "BucketName: ${BUCKET_NAME}"

if [ $# -eq 1 ]; then
    BUILDSPEC_DIR=$1/buildSpecs
    echo $BUILDSPEC_DIR
    BUILDSCRIPT_DIR=$1/buildScripts
    echo $BUILDSCRIPT_DIR
    PATCH_DIR=$1/patches
    echo $PATCH_DIR
    if [ -d "$BUILDSPEC_DIR" ]; then
        mkdir -p $BUILDSPEC_DIR/upload
        zip -j $BUILDSPEC_DIR/upload/open5gs.zip $BUILDSPEC_DIR/buildSpecOpen5gs.yaml
        zip -j $BUILDSPEC_DIR/upload/open5gs-enclave.zip $BUILDSPEC_DIR/buildSpecOpen5gsEnclave.yaml
        zip -j $BUILDSPEC_DIR/upload/ueransim.zip $BUILDSPEC_DIR/buildSpecUeransim.yaml
        zip -j $BUILDSPEC_DIR/upload/srsran.zip $BUILDSPEC_DIR/buildSpecSrsran.yaml
        aws s3 sync $BUILDSPEC_DIR/upload/ s3://$BUCKET_NAME/buildSpecs/
        #aws s3 cp $BUILDSPEC_DIR/upload/open5gs.zip s3://$BUCKET_NAME/buildSpecs/
        #aws s3 cp $BUILDSPEC_DIR/upload/open5gs-enclave.zip s3://$BUCKET_NAME/buildSpecs/
        #aws s3 cp $BUILDSPEC_DIR/upload/ueransim.zip s3://$BUCKET_NAME/buildSpecs/
        #aws s3 cp $BUILDSPEC_DIR/upload/srsran.zip s3://$BUCKET_NAME/buildSpecs/
    fi
    if [ -d "$BUILDSCRIPT_DIR" ]; then
        aws s3 sync $BUILDSCRIPT_DIR/al2023/ s3://$BUCKET_NAME/buildScripts/al2023/
        #aws s3 cp $BUILDSCRIPT_DIR/al2023/install_dependencies_al2023.sh s3://$BUCKET_NAME/buildScripts/al2023/
        #aws s3 cp $BUILDSCRIPT_DIR/al2023/install_mongoc_driver.sh s3://$BUCKET_NAME/buildScripts/al2023/
        #aws s3 cp $BUILDSCRIPT_DIR/al2023/install_open5gs.sh s3://$BUCKET_NAME/buildScripts/al2023/
        #aws s3 cp $BUILDSCRIPT_DIR/al2023/install_open5gs_enclave.sh s3://$BUCKET_NAME/buildScripts/al2023/
        #aws s3 cp $BUILDSCRIPT_DIR/al2023/update_open5gs_certificates.sh s3://$BUCKET_NAME/buildScripts/al2023/
        #aws s3 cp $BUILDSCRIPT_DIR/al2023/install_ueransim.sh s3://$BUCKET_NAME/buildScripts/al2023/
        #aws s3 cp $BUILDSCRIPT_DIR/al2023/install_srsran.sh s3://$BUCKET_NAME/buildScripts/al2023/
    fi

    aws s3 sync $PATCH_DIR/ s3://$BUCKET_NAME/patches/
else
    echo "Provide codebuild buildSpecs, build scripts and patches directory"
    exit 1
fi
