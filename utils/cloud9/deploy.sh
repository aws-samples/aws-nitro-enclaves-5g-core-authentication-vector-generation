#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
STACKNAME=Cloud9Host
aws cloudformation create-stack --stack-name ${STACKNAME} --template-body file://environment.yaml --capabilities CAPABILITY_NAMED_IAM