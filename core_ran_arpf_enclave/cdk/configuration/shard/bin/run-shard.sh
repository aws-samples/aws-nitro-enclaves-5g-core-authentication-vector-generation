#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=shard

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

window=4
tmux new-window -t $session:$window -n 'ARPF frontend'
tmux send-keys -t $session:$window 'shard_frontend.py --listen 0.0.0.0 --instance-id "$(ec2-metadata -i  | cut -d '\'' '\'' -f2)"' C-m

tmux select-window -t $session:2

tmux set-option -g -t $session window-style 'bg=colour5,fg=colour15'
tmux set-option  -t $session status-bg colour5 
tmux set-option  -t $session status-fg colour15 
tmux set-option  -t $session status-left Enclave
