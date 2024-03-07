#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
mkdir -p ~/src && cd ~/src
sudo dnf install -y cmake gcc gcc-c++ iproute lksctp-tools-devel lksctp-tools
git clone https://github.com/aligungr/UERANSIM UERANSIM.git
cd UERANSIM.git
make -j4
sudo cp build/nr-* /usr/local/bin/
sudo cp build/libdevbnd.so /usr/local/lib/
sudo mkdir -p /usr/local/etc/ueransim/
sudo cp config/* /usr/local/etc/ueransim/
# sudo make install # Does not exists
