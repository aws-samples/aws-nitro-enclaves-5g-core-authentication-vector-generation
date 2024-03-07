#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
nitro-cli describe-enclaves | jq '.[] | select( .EnclaveName == "arpf")' | jq -r .State
