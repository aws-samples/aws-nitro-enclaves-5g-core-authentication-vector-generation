#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=nrf

tmux new-session -d -s $session
tmux set-option -g -t $session allow-rename off

window=0
tmux rename-window -t $session:$window 'shell'
tmux send-keys -t $session:$window 'echo Do stuff' C-m

window=1
tmux new-window -t $session:$window -n 'nrf'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh nrf' C-m

window=2
tmux new-window -t $session:$window -n 'scp'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh scp' C-m

window=3
tmux new-window -t $session:$window -n 'nssf'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh nssf' C-m

tmux select-window -t $session:1

tmux set-option -g -t $session window-style 'bg=black,fg=colour15' # colour208
tmux set-option  -t $session status-bg colour208
tmux set-option  -t $session status-fg colour15
tmux set-option  -t $session status-left Core
