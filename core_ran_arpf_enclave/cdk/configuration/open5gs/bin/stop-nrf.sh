#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
tmux kill-session -t nrf
pkill open5gs-*
#pkill open5gs-nrfd
#pkill open5gs-scpd
#pkill open5gs-nssfd
