#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=amf

tmux new-session -d -s $session
tmux set-option -g -t $session allow-rename off

window=0
tmux rename-window -t $session:$window 'shell'
tmux send-keys -t $session:$window 'echo Do stuff' C-m

window=1
tmux new-window -t $session:$window -n 'bsf'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh bsf' C-m

window=2
tmux new-window -t $session:$window -n 'pcf'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh pcf' C-m

window=3
tmux new-window -t $session:$window -n 'smf'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh smf' C-m

window=4
tmux new-window -t $session:$window -n 'Access Control & Mobility GW (AMF)'
tmux send-keys -t $session:$window 'clear && sh ./run-cnf.sh amf 2>&1 | egrep "initialize|Added|Removed|imsi|WARNING|DNN|error" --color=never' C-m

tmux select-window -t $session:4

tmux set-option -g -t $session window-style 'bg=black,fg=colour15' # colour208
tmux set-option  -t $session status-bg colour208
tmux set-option  -t $session status-fg colour15
tmux set-option  -t $session status-left Core
