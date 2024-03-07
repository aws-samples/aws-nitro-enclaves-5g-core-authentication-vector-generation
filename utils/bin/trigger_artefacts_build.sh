#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
PROJECT_KEYS=(Open5gsArm64 Open5gsEnclaveArm64 UeransimArm64)

for PROJECT_KEY in ${PROJECT_KEYS[@]}; do
    PROJECT_NAME=$(aws codebuild list-projects --query "projects[*]" | jq  -r '.[] | select(. | startswith("Build'${PROJECT_KEY}'"))')
    echo $PROJECT_NAME
    aws codebuild start-build --project-name ${PROJECT_NAME} | jq
done

pipelineName=ArpfNitroEnclave
pipelineArn=$(aws imagebuilder list-image-pipelines --query "imagePipelineList[*].arn" --filter name=name,values=${pipelineName} --output text)
echo $pipelineArn
aws imagebuilder start-image-pipeline-execution --image-pipeline-arn ${pipelineArn}
