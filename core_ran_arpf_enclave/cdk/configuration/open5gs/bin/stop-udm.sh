#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
docker stop local-mongo-host
tmux kill-session -t udm
pkill open5gs-udmd
pkill open5gs-udrd
pkill open5gs-ausfd
