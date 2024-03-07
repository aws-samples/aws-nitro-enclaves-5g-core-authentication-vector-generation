#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
sudo dnf install -y gnutls-utils
cp -r ~/src/nitro-enclave-5g-udm.git/bootstrap/al2022/gnutls ~/src/
cd ~/src/gnutls/
sh generate_cert.sh
