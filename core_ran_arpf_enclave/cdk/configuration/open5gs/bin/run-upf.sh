#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=upf

tmux new-session -d -s $session
tmux set-option -g -t $session allow-rename off

window=0
tmux rename-window -t $session:$window 'shell'
tmux send-keys -t $session:$window 'echo Do stuff' C-m

window=1
tmux new-window -t $session:$window -n 'UPF'
tmux send-keys -t $session:$window 'sh ./setup-ogstun.sh && sh ./run-cnf.sh upf' C-m

window=2
tmux new-window -t $session:$window -n 'iperf'
tmux send-keys -t $session:$window 'iperf3 -s -p 25001' C-m

tmux select-window -t $session:1

tmux set-option  -t $session window-style 'bg=colour119,fg=black' # colour15
tmux set-option  -t $session status-bg colour40
tmux set-option  -t $session status-fg colour15
tmux set-option  -t $session status-left UPF
