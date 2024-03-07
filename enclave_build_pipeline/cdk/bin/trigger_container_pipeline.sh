#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

VALID_NAMES="ArpfNitroEnclave | TBA"
if [ $# -eq 1 ]; then
    # Validate key
    case $1 in
        "ArpfNitroEnclave") # "ArpfNitroEnclave" | "TBA")
            echo "Valid pipeline name"
            ;;
        *)
            echo "Unknown pipeline name"
            echo "Valid keys: ${VALID_NAMES}"
            exit 1
            ;;
    esac
    pipelineName=$1
    pipelineArn=$(aws imagebuilder list-image-pipelines --query "imagePipelineList[*].arn" --filter name=name,values=${pipelineName} --output text)
    echo $pipelineArn
    aws imagebuilder start-image-pipeline-execution --image-pipeline-arn ${pipelineArn}
else
    echo "Provide valid pipeline name: ${VALID_NAMES}"
    exit 1
fi


