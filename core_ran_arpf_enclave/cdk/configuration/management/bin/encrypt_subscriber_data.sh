#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
encryptor.py --alias encryption-key-01 --plaintext-file /usr/local/share/subscriber_data/plaintext.csv --ciphertext-file sub_data_binary.encrypted
echo "Perform base64 encoding"
base64 --wrap=0 sub_data_binary.encrypted > sub_data_binary.encrypted.base64
# Decrypt
# ./encryptor.py --alias coreran-encryption-key-01 --ciphertext-file sub_data_binary.encrypted --decrypt
