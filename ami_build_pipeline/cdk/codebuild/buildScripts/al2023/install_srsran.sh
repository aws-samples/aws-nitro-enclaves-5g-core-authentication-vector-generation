#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
mkdir -p ~/src && cd ~/src
sudo dnf install -y tar cmake fftw-devel lksctp-tools-devel libconfig-devel boost-devel gtest-devel gtest yaml-cpp-devel yaml-cpp libunwind-devel
ZMQ_VERSION=4.3.4
wget https://github.com/zeromq/libzmq/releases/download/v${ZMQ_VERSION}/zeromq-${ZMQ_VERSION}.tar.gz
tar xfz zeromq-${ZMQ_VERSION}.tar.gz
cd zeromq-${ZMQ_VERSION}
./configure
make -j 4
sudo make install
sudo ldconfig
cd ~/src
# mbedtls
MBED_VERSION=3.2.1
wget https://github.com/Mbed-TLS/mbedtls/archive/refs/tags/v${MBED_VERSION}.tar.gz
mv v${MBED_VERSION}.tar.gz mbedtls-v${MBED_VERSION}.tar.gz 
tar xfz mbedtls-v${MBED_VERSION}.tar.gz
cd mbedtls-${MBED_VERSION}/
make -j4
sudo make install
sudo ldconfig
# https://docs.srsran.com/en/latest/general/source/1_installation.html#installation-from-source
cd ~/src
#git clone https://github.com/srsRAN/srsRAN.git srsRAN.git
#cd srsRAN.git
git clone https://github.com/srsran/srsRAN_Project.git srsRAN_Project.git
cd srsRAN_Project.git
mkdir build
cd build
cmake ../
make -j4
#make test
sudo make install
#sudo srsran_install_configs.sh service # Only for 4G version
