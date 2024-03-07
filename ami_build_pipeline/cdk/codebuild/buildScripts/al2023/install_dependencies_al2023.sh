#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# To download git repo and build socat
sudo dnf install -y git tmux gcc
# Open5gs
sudo dnf install -y htop meson cmake ninja-build libmicrohttpd-devel python3 gcc gcc-c++ flex bison git lksctp-tools-devel libidn-devel gnutls-devel libgcrypt-devel openssl-devel cyrus-sasl-devel libyaml-devel libcurl-devel libnghttp2-devel libtalloc-devel wget xz xz-devel python3-devel
sudo dnf install -y libcurl openssl xz-libs --allowerasing
