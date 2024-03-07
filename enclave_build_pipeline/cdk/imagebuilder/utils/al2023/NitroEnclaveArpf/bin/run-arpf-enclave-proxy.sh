#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# Test with nc IP_ADDRESS 8012
# or
# ./enclave-ctl.py --command decrypt --argument client-side --use-tcp --ip-address IP_ADDRESS --port 8012
# Get local IP address of ENI
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
IP_ADDRESS=$(curl -s -H "X-aws-ec2-metadata-token: ${TOKEN}" http://169.254.169.254/1.0/meta-data/local-ipv4)
CID=12
if [ $# -eq 3 ]; then
  PORT=$3
else
  PORT=8012
fi
echo Listen on ${IP_ADDRESS}:${PORT} to CID ${CID}
if [ ! -z "$2" -a "$2" = "udp" ]; then
  echo "UDP ${PORT}"
  socat udp-listen:${PORT},fork,bind=${IP_ADDRESS} vsock-connect:${CID}:8888
else
  echo "TCP ${PORT}"
  socat tcp-listen:${PORT},fork,bind=${IP_ADDRESS} vsock-connect:${CID}:8888
fi
