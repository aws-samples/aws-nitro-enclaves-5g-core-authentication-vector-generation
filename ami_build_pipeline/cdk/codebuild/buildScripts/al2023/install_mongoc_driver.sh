#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# See http://mongoc.org/libmongoc/current/installing.html
sudo dnf install -y cmake openssl-devel cyrus-sasl-devel
mkdir -p ~/src/ && cd ~/src/
git clone https://github.com/mongodb/mongo-c-driver.git mongo-c-driver.git
cd mongo-c-driver.git
VERSION=1.23.1
git checkout ${VERSION}
python3 build/calc_release_version.py > VERSION_CURRENT
#YEAR=$(uname -r | cut -d'.' -f5 |sed 's/[a-z]*//')
#sed "s/'2': 'amazon2',/'${YEAR}': 'amazon2',/" -i build/mongodl.py # This is breaking on a container-based build
sed "/'2': 'amazon2',/a\ \ \ \ \ \ '2022': 'amazon2',\n\ \ \ \ \ \ '2023': 'amazon2'," -i build/mongodl.py
mkdir cmake-build
cd cmake-build
cmake -DENABLE_AUTOMATIC_INIT_AND_CLEANUP=OFF ..
cmake --build .
sudo cmake --build . --target install
# sudo /usr/local/share/mongo-c-driver/uninstall.sh
sudo ldconfig
