#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
STACKNAME=Cloud9Host
aws cloudformation  delete-stack --stack-name ${STACKNAME}
