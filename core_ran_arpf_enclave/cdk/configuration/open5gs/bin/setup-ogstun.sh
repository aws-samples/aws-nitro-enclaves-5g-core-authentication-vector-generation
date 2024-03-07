#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
sudo ip tuntap add name ogstun mode tun
sudo ip addr add 10.45.0.1/16 dev ogstun
sudo ip addr add 2001:db8:cafe::1/48 dev ogstun
sudo ip link set ogstun up
sudo sysctl -w net.ipv4.ip_forward=1
# See https://docs.docker.com/network/iptables/
# # sudo iptables -I DOCKER-USER -j ACCEPT # Needed with Docker, and super permissive
# Check with sudo iptables -L DOCKER-USER --line-numbers -v
#sudo iptables -I DOCKER-USER -i ens5 -o ogstun -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
#sudo iptables -I DOCKER-USER -i ogstun -o ens5 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
#sudo iptables -I DOCKER-USER -i ogstun -o ens5 -s 10.45.0.0/16 -d 0.0.0.0/0 -m conntrack --ctstate NEW -j ACCEPT
# Replaced by NAT GW (see https://nickvsnetworking.com/open5gs-without-nat/ for rule above)
#sudo iptables -t nat -A POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE
