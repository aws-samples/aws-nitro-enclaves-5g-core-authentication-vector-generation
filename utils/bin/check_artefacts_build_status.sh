#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
imageName=arpfNitroEnclave
imageArn=$(aws imagebuilder list-images --query "imageVersionList[?name=='${imageName}'].arn" --output text)
echo $imageArn
aws imagebuilder list-image-build-versions --image-version-arn $imageArn --query "imageSummaryList[].state.status" --output text

PROJECT_KEYS=(Open5gsArm64 Open5gsEnclaveArm64 UeransimArm64)
for PROJECT_KEY in ${PROJECT_KEYS[@]}; do
    PROJECT_NAME=$(aws codebuild list-projects --query "projects[*]" | jq  -r '.[] | select(. | startswith("Build'${PROJECT_KEY}'"))')
    echo $PROJECT_NAME
    BUILDS=($(aws codebuild list-builds-for-project --project-name ${PROJECT_NAME} --query ids[] --output text))
    for BUILD in ${BUILDS[@]}; do
        echo $BUILD
        aws codebuild batch-get-builds --ids ${BUILD} --query "builds[].buildStatus" --output text
    done
done
