#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
if [ "$(check-arpf-enclave.sh)" == "RUNNING" ]; then
    stop-arpf-enclave.sh
    tmux kill-session -t shard
fi
