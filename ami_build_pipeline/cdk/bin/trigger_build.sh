#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
VALID_KEYS="Open5gsArm64 | Open5gsEnclaveArm64 | UeransimArm64 | SrsranArm64"
if [ $# -eq 1 ]; then
    # Validate key
    case $1 in
        "Open5gsArm64" | "Open5gsEnclaveArm64" | "UeransimArm64" | "SrsranArm64")
            echo "Valid project key"
            ;;
        *)
            echo "Unknown project key"
            echo "Valid keys: ${VALID_KEYS}"
            exit 1
            ;;
    esac
    PROJECT_KEY=$1
    PROJECT_NAME=$(aws codebuild list-projects --query "projects[*]" | jq  -r '.[] | select(. | startswith("Build'${PROJECT_KEY}'"))')
    echo $PROJECT_NAME
    aws codebuild start-build --project-name ${PROJECT_NAME} | jq
else
    echo "Provide project key: ${VALID_KEYS}"
    exit 1
fi
