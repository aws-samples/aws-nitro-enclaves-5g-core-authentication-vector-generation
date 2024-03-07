# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
mkdir -p ~/src && cd ~/src
#git clone codecommit::eu-central-1://open5gs open5gs.git
git clone https://github.com/open5gs/open5gs.git open5gs.git
cd open5gs.git
#git switch open5gs-github-main
git checkout 84ed9a0
mkdir patches
cp -r ~/src/patches/* patches/
git am --whitespace=fix patches/20230810-84ed9a0/*
meson build --prefix=/usr/local/enclave/ --localstatedir=/var
ninja -C build
# Installing open5gs is optional
cd ~/src
cd open5gs.git/build
sudo ninja install
