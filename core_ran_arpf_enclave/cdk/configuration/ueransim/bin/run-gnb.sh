#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=ran-gnb

tmux new-session -d -s $session
tmux set-option -g -t $session allow-rename off

window=0
tmux rename-window -t $session:$window 'Base-station (gNB)'
# Start the eNB directly
tmux send-keys -t $session:$window 'clear &&  nr-gnb -c ueransim-gnb-config.yaml|egrep "success|error" --color=never' C-m

window=1
tmux new-window -t $session:$window -n 'Check gNB'
tmux send-keys -t $session:$window '#nr-cli UERANSIM-gnb-999-70-1 --exec ue-count' C-m

tmux set-option -g -t $session window-style 'bg=colour27,fg=colour15'
tmux set-option  -t $session status-bg colour27
tmux set-option  -t $session status-fg colour15
tmux set-option   -t $session status-left RAN

tmux select-window -t $session:0
#tmux attach -t $session
