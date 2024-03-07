#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
session=udm
DB_URI=mongodb://udm.local/open5gs

docker run --rm --name local-mongo-host --network host -d mongo:6

echo "Let Mongo DB settle"
sleep 5
echo "Done"

tmux new-session -d -s $session
tmux set-option -g -t $session allow-rename off

window=0
tmux rename-window -t $session:$window 'Check ARPF connectivity'
tmux send-keys -t $session:$window 'echo -n '\''{ "command":"ping" }'\'' | socat - tcp-connect:arpf.local:8012' C-m

window=1
tmux new-window -t $session:$window -n 'udr'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh udr VIA_ENCLAVE' C-m

window=2
tmux new-window -t $session:$window -n 'udm'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh udm VIA_ENCLAVE' C-m

window=3
tmux new-window -t $session:$window -n 'ausf'
tmux send-keys -t $session:$window 'sh ./run-cnf.sh ausf VIA_ENCLAVE' C-m

window=4
tmux new-window -t $session:$window -n 'db-ctl'
tmux send-keys -t $session:$window './open5gs-dbctl-0.11.0 --db_uri='${DB_URI}' add 999700000000001 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA' C-m
tmux send-keys -t $session:$window './open5gs-dbctl-0.11.0 --db_uri='${DB_URI}' add 999700000000101 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA' C-m
tmux send-keys -t $session:$window './open5gs-dbctl-0.11.0 --db_uri='${DB_URI}' add 999700000000201 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA' C-m
tmux send-keys -t $session:$window './open5gs-dbctl-0.11.0 --db_uri='${DB_URI}' add 001010000000001 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA' C-m
tmux send-keys -t $session:$window './open5gs-dbctl-0.11.0 --db_uri='${DB_URI}' add 001010000000101 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA' C-m
tmux send-keys -t $session:$window './open5gs-dbctl-0.11.0 --db_uri='${DB_URI}' add 001010000000201 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA' C-m

tmux select-window -t $session:2

tmux set-option -g -t $session window-style 'bg=colour210,fg=black' # colour15 # Don't use -g because it overwrites the other session
tmux set-option  -t $session status-bg colour210
tmux set-option  -t $session status-fg colour15
tmux set-option  -t $session status-left udm
