#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=arpf

# # Get local IP address of ENI
# TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
# ENI_IP=$(curl -s -H "X-aws-ec2-metadata-token: ${TOKEN}" http://169.254.169.254/1.0/meta-data/local-ipv4)


tmux new-session -d -s $session
tmux set-option -g -t $session allow-rename off

window=0
tmux rename-window -t $session:$window 'shell'
tmux send-keys -t $session:$window 'echo Do stuff' C-m

window=1
tmux new-window -t $session:$window -n 'KMS proxy'
tmux send-keys -t $session:$window 'run-kms-proxy.sh' C-m

window=2
tmux new-window -t $session:$window -n 'ARPF Enclave'
tmux send-keys -t $session:$window 'run-arpf-enclave.sh' C-m
tmux send-keys -t $session:$window 'sleep 2' C-m
tmux send-keys -t $session:$window 'enclave-ctl.py --command ping' C-m
tmux send-keys -t $session:$window 'enclave-ctl.py --command auth' C-m
tmux send-keys -t $session:$window 'get-encrypted-subscriber-data-from-s3.sh' C-m
tmux send-keys -t $session:$window 'enclave-ctl.py --command ciphertext --ciphertext-file sub_data_binary.encrypted.base64' C-m
tmux send-keys -t $session:$window 'while [ $(enclave-ctl.py --command decrypt --argument client-side | jq -r .Status) != "success" ]; do echo "Decryption failed" && sleep 5; done && echo "Decryption successful"' C-m

window=3
tmux new-window -t $session:$window -n 'Enclave proxy'
tmux send-keys -t $session:$window 'while [ "$(check-arpf-enclave.sh)" != "RUNNING" ]; do echo -n . && sleep 1; done' C-m
tmux send-keys -t $session:$window 'check-arpf-enclave.sh' C-m
tmux send-keys -t $session:$window 'run-arpf-enclave-proxy.sh' C-m
#tmux send-keys -t $session:$window 'socat tcp-listen:8012,fork,bind='${ENI_IP}' vsock-connect:12:8888' C-m # To be replaced by above

window=4
tmux new-window -t $session:$window -n 'Enclave status frontend'
tmux send-keys -t $session:$window 'expose_enclave_status.py --expose-http-frontend --listen 0.0.0.0' C-m

tmux select-window -t $session:2

tmux set-option -g -t $session window-style 'bg=colour5,fg=colour15'
tmux set-option  -t $session status-bg colour5 
tmux set-option  -t $session status-fg colour15 
tmux set-option  -t $session status-left Enclave
