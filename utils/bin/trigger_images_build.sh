#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
pipelineName=CoreRanArm64
pipelineArn=$(aws imagebuilder list-image-pipelines --query "imagePipelineList[*].arn" --filter name=name,values=${pipelineName} --output text)
echo $pipelineArn
aws imagebuilder start-image-pipeline-execution --image-pipeline-arn ${pipelineArn}


pipelineName=ArpfNitroEnclaveArm64
pipelineArn=$(aws imagebuilder list-image-pipelines --query "imagePipelineList[*].arn" --filter name=name,values=${pipelineName} --output text)
echo $pipelineArn
aws imagebuilder start-image-pipeline-execution --image-pipeline-arn ${pipelineArn}
