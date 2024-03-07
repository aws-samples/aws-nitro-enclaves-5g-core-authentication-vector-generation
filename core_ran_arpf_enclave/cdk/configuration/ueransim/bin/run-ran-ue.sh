#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=ran

tmux new-session -d -s $session
tmux set-option -g -t $session allow-rename off

window=0
tmux rename-window -t $session:$window 'Base-station (gNB)'
#tmux send-keys -t $session:$window 'echo nr-gnb -c ueransim-gnb-config.yaml' C-m
# Start the eNB directly
tmux send-keys -t $session:$window 'clear &&  nr-gnb -c ueransim-gnb-config.yaml|egrep "success|error" --color=never' C-m

window=1
tmux new-window -t $session:$window -n 'Smartphone 1 (UE1)'
tmux send-keys -t $session:$window 'sleep 5' C-m
tmux send-keys -t $session:$window 'clear && sudo /usr/local/bin/nr-ue -c ueransim-ue-config-01.yaml|egrep "success|error" --color=never' C-m

window=2
tmux new-window -t $session:$window -n 'ping UE1'
tmux send-keys -t $session:$window 'sleep 10' C-m
tmux send-keys -t $session:$window 'clear && ping -I uesimtun0 cloudfront.com' C-m

window=3
tmux new-window -t $session:$window -n 'iperf UE1'
tmux send-keys -t $session:$window '#sudo ip r d 10.45.0.0/16' C-m
tmux send-keys -t $session:$window 'sleep 10' C-m
tmux send-keys -t $session:$window 'clear && sudo ip r a 10.45.0.0/16 dev uesimtun0 && iperf3 -c n6.local -p 25001 -t 3600 -b 256M' C-m

window=4
tmux new-window -t $session:$window -n 'Check gNB'
tmux send-keys -t $session:$window '#nr-cli UERANSIM-gnb-999-70-1 --exec ue-count' C-m

tmux set-option -g -t $session window-style 'bg=colour27,fg=colour15'
tmux set-option  -t $session status-bg colour27
tmux set-option  -t $session status-fg colour15
tmux set-option   -t $session status-left RAN

tmux select-window -t $session:2
#tmux attach -t $session
