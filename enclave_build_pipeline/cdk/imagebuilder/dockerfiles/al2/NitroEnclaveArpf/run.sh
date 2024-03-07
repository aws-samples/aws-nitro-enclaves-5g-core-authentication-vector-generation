#!/bin/sh
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

# Assign an IP address to local loopback
ip addr add 127.0.0.1/32 dev lo

ip link set dev lo up

# Add a hosts record, pointing API endpoint to local loopback
echo "127.0.0.1   kms.eu-central-1.amazonaws.com" >> /etc/hosts

touch /app/libnsm.so

# Proxy for the kms calls
# On the parent instance, launch: socat vsock-listen:8001,fork tcp-connect:kms.eu-central-1.amazonaws.com:443
/app/socat tcp-listen:443,fork,bind=127.0.0.1 vsock-connect:3:8001 &
echo "Start application"
python3 /app/application_server.py
