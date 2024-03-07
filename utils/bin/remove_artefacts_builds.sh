#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
PROJECT_KEYS=(Open5gsArm64 Open5gsEnclaveArm64 UeransimArm64)
for PROJECT_KEY in ${PROJECT_KEYS[@]}; do
    PROJECT_NAME=$(aws codebuild list-projects --query "projects[*]" | jq  -r '.[] | select(. | startswith("Build'${PROJECT_KEY}'"))')
    echo $PROJECT_KEY: $PROJECT_NAME
    BUILDS=($(aws codebuild list-builds-for-project --project-name ${PROJECT_NAME} --query ids[] --output text))
    for BUILD in ${BUILDS[@]}; do
        echo $BUILD
        aws codebuild batch-delete-builds --ids ${BUILD} --query "builds[].buildStatus" --output text
    done
done
