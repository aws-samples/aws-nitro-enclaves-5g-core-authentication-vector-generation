#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
KMS_TOOL=/app/kmstool_enclave_cli
echo "Testing prototyping image"
while [ -e $KMS_TOOL ]
do
	$KMS_TOOL --help
	sleep 5
done
echo "${KMS_TOOL} not found"
