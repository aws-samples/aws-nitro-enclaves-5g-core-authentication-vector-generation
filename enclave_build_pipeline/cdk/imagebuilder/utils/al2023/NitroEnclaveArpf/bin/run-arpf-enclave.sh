#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
nitro-cli run-enclave --enclave-cid 12 --enclave-name arpf --cpu-count 1 --memory 3900 --eif-path /usr/local/share/enclaves/arpf/arpf.eif
